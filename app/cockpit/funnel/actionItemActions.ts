'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import type { ActionItem } from '../types';

// True when the funnel schema (0002/0005 migrations) isn't applied yet, so the
// manual-to-do reads/writes no-op cleanly instead of surfacing an error. Mirrors
// isMissingFunnelSchema in app/cockpit/actions.ts (also matches a missing
// `title` column from before 0005).
function isMissingFunnelSchema(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error?.code === '42703' ||
    error?.code === '42P01' ||
    error?.code === 'PGRST204' ||
    error?.code === 'PGRST205' ||
    /funnel_stage|prep_sent|action_items|relationship|title/i.test(
      error?.message ?? ''
    )
  );
}

// Open manual to-dos for the cockpit-home sidebar, newest first. Returns [] (not
// an error) when the schema isn't applied yet, so the panel still renders.
//
// Scoped to candidate-LESS rows (candidate_id IS NULL): these are the recruiter's
// free-text home reminders. The Candidates hub raises its own manual to-dos WITH
// a candidate_id (see app/cockpit/candidates/actions.ts), and those belong only
// in the hub rail — excluding them here keeps the home command-center list from
// being flooded by per-candidate note/résumé signals. `.is(... , null)` (not
// `.eq`) is the correct PostgREST predicate for SQL NULL.
export async function listManualActionItems(): Promise<{
  ok: boolean;
  items: ActionItem[];
  error?: string;
}> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('action_items')
    .select('*')
    .eq('type', 'manual')
    .eq('status', 'open')
    .is('candidate_id', null)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingFunnelSchema(error)) return { ok: true, items: [] };
    return { ok: false, items: [], error: error.message };
  }
  return { ok: true, items: (data ?? []) as ActionItem[] };
}

// Create a manual to-do from the sidebar's free-text input. Trims and rejects
// empty titles; returns the inserted row so the client can replace its optimistic
// placeholder with the real id.
export async function addManualActionItem(
  title: string
): Promise<{ ok: boolean; item?: ActionItem; error?: string }> {
  const trimmed = title.trim();
  if (!trimmed) {
    return { ok: false, error: 'To-do text is required.' };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('action_items')
    .insert({ type: 'manual', title: trimmed, status: 'open' })
    .select('*')
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/cockpit');
  return { ok: true, item: data as ActionItem };
}

// Hard-delete an action item by id (the sidebar's ✕ removes manual to-dos
// outright rather than marking them done).
export async function removeActionItem(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('action_items').delete().eq('id', id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/cockpit');
  return { ok: true };
}
