import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let to: unknown, subject: unknown, body: unknown;
  try {
    ({ to, subject, body } = await req.json());
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

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_PASSWORD;
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
    await transporter.sendMail({ from: user, to, subject, text: body });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send email';
    console.error('send-email error:', err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
