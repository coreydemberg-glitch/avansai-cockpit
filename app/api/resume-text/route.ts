import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import { fetchResumeText } from '@/app/lib/resume';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// On-demand résumé text for a candidate already on file (Candidate Hub bug #3).
// The notes studio seeds its live "submittal" cleaner with this so a résumé that
// was uploaded earlier (or via the Résumé tab) is baked into the submittal —
// previously only a résumé drag-dropped onto the studio THIS session was. The
// résumé URL is read from the candidate row (never from the client), then fetched
// through the shared guarded fetcher. 12k chars matches the studio's own cap.
export async function POST(req: NextRequest) {
  let candidateId: unknown;
  try {
    ({ candidateId } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof candidateId !== 'string' || !candidateId) {
    return NextResponse.json({ error: 'candidateId is required.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('candidates')
    .select('resume')
    .eq('id', candidateId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  const text = await fetchResumeText(data?.resume ?? null, 12000);
  return NextResponse.json({ text });
}
