import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import type { Candidate } from './types';
import { listJobDescriptions, listActionItems } from './actions';
import CockpitBoard from './CockpitBoard';

// Always fetch fresh — new candidates arrive via the Trello webhook at any time.
export const dynamic = 'force-dynamic';

export default async function CockpitPage() {
  const supabase = getSupabaseAdmin();

  // Load candidates, job descriptions, and open action items together. The board
  // still renders if any fail (e.g. a Supabase hiccup, or the funnel migration
  // not yet applied → action items come back empty) so the cockpit stays usable.
  const [candidatesRes, jobsRes, actionItemsRes] = await Promise.all([
    supabase.from('candidates').select('*').order('id', { ascending: false }),
    listJobDescriptions(),
    listActionItems(),
  ]);

  const candidates = (candidatesRes.data ?? []) as Candidate[];
  const loadError =
    [candidatesRes.error?.message, jobsRes.error, actionItemsRes.error]
      .filter(Boolean)
      .join(' · ') || null;

  return (
    <CockpitBoard
      candidates={candidates}
      jobs={jobsRes.jobs}
      actionItems={actionItemsRes.items}
      loadError={loadError}
    />
  );
}
