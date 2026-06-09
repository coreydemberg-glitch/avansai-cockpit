import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable'
  );
}

// Service-role client: bypasses RLS, server-side only. Never expose this key.
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

// Pull the first LinkedIn URL out of free text (card description), if any.
// Matches both /in/ profiles and /talent/ recruiter links.
function extractLinkedin(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const m = text.match(/https?:\/\/(?:[a-z0-9-]+\.)?linkedin\.com\/[^\s)]+/i);
  return m ? m[0] : null;
}

// Membership gate: a card only belongs in the cockpit when Corey is a member.
// We identify "Corey" from the webhook action's target member, matching on (in
// priority order) Trello member id → username → full name. The id is pinned by
// default below — it's immutable, so the match survives a rename. Each can be
// overridden via env (TRELLO_MEMBER_ID / _USERNAME / _NAME) without a code change.
const WANT_ID = process.env.TRELLO_MEMBER_ID?.trim() || '5e024a57b973f7014fc03e63';
const WANT_USERNAME = (
  process.env.TRELLO_MEMBER_USERNAME?.trim() || 'coreydemberg'
).toLowerCase();
const WANT_NAME = (process.env.TRELLO_MEMBER_NAME?.trim() || 'Corey Demberg').toLowerCase();

// Decide whether the member affected by a member-add/-remove action is Corey.
function actionTargetsCorey(action: any): boolean {
  const m = action?.member ?? {};
  const id: string | undefined = m.id ?? action?.data?.idMember;
  const username: string = (m.username ?? '').toLowerCase();
  const fullName: string = (
    m.fullName ??
    action?.data?.member?.name ??
    ''
  ).toLowerCase();

  if (WANT_ID && id && id === WANT_ID) return true;
  if (WANT_USERNAME && username && username === WANT_USERNAME) return true;

  // Name as a last-resort signal (some action variants carry only fullName).
  if (WANT_NAME && fullName) {
    // Tolerate "corey demberg" in any order / with extra parts.
    const parts = WANT_NAME.split(/\s+/).filter(Boolean);
    if (parts.length && parts.every((p) => fullName.includes(p))) return true;
  }
  return false;
}

// Upsert a candidate, tolerating a DB that hasn't had the `archived` column
// added yet: if PostgREST rejects the unknown column, retry without it and warn.
async function upsertCandidate(row: Record<string, unknown>) {
  let { error } = await supabase
    .from('candidates')
    .upsert(row, { onConflict: 'trello_card_id' });

  if (error && isMissingArchivedColumn(error)) {
    console.warn(
      'candidates.archived column missing — upserting without it. Run: ' +
        'ALTER TABLE candidates ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;'
    );
    const { archived: _omit, ...rest } = row;
    ({ error } = await supabase
      .from('candidates')
      .upsert(rest, { onConflict: 'trello_card_id' }));
  }
  return error;
}

function isMissingArchivedColumn(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    /archived/i.test(error?.message ?? '')
  );
}

// ── Funnel timeline (build spec §3/§4) ────────────────────────────────────
// Stage advancement is driven by the candidate's Trello column. We map the
// column name → funnel state and the action it surfaces, then mirror that onto
// the candidate row + the action_items table the funnel panel reads from.

type FunnelEntry = {
  // Omit `stage` to leave funnel_stage unchanged (e.g. DQ keeps the stage the
  // candidate exited from; it just flips the `dq` flag).
  stage?: number;
  pending: boolean;
  dq: boolean;
  // The to-do surfaced when a candidate enters this column, if any. `prep` also
  // re-arms the amber segment (prep_sent → false) since new prep is owed.
  action?: 'prep' | 'feedback' | 'thankyou';
  // The day-of-week interview columns are reused across rounds. When true,
  // syncFunnel resolves the stage at runtime from feedback history: no R1 feedback
  // captured yet → stage 3 (R1), R1 feedback already logged → stage 4 (R2 / manager).
  // `stage` above is the nominal default (R2) used when history can't be read.
  disambiguateByFeedback?: boolean;
};

