import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import type { Candidate } from './types';
import { listJobDescriptions } from './actions';
import CockpitBoard from './CockpitBoard';

// Always fetch fresh — new candidates arrive via the Trello webhook at any time.
export const dynamic = 'force-dynamic';

export default async function CockpitPage() {
  const supabase = getSupabaseAdmin();

  // Load candidates and job descriptions together. The board still renders if
  // either fails (e.g. a Supabase hiccup) so the parking lot stays usable.
  const [candidatesRes, jobsRes] = await Promise.all([
    supabase.from('candidates').select('*').order('id', { ascending: false }),
    listJobDescriptions(),
  ]);

  // Hide archived candidates (Corey was removed from the Trello card). Filtered
  // in JS rather than in the query so the cockpit keeps working even before the
  // `archived` column exists in the DB.
  const candidates = ((candidatesRes.data ?? []) as Candidate[]).filter(
    (c) => !c.archived
  );
  const loadError =
    [candidatesRes.error?.message, jobsRes.error].filter(Boolean).join(' · ') ||
    null;

  return (
    <CockpitBoard
      candidates={candidates}
      jobs={jobsRes.jobs}
      loadError={loadError}
    />
  );
}
