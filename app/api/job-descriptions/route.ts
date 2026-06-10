import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'job-descriptions';

// Job-description library CRUD. The cockpit's JD library reads this list (with
// pre-computed public URLs — the client has no SUPABASE_URL to build them), and
// renames / deletes through here. Uploads stay on /api/upload-job-description.
export async function GET() {
  const supabase = getSupabaseAdmin();

  const { data: rows, error } = await supabase
    .from('job_descriptions')
    .select('id, title, file_path, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 502 }
    );
  }

  // The client can't construct storage URLs (no NEXT_PUBLIC_SUPABASE_URL), so we
  // resolve each file_path to a public URL here.
  const jobs = (rows ?? []).map((row) => {
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(row.file_path);
    return { ...row, public_url: publicUrl };
  });

  return NextResponse.json({ ok: true, jobs });
}

// Rename a JD. body: { id, title }.
export async function PATCH(req: NextRequest) {
  let body: { id?: unknown; title?: unknown };
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
    return NextResponse.json(
      { ok: false, error: 'A title is required.' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: job, error } = await supabase
    .from('job_descriptions')
    .update({ title })
    .eq('id', id)
    .select('id, title, file_path, created_at')
    .single();
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, job });
}

// Delete a JD: remove its stored PDF, then the row. body: { id }.
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

  // Look up the file so we can clean up storage before dropping the row.
  const { data: row, error: fetchErr } = await supabase
    .from('job_descriptions')
    .select('file_path')
    .eq('id', id)
    .single();
  if (fetchErr) {
    return NextResponse.json(
      { ok: false, error: fetchErr.message },
      { status: 502 }
    );
  }

  // A failed storage delete shouldn't block removing the record — log and move on
  // (worst case we leak one orphaned file rather than a stuck library entry).
  if (row?.file_path) {
    const { error: rmErr } = await supabase.storage
      .from(BUCKET)
      .remove([row.file_path]);
    if (rmErr) {
      console.error('job-descriptions DELETE: storage remove failed for', row.file_path, rmErr.message);
    }
  }

  const { error: delErr } = await supabase
    .from('job_descriptions')
    .delete()
    .eq('id', id);
  if (delErr) {
    return NextResponse.json(
      { ok: false, error: delErr.message },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
