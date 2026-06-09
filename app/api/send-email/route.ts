import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JOB_BUCKET = 'job-descriptions';

// Optional PDF attachment: { path } is the object path within the
// job-descriptions bucket; { filename } is what the recipient sees.
type Attachment = { path: string; filename?: string };

export async function POST(req: NextRequest) {
  let to: unknown, subject: unknown, body: unknown, attachment: unknown;
  try {
    ({ to, subject, body, attachment } = await req.json());
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

  // Resolve the optional attachment by downloading it from Storage server-side,
  // so the service-role key never leaves the server.
  let attachments: { filename: string; content: Buffer }[] | undefined;
  if (attachment != null) {
    const att = attachment as Partial<Attachment>;
    if (typeof att.path !== 'string' || !att.path) {
      return NextResponse.json(
        { error: 'attachment.path must be a non-empty string.' },
        { status: 400 }
      );
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(JOB_BUCKET)
      .download(att.path);
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
        : 'job-description.pdf';
    if (!/\.pdf$/i.test(filename)) filename += '.pdf';
    attachments = [{ filename, content }];
  }

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
    await transporter.sendMail({ from: user, to, subject, text: body, attachments });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send email';
    // Log only the message — the raw error can carry transport/auth details.
    console.error('send-email error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
