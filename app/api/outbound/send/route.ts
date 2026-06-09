import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';
import type { Contact } from '@/app/cockpit/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Batch cold-email send for the Outbound quadrant. Sends ONE templated email per
// selected contact from Corey's own Gmail (reuses the send-email transport), with
// {first_name}/{company} merge fields, then marks each recipient contacted.
//
// ── DRY-RUN BY DEFAULT ───────────────────────────────────────────────────────
// Real cold email from a live personal inbox is risky (domain reputation, Gmail
// limits), so sending is gated behind OUTBOUND_LIVE_SEND. With it unset/false we
// render every message and return previews WITHOUT sending or marking anyone
// contacted. To arm real sends set OUTBOUND_LIVE_SEND=true in the environment.
// TODO(arm-send): when arming live, also confirm Gmail send limits (~500/day for
// Workspace) and consider a provider built for cold outreach if volume grows.
const LIVE_SEND = process.env.OUTBOUND_LIVE_SEND === 'true';
const MAX_BATCH = 50; // conservative cap; tune when arming live send

function mergeFields(template: string, c: Pick<Contact, 'first_name' | 'name' | 'company'>): string {
  const first = c.first_name || (c.name ? c.name.split(/\s+/)[0] : '') || 'there';
  const company = c.company || 'your team';
  return template
    .replaceAll('{first_name}', first)
    .replaceAll('{company}', company);
}

export async function POST(req: NextRequest) {
  let contactIds: unknown, subject: unknown, body: unknown;
  try {
    ({ contactIds, subject, body } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one contact.' }, { status: 400 });
  }
  if (typeof subject !== 'string' || typeof body !== 'string' || !subject.trim() || !body.trim()) {
    return NextResponse.json(
      { error: 'subject and body are required.' },
      { status: 400 }
    );
  }
  // Dedupe so duplicate ids don't double-count toward the cap.
  const ids = Array.from(new Set(contactIds as string[]));
  if (ids.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Batch too large (max ${MAX_BATCH}). Deselect some recipients.` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  // Only pull contacts that are eligible to send: not archived and NOT already
  // contacted — re-emailing a prior recipient is the cardinal cold-outreach sin.
  const { data: contacts, error: readErr } = await supabase
    .from('contacts')
    .select('id, name, first_name, email, company, email_status')
    .in('id', ids)
    .eq('list_type', 'outbound')
    .eq('archived', false)
    .eq('contacted', false);

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 502 });
  }

  const sendable = (contacts ?? []).filter(
    (c: Pick<Contact, 'email'>) => c.email && c.email.includes('@')
  ) as Contact[];
  const noEmail = (contacts ?? []).length - sendable.length;
  // Requested ids that the query excluded: already contacted, archived, not
  // outbound, or nonexistent. Surfaced so the totals reconcile for the caller.
  const skippedIneligible = ids.length - (contacts ?? []).length;

  // Build the rendered messages (used for both dry-run previews and live send).
  const messages = sendable.map((c) => ({
    id: c.id,
    to: c.email as string,
    subject: mergeFields(subject, c),
    body: mergeFields(body, c),
  }));

  // DRY RUN: return previews, send nothing, mark nothing.
  if (!LIVE_SEND) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      wouldSend: messages.length,
      skippedNoEmail: noEmail,
      skippedIneligible,
      previews: messages.slice(0, 3),
    });
  }

  // LIVE SEND.
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_PASSWORD?.replace(/\s+/g, '');
  if (!user || !pass) {
    return NextResponse.json(
      { error: 'GMAIL_USER / GMAIL_PASSWORD not configured on the server.' },
      { status: 500 }
    );
  }
  // One transporter reused across the whole batch (don't recreate per message).
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  let sent = 0;
  const failed: { id: string; error: string }[] = [];
  const nowIso = new Date().toISOString();

  for (const m of messages) {
    // Send first. Only the send itself can fail the recipient.
    try {
      await transporter.sendMail({ from: user, to: m.to, subject: m.subject, text: m.body });
    } catch (err) {
      failed.push({ id: m.id, error: err instanceof Error ? err.message : 'send failed' });
      continue;
    }
    sent++;
    // Bookkeeping is best-effort and SEPARATE: the email already went out, so a
    // failed/errored mark must never be reported as a send failure (that would
    // cause a double-send on retry). Log it and move on.
    try {
      const { error: markErr } = await supabase
        .from('contacts')
        .update({ contacted: true, last_contacted_at: nowIso })
        .eq('id', m.id);
      if (markErr) {
        console.error('outbound: sent but mark-contacted failed for', m.id, markErr.message);
      }
    } catch (e) {
      console.error('outbound: sent but mark-contacted threw for', m.id, e);
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun: false,
    sent,
    failed: failed.length,
    skippedNoEmail: noEmail,
    skippedIneligible,
    errors: failed.slice(0, 5),
  });
}