// Trello list name (lower-cased, trimmed) → funnel state. Names per spec §3 —
// edit HERE if the board's columns are renamed. Identified + Call Schedule
// intentionally collapse into one cockpit stage. Stage 1's job-description email
// is the existing manual Step-1 flow, so it surfaces no auto action item.
const LIST_TO_FUNNEL: Record<string, FunnelEntry> = {
  identified: { stage: 1, pending: false, dq: false },
  'call schedule': { stage: 1, pending: false, dq: false },
  presented: { stage: 2, pending: false, dq: false, action: 'prep' }, // R1 interview prep
  pending: { stage: 2, pending: true, dq: false, action: 'feedback' }, // capture R1 feedback
  // Day-of-week interview columns → the manager round (R2 / stage 4) by default, but
  // reused for R1 too, so disambiguate by whether R1 feedback was logged (see
  // syncFunnel). They surface R2/manager prep on entry.
  mon: { stage: 4, pending: false, dq: false, action: 'prep', disambiguateByFeedback: true },
  tue: { stage: 4, pending: false, dq: false, action: 'prep', disambiguateByFeedback: true },
  wed: { stage: 4, pending: false, dq: false, action: 'prep', disambiguateByFeedback: true },
  thu: { stage: 4, pending: false, dq: false, action: 'prep', disambiguateByFeedback: true },
  fri: { stage: 4, pending: false, dq: false, action: 'prep', disambiguateByFeedback: true },
  dq: { pending: false, dq: true, action: 'thankyou' }, // thank-you email
};

// The list a card is in. List moves arrive as updateCard with listAfter; other
// actions (member add, content edits) carry the current list as `list`.
function listNameFromAction(action: any): string | null {
  const name: unknown =
    action?.data?.listAfter?.name ?? action?.data?.list?.name;
  return typeof name === 'string' && name.trim() ? name : null;
}

// True when the funnel columns / action_items table aren't present yet (i.e. the
// 0002 migration hasn't been run). Lets the webhook keep 200-ing pre-migration.
function isMissingFunnelSchema(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error?.code === '42703' || // undefined_column
    error?.code === '42P01' || // undefined_table
    error?.code === 'PGRST204' || // column not found (schema cache)
    error?.code === 'PGRST205' || // table not found (schema cache)
    // Only match qualified schema-object tokens — the SQLSTATE codes above cover
    // missing column/table. (Deliberately NOT \bpending\b/\bdq\b: those are real
    // column names, so a genuine NOT-NULL/check violation must not be swallowed.)
    /funnel_stage|prep_sent|action_items/i.test(error?.message ?? '')
  );
}

