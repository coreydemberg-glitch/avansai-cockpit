import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Auto-archive on workspace close (sourcing build): move the live chat thread
// into sourcing_archives as one jsonb transcript, then clear the live thread —
// so the next session starts on a clean slate. The server re-checks Brain Buzz
// from the DB (source of truth): if it's ON the call is a no-op and the live
// thread persists.

export async function POST(req: NextRequest) {
  let client_id: unknown;
  try {
    ({ client_id } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof client_id !== 'string' || !client_id) {
    return NextResponse.json({ error: 'Provide a client_id.' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: client, error: clientErr } = await supabase
      .from('sourcing_clients')
      .select('id, brain_buzz')
      .eq('id', client_id)
      .single();
    if (clientErr || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    if (client.brain_buzz) {
      return NextResponse.json({ ok: true, archived: false, reason: 'brain_buzz' });
    }

    const { data: messages, error: msgErr } = await supabase
      .from('sourcing_messages')
      .select('id, role, content, created_at')
      .eq('client_id', client_id)
      .order('created_at', { ascending: true });
    if (msgErr) throw msgErr;
    if (!messages || messages.length === 0) {
      return NextResponse.json({ ok: true, archived: false, reason: 'empty' });
    }

    const transcript = messages.map(({ role, content, created_at }) => ({
      role,
      content,
      created_at,
    }));
    const { error: insErr } = await supabase.from('sourcing_archives').insert({
      client_id,
      transcript,
      message_count: transcript.length,
    });
    if (insErr) throw insErr;

    // Delete exactly the rows we archived — a message that lands mid-archive
    // (e.g. a still-running chat request) survives into the next session
    // rather than being dropped unarchived.
    const { error: delErr } = await supabase
      .from('sourcing_messages')
      .delete()
      .in('id', messages.map((m) => m.id));
    if (delErr) throw delErr;

    return NextResponse.json({ ok: true, archived: true, count: transcript.length });
  } catch (err) {
    console.error('[sourcing] archive error:', err);
    return NextResponse.json(
      { error: 'Failed to archive session' },
      { status: 502 }
    );
  }
}
