'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import type { ActionResult } from '../actions';
import type {
  Contact,
  ContactListType,
  ContactNote,
  ContactWorkHistory,
  Referral,
} from '../types';

// True when the 0003 outreach schema isn't applied yet, so reads can no-op
// cleanly (return empty) and the cockpit still renders before the migration runs
// — mirrors isMissingFunnelSchema in ../actions.
function isMissingOutreachSchema(error: { code?: string; message?: string }): boolean {
  return (
    error?.code === '42703' ||
    error?.code === '42P01' ||
    error?.code === 'PGRST204' ||
    error?.code === 'PGRST205' ||
    /contacts|contact_work_history|contact_notes|referrals/i.test(error?.message ?? '')
  );
}

// ── Contacts ────────────────────────────────────────────────────────────────

export async function listContacts(
  listType: ContactListType
): Promise<{ ok: boolean; contacts: Contact[]; error?: string }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('list_type', listType)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingOutreachSchema(error)) return { ok: true, contacts: [] };
    return { ok: false, contacts: [], error: error.message };
  }
  return { ok: true, contacts: (data ?? []) as Contact[] };
}

export async function setContactArchived(
  id: string,
  archived: boolean
): Promise<ActionResult> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('contacts')
    .update({ archived, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/cockpit');
  return { ok: true };
}

// Retry enrichment for a single contact (e.g. a missing-email row). Placeholder:
// re-runs the no-op enrich, so it only refreshes email_status today.
// TODO(apollo): call the real Apollo REST enrichment here once a key exists
// (see app/lib/enrich.ts) and flip enrichment_status to 'enriched'/'failed'.
export async function retryEnrichContact(id: string): Promise<ActionResult> {
  const supabase = getSupabaseAdmin();
  const { data, error: readErr } = await supabase
    .from('contacts')
    .select('email')
    .eq('id', id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  const email = (data?.email ?? '') as string;
  const email_status = /.+@.+\..+/.test(email) ? 'ok' : 'missing';
  const { error } = await supabase
    .from('contacts')
    .update({ email_status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/cockpit');
  return { ok: true };
}

// ── Notes (timestamped; bumps last_contacted_at) ────────────────────────────

export async function listContactNotes(
  contactId: string
): Promise<{ ok: boolean; notes: ContactNote[]; error?: string }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('contact_notes')
    .select('id, contact_id, body, created_at')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissingOutreachSchema(error)) return { ok: true, notes: [] };
    return { ok: false, notes: [], error: error.message };
  }
  return { ok: true, notes: (data ?? []) as ContactNote[] };
}

export async function addContactNote(
  contactId: string,
  body: string
): Promise<ActionResult> {
  const text = body.trim();
  if (!text) return { ok: false, error: 'Note is empty.' };
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('contact_notes')
    .insert({ contact_id: contactId, body: text });
  if (error) return { ok: false, error: error.message };
  // A note counts as contact → bump the "Date last contacted" column. Best-effort:
  // the note (the primary write) already succeeded, so a failed timestamp bump is
  // logged, not surfaced as an error (it self-heals on the next contact event).
  const { error: bumpErr } = await supabase
    .from('contacts')
    .update({ last_contacted_at: now, updated_at: now })
    .eq('id', contactId);
  if (bumpErr) {
    console.error('addContactNote: note saved but last_contacted_at bump failed', bumpErr.message);
  }
  revalidatePath('/cockpit');
  return { ok: true };
}

// ── Structured work history ─────────────────────────────────────────────────

export async function listWorkHistory(
  contactId: string
): Promise<{ ok: boolean; history: ContactWorkHistory[]; error?: string }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('contact_work_history')
    .select('id, contact_id, company, company_normalized, title, start_date, end_date, is_current, source, created_at')
    .eq('contact_id', contactId)
    .order('is_current', { ascending: false })
    .order('end_date', { ascending: false, nullsFirst: true });
  if (error) {
    if (isMissingOutreachSchema(error)) return { ok: true, history: [] };
    return { ok: false, history: [], error: error.message };
  }
  return { ok: true, history: (data ?? []) as ContactWorkHistory[] };
}