// Best-effort: mirror a card's Trello column onto its candidate row + ensure the
// matching open action item exists. Never throws — a DB that hasn't had the 0002
// migration applied just logs a warning so the webhook still returns 200 (Trello
// retries non-2xx). No-ops for unmapped columns and cards not in the cockpit.
async function syncFunnel(cardId: string, listName: string | null) {
  if (!cardId || !listName) return;
  const entry = LIST_TO_FUNNEL[listName.trim().toLowerCase()];
  if (!entry) return; // column not part of the funnel → leave state untouched

  // Resolve the candidate this card belongs to. We also read `notes`, where logged
  // interview feedback is accrued (see actions.ts saveFeedback), so we can
  // disambiguate the reused day-of-week interview columns below.
  const { data: cand, error: findErr } = await supabase
    .from('candidates')
    .select('id, notes')
    .eq('trello_card_id', cardId)
    .maybeSingle();

  if (findErr) {
    if (isMissingFunnelSchema(findErr)) {
      console.warn(
        'Funnel columns missing — skipping funnel sync. Run supabase/migrations/0002_funnel.sql'
      );
      return;
    }
    console.error('Funnel sync failed (candidate lookup):', findErr);
    return;
  }
  if (!cand?.id) return; // card isn't in the cockpit (no matching candidate)

  // Resolve the stage. Day-of-week columns are reused across rounds, so when the
  // entry asks for it, choose R1 (stage 3) vs R2 (stage 4) from whether R1 feedback
  // was actually captured. We key off saved feedback CONTENT (the marker saveFeedback
  // writes into notes), NOT the feedback action item's status — the latter is also
  // flipped to 'done' when a card skips Pending, so it can't tell a logged round from
  // a skipped one (e.g. a Mon→Tue reschedule must stay R1, not jump to R2).
  let stage = entry.stage;
  if (entry.disambiguateByFeedback) {
    const r1FeedbackCaptured = /--- Interview feedback/i.test(cand.notes ?? '');
    stage = r1FeedbackCaptured ? 4 : 3;
  }

  const patch: Record<string, unknown> = {
    pending: entry.pending,
    dq: entry.dq,
  };
  if (stage != null) patch.funnel_stage = stage;
  // Entering a prep stage re-arms the amber segment; a new prep is owed.
  if (entry.action === 'prep') patch.prep_sent = false;

  const { error } = await supabase
    .from('candidates')
    .update(patch)
    .eq('id', cand.id);

  if (error) {
    if (isMissingFunnelSchema(error)) {
      console.warn(
        'Funnel columns missing — skipping funnel sync. Run supabase/migrations/0002_funnel.sql'
      );
      return;
    }
    console.error('Funnel sync failed:', error);
    return;
  }

  if (entry.action) {
    // Trello moves are self-reconciling: the new column owns exactly one action
    // type, so retire the candidate's open items of OTHER types first. This keeps
    // the action panel and the funnel/DQ view in agreement across transitions —
    // e.g. Pending→Mon clears the stale 'feedback' item, any→DQ clears prep/feedback
    // (leaving only 'thankyou'), and DQ→Presented clears the old 'thankyou'.
    const stale = (['prep', 'feedback', 'thankyou'] as const).filter(
      (t) => t !== entry.action
    );
    const { error: closeErr } = await supabase
      .from('action_items')
      .update({ status: 'done' })
      .eq('candidate_id', cand.id)
      .in('type', stale)
      .eq('status', 'open');
    if (closeErr && !isMissingFunnelSchema(closeErr)) {
      console.error('Failed to close superseded action items:', closeErr);
    }

    // Insert the to-do; the partial unique index keeps at most one OPEN item per
    // (candidate, type), so a re-fired move is a harmless no-op (23505 ignored).
    const { error: aiErr } = await supabase
      .from('action_items')
      .insert({ candidate_id: cand.id, type: entry.action, status: 'open' });
    if (aiErr && aiErr.code !== '23505') {
      if (isMissingFunnelSchema(aiErr)) {
        console.warn(
          'action_items table missing — skipping. Run supabase/migrations/0002_funnel.sql'
        );
      } else {
        console.error('Failed to insert action item:', aiErr);
      }
    }
  }
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(req: NextRequest) {
  // Tolerate empty / non-JSON bodies (probes, verification pings): return 2xx so
  // Trello doesn't retry a body it can never parse, matching this route's
  // always-2xx webhook convention.
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: true, skipped: 'no-body' });
  }
  const action = body?.action;
  const type: string | undefined = action?.type;

  // Corey added to a card → the card belongs in the cockpit. Create it (or
  // un-hide it if it was previously archived when he was removed). New cards
  // start with no members, so THIS — not createCard — is the real trigger.
  if (type === 'addMemberToCard') {
    if (!actionTargetsCorey(action)) {
      // A different teammate was added — ignore; their cards aren't ours.
      return NextResponse.json({ success: true, skipped: 'not-target-member' });
    }

    const card = action.data.card;
    const linkedin = extractLinkedin(card?.desc);

    const row: Record<string, unknown> = {
      name: card?.name,
      trello_card_id: card?.id,
      archived: false, // ensure re-adding un-hides a previously hidden card
    };
    if (linkedin) row.linkedin_url = linkedin;

    const error = await upsertCandidate(row);
    if (error) {
      console.error('Failed to add candidate on addMemberToCard:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
    // Place the candidate on the funnel from whichever column the card sits in.
    await syncFunnel(card?.id, listNameFromAction(action));
    return NextResponse.json({ success: true });
  }

  // Corey removed from a card → hide it from the cockpit (recoverable: the row
  // stays in the DB, just flagged archived).
  if (type === 'removeMemberFromCard') {
    if (!actionTargetsCorey(action)) {
      return NextResponse.json({ success: true, skipped: 'not-target-member' });
    }

    const card = action.data.card;
    const { error } = await supabase
      .from('candidates')
      .update({ archived: true })
      .eq('trello_card_id', card?.id);

    if (error) {
      if (isMissingArchivedColumn(error)) {
        console.warn(
          'candidates.archived column missing — cannot hide card yet. Run: ' +
            'ALTER TABLE candidates ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;'
        );
        return NextResponse.json({ success: true, warning: 'archived-column-missing' });
      }
      console.error('Failed to hide candidate on removeMemberFromCard:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  }

  // Card edited → if the description now contains a LinkedIn URL, sync it onto
  // the matching candidate. (No-op if the card isn't in the cockpit yet.)
  if (type === 'updateCard') {
    const card = action.data.card;
    const linkedin = extractLinkedin(card?.desc);
    if (linkedin) {
      const { error } = await supabase
        .from('candidates')
        .update({ linkedin_url: linkedin })
        .eq('trello_card_id', card.id);
      if (error) {
        console.error('Failed to update linkedin_url:', error);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }
    }
    // A column move (data.listAfter) advances the candidate along the funnel;
    // no-ops for content-only edits and cards not in the cockpit.
    await syncFunnel(card?.id, listNameFromAction(action));
    return NextResponse.json({ success: true });
  }

  // Note: plain `createCard` is intentionally NOT handled anymore. A freshly
  // created card has no members, so it must wait for Corey to be added before it
  // enters the cockpit. This is what keeps unassigned / other-people's cards out.
  return NextResponse.json({ success: true });
}
