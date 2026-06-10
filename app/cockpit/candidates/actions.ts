'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import type { ActionItem } from '../types';

// Candidates-hub to-do scoping (Candidates Hub build §5). The hub's to-do list
// reuses the existing `action_items` table and the `manual` type — no migration.
// It's distinguished from the cockpit-home free-text to-dos purely by
// candidate_id: hub to-dos always carry the candidate they were raised for
// (candidate_id NOT NULL), home's free-text to-dos never do (candidate_id NULL).
// So the hub list is `type='manual' AND status='open' AND candidate_id NOT NULL`,
// while the home master list keeps showing ALL manual to-dos (both).
//
// The partial unique index action_items_one_open_per_type (candidate_id, type)
// WHERE status='open' (0002) gives free per-candidate dedup: at most one open
// hub to-do per candidate. NULL candidate_id rows are distinct, so home's
// free-text to-dos are unaffected. A re-fired insert returns 23505, which we
// treat as a harmless no-op (the open to-do already exists) — same convention as
// the Trello webhook's action_items inserts.

// True when the funnel schema (0002/0005) isn't applied yet, so the hub to-do
// reads/writes no-op cleanly instead of surfacing an error. Mirrors the guard in
// app/cockpit/funnel/actionItemActions.ts.
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

// Open candidate-hub to-dos (manual + candidate-scoped), newest first. Returns []
// (not an error) when the schema isn't applied yet, so the panel still renders.
export async function listCandidateTodos(): Promise<{
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
    .not('candidate_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingFunnelSchema(error)) return { ok: true, items: [] };
    return { ok: false, items: [], error: error.message };
  }
  return { ok: true, items: (data ?? []) as ActionItem[] };
}

// Create (or affirm) the single open candidate-hub to-do for a candidate. A
// 23505 unique-violation means the open to-do already exists — treated as
// success so the green-arrow capture and the auto signal stay idempotent.
export async function addCandidateTodo(
  candidateId: string,
  title: string
): Promise<{ ok: boolean; item?: ActionItem; error?: string }> {
  const trimmed = title.trim();
  if (!candidateId || !trimmed) {
    return { ok: false, error: 'candidate and to-do text are required.' };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('action_items')
    .insert({
      candidate_id: candidateId,
      type: 'manual',
      title: trimmed,
      status: 'open',
    })
    .select('*')
    .single();

  if (error) {
    // 23505 = one open hub to-do per candidate already exists → no-op success.
    if (error.code === '23505') return { ok: true };
    if (isMissingFunnelSchema(error)) return { ok: true };
    return { ok: false, error: error.message };
  }

  revalidatePath('/cockpit');
  return { ok: true, item: data as ActionItem };
}

// §3 signal: ensure a BOLD hub to-do exists for every candidate that has a saved
// note or résumé on file. Idempotent (23505 ignored per candidate). Fired once
// when the hub mounts. Deleting a signal to-do dismisses it until the next mount.
export async function ensureCandidateSignalTodos(
  items: { candidateId: string; title: string }[]
): Promise<{ ok: boolean }> {
  if (!items.length) return { ok: true };
  const supabase = getSupabaseAdmin();
  let created = false;
  for (const { candidateId, title } of items) {
    if (!candidateId || !title.trim()) continue;
    const { error } = await supabase.from('action_items').insert({
      candidate_id: candidateId,
      type: 'manual',
      title: title.trim(),
      status: 'open',
    });
    // 23505 (already signalled) and a missing schema are both fine to ignore.
    if (!error) created = true;
    else if (error.code !== '23505' && !isMissingFunnelSchema(error)) {
      console.error('ensureCandidateSignalTodos insert failed:', error);
    }
  }
  if (created) revalidatePath('/cockpit');
  return { ok: true };
}
