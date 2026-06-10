import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JOB_BUCKET = 'job-descriptions';
const ALLOWED_BUCKETS = new Set(['job-descriptions', 'prep-materials']);

// Optional PDF attachment: { path } is the object path within a storage bucket
// ({ bucket } defaults to job-descriptions; prep-materials is also allowed so the
// Prep modal can attach prep docs); { filename } is what the recipient sees.
type Attachment = { path: string; filename?: string; bucket?: string };

export async function POST(req: NextRequest) {
  let to: unknown, subject: unknown, body: unknown, attachment: unknown, attachments: unknown;
  try {
    ({ to, subject, body, attachment, attachments } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof to !== 'string' || !to.includes('@')) {
    return NextResponse.json({ error: 'Valid "to" email required.' }, { status: 400 });
  }
  if (typeof subject !== 'string' || typeof body !== 'string') {
    return NextResponse.json(
      { error: '"subject" and "body" must be strings.' },
      { status: 400 }
    );
  }

  // Collect attachment specs from `attachment` (single, back-compat) and/or
  // `attachments` (array — the Prep modal sends the JD + any prep docs together).
  const specs: Partial<Attachment>[] = [];
  if (attachment != null) specs.push(attachment as Partial<Attachment>);
  if (Array.isArray(attachments)) specs.push(...(attachments as Partial<Attachment>[]));

  // Resolve each attachment by downloading it from Storage server-side, so the
  // service-role key never leaves the server.
  let resolved: { filename: string; content: Buffer }[] | undefined;
  if (specs.length) {
    const supabase = getSupabaseAdmin();
    resolved = [];
    for (const att of specs) {
      if (typeof att.path !== 'string' || !att.path) {
        return NextResponse.json(
          { error: 'attachment.path must be a non-empty string.' },
          { status: 400 }
        );
      }
      const bucket =
        typeof att.bucket === 'string' && ALLOWED_BUCKETS.has(att.bucket)
          ? att.bucket
          : JOB_BUCKET;
      const { data, error } = await supabase.storage.from(bucket).download(att.path);
      if (error || !data) {
        return NextResponse.json(
          { error: `Could not load the attachment: ${error?.message ?? 'not found'}` },
          { status: 502 }
        );
      }
      const content = Buffer.from(await data.arrayBuffer());
      let filename =
        typeof att.filename === 'string' && att.filename.trim()
          ? att.filename.trim()
          : 'attachment.pdf';
      if (!/\.pdf$/i.test(filename)) filename += '.pdf';
      resolved.push({ filename, content });
    }
  }
  const mailAttachments = resolved;

  const user = process.env.GMAIL_USER;
  // Gmail shows app passwords in 4-char groups with spaces; strip them.
  const pass = process.env.GMAIL_PASSWORD?.replace(/\s+/g, '');
  if (!user || !pass) {
    return NextResponse.json(
      { error: 'GMAIL_USER / GMAIL_PASSWORD not configured on the server.' },
      { status: 500 }
    );
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({ from: user, to, subject, text: body, attachments: mailAttachments });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send email';
    // Log only the message — the raw error can carry transport/auth details.
    console.error('send-email error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
