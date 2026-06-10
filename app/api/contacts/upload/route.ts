import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import { parseCsv, mapContactRow } from '@/app/lib/csv';
import { enrichContacts } from '@/app/lib/enrich';
import type { ContactListType } from '@/app/cockpit/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// SHARED plumbing for both quadrants: CSV → parse → Supabase → (placeholder)
// enrichment → contact rows. Outbound and Referral both POST here with a
// different `list_type`. Re-uploading the same CSV is idempotent: a partial
// unique index (list_type, lower(email)) means duplicate emails hit a 23505
// unique_violation, which we count as "skipped" rather than failing the batch.
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  const listTypeRaw = form.get('list_type');
  const project = form.get('project'); // optional Outbound "Title/Project"

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No CSV file provided.' }, { status: 400 });
  }
  if (listTypeRaw !== 'outbound' && listTypeRaw !== 'referral') {
    return NextResponse.json(
      { error: 'list_type must be "outbound" or "referral".' },
      { status: 400 }
    );
  }
  const listType = listTypeRaw as ContactListType;
  const sourceProject =
    typeof project === 'string' && project.trim() ? project.trim() : null;

  const text = Buffer.from(await file.arrayBuffer()).toString('utf-8');
  const { rows } = parseCsv(text);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'No data rows found in that CSV.' },
      { status: 400 }
    );
  }

  const mapped = rows.map(mapContactRow);
  // Require at least a name or email per row to be a real contact.
  const usable = mapped.filter((m) => m.name || m.email);
  if (usable.length === 0) {
    return NextResponse.json(
      { error: 'Could not find a Name or Email column in that CSV.' },
      { status: 400 }
    );
  }

  const enriched = await enrichContacts(usable);
  const supabase = getSupabaseAdmin();

  let inserted = 0;
  let skipped = 0; // duplicate (already imported)
  let missingEmail = 0;
  const errors: string[] = [];
  const insertedIds: string[] = [];

  // Insert one at a time so a single duplicate doesn't abort the whole batch and
  // we can attribute 23505s to "skipped". For typical recruiter exports (tens to
  // a few hundred rows) this is fine; a bulk path can come later if needed.
  // TODO(scale): switch to chunked bulk insert + a staging upsert if lists grow
  // into the thousands.
  for (const c of enriched) {
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        list_type: listType,
        name: c.name,
        first_name: c.first_name,
        email: c.email,
        title: c.title,
        company: c.company,
        linkedin_url: c.linkedin_url,
        source_project: sourceProject,
        enrichment_status: c.enrichment_status,
        email_status: c.email_status,
        raw: c.raw,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        skipped++;
        continue;
      }
      // Missing-table (migration not applied) → surface a clear message once.
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json(
          {
            error:
              'The contacts table does not exist yet. Run supabase/migrations/0003_outreach.sql in the Supabase SQL Editor first.',
          },
          { status: 500 }
        );
      }
      errors.push(error.message);
      continue;
    }
    inserted++;
    // Count missing-email only for rows actually inserted, so the summary
    // reconciles with `inserted` (re-uploads that skip duplicates don't inflate it).
    if (c.email_status === 'missing') missingEmail++;
    if (data?.id) insertedIds.push(data.id);
  }

  // For Referral imports, seed a structured work-history row from the CURRENT
  // company (source='csv') so "who worked at [Company]?" returns matches today.
  // Full multi-company history is a later ingestion step (see ContactModal TODO).
  if (listType === 'referral' && insertedIds.length) {
    // Re-query the freshly-inserted rows to get their persisted company values
    // (the insert loop only selected ids), then seed one current-company tenure each.
    const { data: freshRows } = await supabase
      .from('contacts')
      .select('id, company')
      .in('id', insertedIds);
    const historyRows = (freshRows ?? [])
      .filter((r: { company: string | null }) => r.company)
      .map((r: { id: string; company: string | null }) => ({
        contact_id: r.id,
        company: r.company as string,
        is_current: true,
        source: 'csv' as const,
      }));
    if (historyRows.length) {
      const { error: whErr } = await supabase
        .from('contact_work_history')
        .insert(historyRows);
      if (whErr) errors.push(`work history: ${whErr.message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    listType,
    total: usable.length,
    inserted,
    skipped,
    missingEmail,
    errors: errors.slice(0, 5),
  });
}
