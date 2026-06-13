import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import { extractPdfText, parseResumeContact } from '@/app/lib/pdf';

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

  // Best-effort: pull the candidate's email + first name out of the resume so the
  // client can pre-fill the form. PDFs only (images can't be text-extracted), and
  // any failure leaves `parsed` empty rather than failing the upload.
  let parsed: { email: string | null; firstName: string | null } = {
    email: null,
    firstName: null,
  };
  // Full extracted résumé text (PDF only) so the notes studio can seed the live
  // cleaner's field buckets straight from the résumé. Capped so the payload —
  // and every live re-clean call that carries it — stays small.
  let text = '';
  if (file.type === 'application/pdf') {
    try {
      const full = await extractPdfText(bytes);
      parsed = parseResumeContact(full);
      text = full.slice(0, 12000);
    } catch {
      // leave parsed as nulls / text empty
    }
  }

  // Auto-save the parsed email onto the candidate so the email composer is
  // pre-filled without a copy-paste (Candidate Hub bug #5). Fill-if-empty only —
  // never clobber an address the recruiter set or corrected by hand. Best-effort:
  // a failure here leaves `emailSaved` false rather than failing the upload.
  let emailSaved = false;
  if (parsed.email) {
    const { data: row } = await supabase
      .from('candidates')
      .select('email')
      .eq('id', candidateId)
      .maybeSingle();
    if (!(row?.email ?? '').trim()) {
      const { error: emailErr } = await supabase
        .from('candidates')
        .update({ email: parsed.email })
        .eq('id', candidateId);
      if (!emailErr) emailSaved = true;
    }
  }

  return NextResponse.json({ url: publicUrl, filename: file.name, parsed, text, emailSaved });
}
