import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Captured Boolean strings — the right-rail table in the client workspace.
// Rows are written when the recruiter clicks the capture arrow next to a
// Boolean Claude delivered in chat.

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
      .from('sourcing_booleans')
      .select('id, boolean_string, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, booleans: data ?? [] });
  } catch (err) {
    console.error('[sourcing] list booleans error:', err);
    return NextResponse.json(
      { error: 'Failed to load booleans' },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  let client_id: unknown, boolean_string: unknown;
  try {
    ({ client_id, boolean_string } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof client_id !== 'string' || !client_id) {
    return NextResponse.json({ error: 'Provide a client_id.' }, { status: 400 });
  }
  if (typeof boolean_string !== 'string' || boolean_string.trim().length === 0) {
    return NextResponse.json(
      { error: 'Provide a non-empty boolean_string.' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('sourcing_booleans')
      .insert({ client_id, boolean_string: boolean_string.trim() })
      .select('id, boolean_string, created_at')
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, row: data });
  } catch (err) {
    console.error('[sourcing] capture boolean error:', err);
    return NextResponse.json(
      { error: 'Failed to capture boolean' },
      { status: 502 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  let id: unknown;
  try {
    ({ id } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'Provide a row id.' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('sourcing_booleans')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[sourcing] delete boolean error:', err);
    return NextResponse.json(
      { error: 'Failed to delete boolean' },
      { status: 502 }
    );
  }
}
