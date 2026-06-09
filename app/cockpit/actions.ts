'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import type {
  ActionContext,
  ActionItemWithCandidate,
  EmailTemplate,
  JobDescription,
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
    /funnel_stage|prep_sent|action_items|relationship/i.test(error?.message ?? '')
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

// Flip prep_sent (amber → green on the timeline) once interview prep is emailed.
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
