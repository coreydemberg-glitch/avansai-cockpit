import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import { extractPdfText, parseJobTitle } from '@/app/lib/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'prep-materials';

// Upload a prep-document PDF (0006 migration): store it in the `prep-materials`
// bucket and insert a `prep_materials` row. Mirrors /api/upload-job-description,
// with an optional `stage` (1..8) tag so the Prep modal can surface round-relevant
// docs first. Title is auto-parsed from the PDF when not supplied.
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  const titleField = form.get('title');
  const stageField = form.get('stage');

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are allowed.' }, { status: 400 });
  }
  const providedTitle = typeof titleField === 'string' ? titleField : '';
  const stageNum = Number(stageField);
  const stage = Number.isFinite(stageNum) && stageNum >= 1 && stageNum <= 8 ? Math.round(stageNum) : null;

  const supabase = getSupabaseAdmin();
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${Date.now()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  // file.type is client-reported and spoofable; confirm the real bytes are a PDF.
  if (bytes.subarray(0, 4).toString('latin1') !== '%PDF') {
    return NextResponse.json({ error: 'That file is not a valid PDF.' }, { status: 400 });
  }

  const fileNameWithoutExt = file.name.replace(/\.[^.]+$/, '');
  const text = await extractPdfText(bytes);
  const title = providedTitle.trim() || parseJobTitle(text, fileNameWithoutExt);

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (upErr) {
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 502 });
  }

  const { data: row, error: dbErr } = await supabase
    .from('prep_materials')
    .insert({ title, stage, file_path: path })
    .select('id, title, stage, file_path, created_at')
    .single();
  if (dbErr) {
    // Roll back the orphaned file so a retry isn't blocked / storage doesn't leak.
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
    if (rmErr) {
      console.error('upload-prep-material rollback failed for', path, rmErr.message);
    }
    return NextResponse.json(
      { error: `Uploaded, but saving the record failed: ${dbErr.message}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ job: row });
}
