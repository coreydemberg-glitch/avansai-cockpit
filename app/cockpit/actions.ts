'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import type { EmailTemplate, JobDescription } from './types';

export type ActionResult = { ok: boolean; error?: string };

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

// Persist a candidate's LinkedIn URL (manual entry).
export async function saveLinkedin(
  id: string,
  url: string
): Promise<ActionResult> {
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
