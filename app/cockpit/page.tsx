import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import type { Candidate } from './types';
import CockpitBoard from './CockpitBoard';

// Always fetch fresh — new candidates arrive via the Trello webhook at any time.
export const dynamic = 'force-dynamic';

export default async function CockpitPage() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .order('id', { ascending: false });

  if (error) {
    return (
      <main style={{ padding: 40, fontFamily: 'system-ui' }}>
        <h1>Cockpit</h1>
        <p style={{ color: '#b91c1c' }}>
          Failed to load candidates: {error.message}
        </p>
      </main>
    );
  }

  const candidates = (data ?? []) as Candidate[];

  return <CockpitBoard candidates={candidates} />;
}
