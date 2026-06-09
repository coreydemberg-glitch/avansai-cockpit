import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'resumes';

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  const candidateId = form.get('candidateId');

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  if (typeof candidateId !== 'string' || !candidateId) {
    return NextResponse.json({ error: 'candidateId is required.' }, { status: 400 });
  }
  const isAllowed =
    file.type === 'application/pdf' || file.type.startsWith('image/');
  if (!isAllowed) {
    return NextResponse.json(
      { error: 'Only PDF or image files are allowed.' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${candidateId}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) {
    return NextResponse.json(
      { error: `Upload failed: ${upErr.message}` },
      { status: 502 }
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { error: dbErr } = await supabase
    .from('candidates')
    .update({ resume: publicUrl })
    .eq('id', candidateId);
  if (dbErr) {
    return NextResponse.json(
      { error: `Uploaded, but saving the reference failed: ${dbErr.message}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ url: publicUrl, filename: file.name });
}
