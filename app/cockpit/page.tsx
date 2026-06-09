import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import type { Candidate } from './types';
import { listJobDescriptions, listActionItems } from './actions';
import { listContacts, listReferralCounts } from './outreach/actions';
import CockpitBoard from './CockpitBoard';

// Always fetch fresh — new candidates arrive via the Trello webhook at any time.
export const dynamic = 'force-dynamic';

export default async function CockpitPage() {
  const supabase = getSupabaseAdmin();

  // Load candidates, job descriptions, open action items, and the two outreach
  // lists together. The board still renders if any fail (a Supabase hiccup, or a
  // migration not yet applied → that slice comes back empty) so the cockpit stays
  // usable. listContacts/listReferralCounts no-op to empty until 0003 is applied.
  const [candidatesRes, jobsRes, actionItemsRes, outboundRes, referralRes, refCountsRes] =
    await Promise.all([
      supabase.from('candidates').select('*').order('id', { ascending: false }),
      listJobDescriptions(),
      listActionItems(),
      listContacts('outbound'),
      listContacts('referral'),
      listReferralCounts(),
    ]);

  const candidates = (candidatesRes.data ?? []) as Candidate[];
  const loadError =
    [
      candidatesRes.error?.message,
      jobsRes.error,
      actionItemsRes.error,
      outboundRes.error,
      referralRes.error,
      refCountsRes.error,
    ]
      .filter(Boolean)
      .join(' · ') || null;

  return (
    <CockpitBoard
      candidates={candidates}
      jobs={jobsRes.jobs}
      actionItems={actionItemsRes.items}
      outboundContacts={outboundRes.contacts}
      referralContacts={referralRes.contacts}
      referralCounts={refCountsRes.counts}
      loadError={loadError}
    />
  );
}
