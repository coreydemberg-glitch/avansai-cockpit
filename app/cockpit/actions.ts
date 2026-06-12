'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import type {
  ActionContext,
  ActionItemWithCandidate,
  EmailTemplate,
  JobDescription,
  PrepMaterial,
} from './types';

export type ActionResult = { ok: boolean; error?: string };

// True when the funnel schema (0002 migration) isn't applied yet, so the funnel
// reads/writes can no-op cleanly instead of surfacing an error to the recruiter.
function isMissingFunnelSchema(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error?.code === '42703' ||
    error?.code === '42P01' ||
    error?.code === 'PGRST204' ||
    error?.code === 'PGRST205' ||
    /funnel_stage|prep_sent|action_items|prep_materials|relationship/i.test(error?.message ?? '')
  );
}

// Persist edited notes for a candidate. Uses the service-role client so it
// works regardless of RLS policies.
export async function saveNotes(
  id: string,
  notes: string
): Promise<ActionResult> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('candidates')
    .update({ notes })
    .eq('id', id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/cockpit');
  return { ok: true };
}

// Persist the AI-cleaned candidate summary (right panel of the notes studio)
// into the `notes_clean` column (0008). Kept separate from raw `notes` so the
// To-Do copy module can lift the clean version. No-ops cleanly (ok:true) when
// the column isn't migrated yet, so the studio's live cleaning still works
// in-memory — only persistence (and the later copy) waits on 0008.
export async function saveCleanNotes(
  id: string,
  notesClean: string
): Promise<ActionResult> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('candidates')
    .update({ notes_clean: notesClean })
    .eq('id', id);

  if (error) {
    if (isMissingFunnelSchema(error)) return { ok: true };
    return { ok: false, error: error.message };
  }

  revalidatePath('/cockpit');
  return { ok: true };
}

// Link a candidate to a Bullhorn record id (0008) — powers the card's Bullhorn
// deep-link button. Pass '' to unlink. No-ops cleanly when the column isn't
// migrated yet (same convention as the funnel columns).
export async function saveBullhornId(
  id: string,
  bullhornId: string
): Promise<ActionResult> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('candidates')
    .update({ bullhorn_id: bullhornId.trim() || null })
    .eq('id', id);

  if (error) {
    if (isMissingFunnelSchema(error)) return { ok: true };
    return { ok: false, error: error.message };
  }

  revalidatePath('/cockpit');
  return { ok: true };
}

// List every job description, alphabetised for the email panel's picker.
// Re-fetched by the client after a new JD is uploaded so it appears immediately.
export async function listJobDescriptions(): Promise<{
  ok: boolean;
  jobs: JobDescription[];
  error?: string;
}> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('job_descriptions')
    .select('id, title, file_path, created_at')
    .order('title', { ascending: true });

  if (error) {
    return { ok: false, jobs: [], error: error.message };
  }
  return { ok: true, jobs: (data ?? []) as JobDescription[] };
}

// Fetch a reusable email template by key. Called when the email panel opens so
// edits made in Supabase take effect without a code change.
export async function getEmailTemplate(
  key = 'candidate_follow_up'
): Promise<{ ok: boolean; template?: EmailTemplate; error?: string }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('email_templates')
    .select('id, key, subject, greeting, body')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: `No email template found for key "${key}".` };
  }
  return { ok: true, template: data as EmailTemplate };
}

// Archive (hide) or restore a candidate in the cockpit. This only flips a flag
// on the Supabase row — it never touches Trello. Reversible: pass archived=false
// to bring it back.
export async function setCandidateArchived(
  id: string,
  archived: boolean
): Promise<ActionResult> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('candidates')
    .update({ archived })
    .eq('id', id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/cockpit');
  return { ok: true };
}

// ── Funnel: action items + state writes (build spec §4/§5/§6) ─────────────

// Open to-dos for the action panel, joined to their candidate. Returns [] (not
// an error) when the funnel schema isn't applied yet, so the page still renders.
export async function listActionItems(): Promise<{
  ok: boolean;
  items: ActionItemWithCandidate[];
  error?: string;
}> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('action_items')
    .select('id, candidate_id, type, status, created_at, candidate:candidates(*)')
    .eq('status', 'open')
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingFunnelSchema(error)) return { ok: true, items: [] };
    return { ok: false, items: [], error: error.message };
  }
  // PostgREST embeds the to-one candidate as an object; normalize just in case,
  // and drop items whose candidate is archived (hidden from the cockpit) or
  // missing, so the panel agrees with the funnel/DQ surfaces (which show active rows).
  const items = (data ?? [])
    .map((r: any) => ({
      ...r,
      candidate: Array.isArray(r.candidate)
        ? r.candidate[0] ?? null
        : r.candidate,
    }))
    .filter((it: any) => it.candidate && !it.candidate.archived) as ActionItemWithCandidate[];
  return { ok: true, items };
}

