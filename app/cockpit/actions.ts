'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

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
