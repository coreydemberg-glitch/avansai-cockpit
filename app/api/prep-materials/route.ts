import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'prep-materials';

// Prep-materials library CRUD (0006 migration) — the Prep Documents library reads
// this list (with pre-computed public URLs), and renames / deletes through here.
// Mirrors /api/job-descriptions; uploads stay on /api/upload-prep-material.
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data: rows, error } = await supabase
    .from('prep_materials')
    .select('id, title, stage, file_path, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }

  // The client can't construct storage URLs (no NEXT_PUBLIC_SUPABASE_URL), so we
  // resolve each file_path to a public URL here.
  const items = (rows ?? []).map((row) => {
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(row.file_path);
    return { ...row, public_url: publicUrl };
  });

  return NextResponse.json({ ok: true, jobs: items });
}

// Rename a prep doc (and optionally re-tag its stage). body: { id, title, stage? }.
export async function PATCH(req: NextRequest) {
  let body: { id?: unknown; title?: unknown; stage?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!id) {
    return NextResponse.json({ ok: false, error: 'id is required.' }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ ok: false, error: 'A title is required.' }, { status: 400 });
  }
  const patch: { title: string; stage?: number | null } = { title };
  if ('stage' in body) {
    const s = Number(body.stage);
    patch.stage = Number.isFinite(s) && s >= 1 && s <= 8 ? Math.round(s) : null;
  }

  const supabase = getSupabaseAdmin();
  const { data: job, error } = await supabase
    .from('prep_materials')
    .update(patch)
    .eq('id', id)
    .select('id, title, stage, file_path, created_at')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, job });
}

// Delete a prep doc: remove its stored PDF, then the row. body: { id }.
export async function DELETE(req: NextRequest) {
  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) {
    return NextResponse.json({ ok: false, error: 'id is required.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: row, error: fetchErr } = await supabase
    .from('prep_materials')
    .select('file_path')
    .eq('id', id)
    .single();
  if (fetchErr) {
    return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 502 });
  }

  // A failed storage delete shouldn't block removing the record — log and move on.
  if (row?.file_path) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([row.file_path]);
    if (rmErr) {
      console.error('prep-materials DELETE: storage remove failed for', row.file_path, rmErr.message);
    }
  }

  const { error: delErr } = await supabase.from('prep_materials').delete().eq('id', id);
  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
