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
// We identify "Corey" from the webhook action's target member. Most reliable is
// a Trello member id or username supplied via env; if neither is set we fall
// back to matching the full name. Configure in Vercel to pin it exactly:
//   TRELLO_MEMBER_ID=<your trello member id>      (best)
//   TRELLO_MEMBER_USERNAME=<your trello username>
const WANT_ID = process.env.TRELLO_MEMBER_ID?.trim() || null;
const WANT_USERNAME = process.env.TRELLO_MEMBER_USERNAME?.trim().toLowerCase() || null;
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

  if (WANT_ID && id === WANT_ID) return true;
  if (WANT_USERNAME && username && username === WANT_USERNAME) return true;

  // Name fallback only when no precise id/username is configured.
  if (!WANT_ID && !WANT_USERNAME && fullName) {
    // Tolerate "corey demberg" in any order / with extra parts.
    const parts = WANT_NAME.split(/\s+/).filter(Boolean);
    return parts.every((p) => fullName.includes(p));
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

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
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
    return NextResponse.json({ success: true });
  }

  // Note: plain `createCard` is intentionally NOT handled anymore. A freshly
  // created card has no members, so it must wait for Corey to be added before it
  // enters the cockpit. This is what keeps unassigned / other-people's cards out.
  return NextResponse.json({ success: true });
}