export async function addWorkHistory(
  contactId: string,
  entry: {
    company: string;
    title?: string;
    start_date?: string;
    end_date?: string;
    is_current?: boolean;
    source?: ContactWorkHistory['source'];
  }
): Promise<ActionResult> {
  const company = entry.company.trim();
  if (!company) return { ok: false, error: 'Company is required.' };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('contact_work_history').insert({
    contact_id: contactId,
    company,
    title: entry.title?.trim() || null,
    start_date: entry.start_date || null,
    end_date: entry.end_date || null,
    is_current: entry.is_current ?? false,
    source: entry.source ?? 'manual',
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/cockpit');
  return { ok: true };
}

// Future-query PROOF: "who in my network worked at [Company]?" The search UI is
// later, but the data model already supports it as a single indexed lookup. This
// action is wired now so the schema is verifiably correct.
export async function findNetworkByCompany(
  company: string
): Promise<{ ok: boolean; contacts: Contact[]; error?: string }> {
  const normalized = company.trim().toLowerCase();
  if (!normalized) return { ok: true, contacts: [] };
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('contact_work_history')
    .select('contact:contacts(*)')
    .eq('company_normalized', normalized);
  if (error) {
    if (isMissingOutreachSchema(error)) return { ok: true, contacts: [] };
    return { ok: false, contacts: [], error: error.message };
  }
  // A contact can have multiple work-history rows for the same company (rejoined,
  // or duplicate multi-source ingests), so dedupe by contact id.
  const seen = new Set<string>();
  const contacts = (data ?? [])
    .map((r: any) => (Array.isArray(r.contact) ? r.contact[0] ?? null : r.contact))
    .filter(Boolean)
    .filter((c: Contact) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    }) as Contact[];
  return { ok: true, contacts };
}

// ── Referrals ───────────────────────────────────────────────────────────────

export async function listReferrals(
  contactId: string
): Promise<{ ok: boolean; referrals: Referral[]; error?: string }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('referrals')
    .select('id, referrer_contact_id, referred_contact_id, referred_name, note, created_at')
    .eq('referrer_contact_id', contactId)
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissingOutreachSchema(error)) return { ok: true, referrals: [] };
    return { ok: false, referrals: [], error: error.message };
  }
  return { ok: true, referrals: (data ?? []) as Referral[] };
}

export async function addReferral(
  referrerContactId: string,
  referredName: string,
  note?: string
): Promise<ActionResult> {
  const name = referredName.trim();
  if (!name) return { ok: false, error: 'Referred name is required.' };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('referrals').insert({
    referrer_contact_id: referrerContactId,
    referred_name: name,
    note: note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/cockpit');
  return { ok: true };
}

// Referral counts grouped by referrer, for the Referral list's "Referrals"
// column (avoids an N+1 of per-row queries).
// TODO(scale): this fetches all referral rows and aggregates in memory; PostgREST
// silently caps responses at ~1000 rows, so counts would under-report past that.
// Move to a DB-side aggregate (RPC: group by referrer_contact_id) if volume grows.
export async function listReferralCounts(): Promise<{
  ok: boolean;
  counts: Record<string, number>;
  error?: string;
}> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('referrals')
    .select('referrer_contact_id');
  if (error) {
    if (isMissingOutreachSchema(error)) return { ok: true, counts: {} };
    return { ok: false, counts: {}, error: error.message };
  }
  const counts: Record<string, number> = {};
  for (const r of (data ?? []) as { referrer_contact_id: string }[]) {
    counts[r.referrer_contact_id] = (counts[r.referrer_contact_id] ?? 0) + 1;
  }
  return { ok: true, counts };
}
