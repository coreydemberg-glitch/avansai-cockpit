import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Sourcing clients CRUD (sourcing build). Same shape conventions as
// /api/job-descriptions: every response is { ok: true, ... } | { error }.
// Archive is a soft flag (PATCH archived=true) like candidates; DELETE is the
// hard path and cascades to messages/archives/booleans via the FK.

const SELECT =
  'id, name, brain_buzz, memory_instructions, archived, created_at';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('sourcing_clients')
      .select(SELECT)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, clients: data ?? [] });
  } catch (err) {
    console.error('[sourcing] list clients error:', err);
    return NextResponse.json(
      { error: 'Failed to load clients' },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  let name: unknown;
  try {
    ({ name } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json(
      { error: 'Provide a non-empty account name.' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('sourcing_clients')
      .insert({ name: name.trim() })
      .select(SELECT)
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, client: data });
  } catch (err) {
    console.error('[sourcing] create client error:', err);
    return NextResponse.json(
      { error: 'Failed to create client' },
      { status: 502 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { id } = body;
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'Provide a client id.' }, { status: 400 });
  }

  // Whitelisted patchable fields — anything else in the body is ignored.
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) {
    patch.name = (body.name as string).trim();
  }
  if (typeof body.brain_buzz === 'boolean') patch.brain_buzz = body.brain_buzz;
  if (typeof body.memory_instructions === 'string') {
    patch.memory_instructions = body.memory_instructions;
  }
  if (typeof body.archived === 'boolean') patch.archived = body.archived;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('sourcing_clients')
      .update(patch)
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, client: data });
  } catch (err) {
    console.error('[sourcing] update client error:', err);
    return NextResponse.json(
      { error: 'Failed to update client' },
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
    return NextResponse.json({ error: 'Provide a client id.' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('sourcing_clients')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[sourcing] delete client error:', err);
    return NextResponse.json(
      { error: 'Failed to delete client' },
      { status: 502 }
    );
  }
}
