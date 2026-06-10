import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Live chat thread for one sourcing client. Reads only — writes happen in
// /api/sourcing-chat (both sides of each exchange) and /api/sourcing-archive
// (moves the thread into sourcing_archives on window close).

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('client_id');
  if (!clientId) {
    return NextResponse.json(
      { error: 'Provide a client_id query param.' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('sourcing_messages')
      .select('id, role, content, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, messages: data ?? [] });
  } catch (err) {
    console.error('[sourcing] list messages error:', err);
    return NextResponse.json(
      { error: 'Failed to load messages' },
      { status: 502 }
    );
  }
}