// Mark the open action item of a given type done for a candidate (called after
// the matching email is sent / feedback is saved). Idempotent.
export async function closeActionItem(
  candidateId: string,
  type: ActionContext
): Promise<ActionResult> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('action_items')
    .update({ status: 'done' })
    .eq('candidate_id', candidateId)
    .eq('type', type)
    .eq('status', 'open');

  if (error && !isMissingFunnelSchema(error)) {
    return { ok: false, error: error.message };
  }
  revalidatePath('/cockpit');
  return { ok: true };
}

// Flip prep_sent (red → green laser on the timeline) once interview prep is emailed.
export async function setPrepSent(
  candidateId: string,
  prepSent: boolean
): Promise<ActionResult> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('candidates')
    .update({ prep_sent: prepSent })
    .eq('id', candidateId);

  if (error && !isMissingFunnelSchema(error)) {
    return { ok: false, error: error.message };
  }
  revalidatePath('/cockpit');
  return { ok: true };
}

// Persist a slider move (8-stage build §3/§4). The slider value decomposes into
// funnel_stage (1..8), pending (on a half-step), and prep_sent (prep emailed at
// that half-step). Debounced on the client; this just writes last-write-wins.
//
// `degraded` is returned (with ok:true) when the write hits the pre-migration
// 1..5 CHECK constraint (code 23514) for a stage 6–8, or the funnel columns are
// absent — so the UI keeps its optimistic state and stays smooth. Run the 0006
// migration to make stages 6–8 persist. (See the placeholder report.)
export async function setFunnelStage(
  candidateId: string,
  state: { funnel_stage: number; pending: boolean; prep_sent: boolean }
): Promise<ActionResult & { degraded?: boolean }> {
  const supabase = getSupabaseAdmin();
  const funnel_stage = Math.min(8, Math.max(1, Math.round(state.funnel_stage)));
  const { error } = await supabase
    .from('candidates')
    .update({ funnel_stage, pending: state.pending, prep_sent: state.prep_sent })
    .eq('id', candidateId);

  if (error) {
    // 23514 = check_violation (the 1..5 constraint hasn't been widened to 1..8).
    if (error.code === '23514' || isMissingFunnelSchema(error)) {
      console.warn(
        `setFunnelStage degraded for ${candidateId} (stage ${funnel_stage}): ${error.message}. Run 0006_funnel_8stage.sql.`
      );
      return { ok: true, degraded: true };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath('/cockpit');
  return { ok: true };
}

// Prep materials for the Prep modal's doc picker (0006 migration). No-ops to []
// when the table isn't present yet, so the modal still renders (JD-only).
export async function listPrepMaterials(): Promise<{
  ok: boolean;
  materials: PrepMaterial[];
  error?: string;
}> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('prep_materials')
    .select('id, title, stage, file_path, created_at')
    .order('title', { ascending: true });

  if (error) {
    if (isMissingFunnelSchema(error)) return { ok: true, materials: [] };
    return { ok: false, materials: [], error: error.message };
  }
  return { ok: true, materials: (data ?? []) as PrepMaterial[] };
}

// Accrue structured interview feedback into the candidate's file (spec §6). No
// new column per §4 ("nothing else"), so we append a timestamped block to notes
// — preserving prior content so account intelligence builds up over time.
export async function saveFeedback(
  candidateId: string,
  structured: string
): Promise<ActionResult> {
  const supabase = getSupabaseAdmin();
  const { data, error: readErr } = await supabase
    .from('candidates')
    .select('notes')
    .eq('id', candidateId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  const stamp = new Date().toISOString().slice(0, 10);
  const block = `--- Interview feedback (${stamp}) ---\n${structured.trim()}`;
  const prior = (data?.notes ?? '').trim();
  const notes = prior ? `${prior}\n\n${block}` : block;

  const { error } = await supabase
    .from('candidates')
    .update({ notes })
    .eq('id', candidateId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/cockpit');
  return { ok: true };
}

// Persist a candidate's LinkedIn URL (manual entry).
export async function saveLinkedin(
  id: string,
  url: string
): Promise<ActionResult> {
  // Reject non-http(s) URLs so a javascript:/data: payload can't be stored and
  // later rendered into an href (defense in depth with the render-side guard).
  if (url && !/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'URL must start with http:// or https://' };
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('candidates')
    .update({ linkedin_url: url || null })
    .eq('id', id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/cockpit');
  return { ok: true };
}
