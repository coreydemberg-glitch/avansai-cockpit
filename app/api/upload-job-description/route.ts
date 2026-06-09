import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'job-descriptions';

// Upload a job-description PDF: store the file in the `job-descriptions` bucket
// and insert a `job_descriptions` row. Mirrors /api/upload-resume but keyed by a
// recruiter-typed title rather than a candidate, and PDF-only.
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  const title = form.get('title');

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json(
      { error: 'Only PDF files are allowed.' },
      { status: 400 }
    );
  }
  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'A title is required.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${Date.now()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  // file.type is client-reported and spoofable; confirm the real bytes are a PDF
  // (every PDF starts with "%PDF") before storing and later emailing it.
  if (bytes.subarray(0, 4).toString('latin1') !== '%PDF') {
    return NextResponse.json(
      { error: 'That file is not a valid PDF.' },
      { status: 400 }
    );
  }

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (upErr) {
    return NextResponse.json(
      { error: `Upload failed: ${upErr.message}` },
      { status: 502 }
    );
  }

  const { data: row, error: dbErr } = await supabase
    .from('job_descriptions')
    .insert({ title: title.trim(), file_path: path })
    .select('id, title, file_path, created_at')
    .single();
  if (dbErr) {
    // Roll back the orphaned file so a retry isn't blocked / storage doesn't leak.
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
    if (rmErr) {
      console.error('upload-job-description rollback failed for', path, rmErr.message);
    }
    return NextResponse.json(
      { error: `Uploaded, but saving the record failed: ${dbErr.message}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ job: row });
}
