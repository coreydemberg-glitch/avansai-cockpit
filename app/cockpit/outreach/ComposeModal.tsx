'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Contact, OutboundTemplate } from '../types';
import { listOutboundTemplates } from './actions';
import { C, FONT, RADIUS, BORDER } from '../funnel/tokens';

// Outbound compose: one template applied to all selected contacts, with
// {first_name}/{company} merge fields. Matches the Funnel modal shell. The actual
// send is dry-run by default server-side (OUTBOUND_LIVE_SEND), so this surfaces
// whatever the API reports (previews when dry, counts when live).
//
// Templates are DB-backed: read from email_templates (kind='outbound', seeded by
// the 0004 migration) so the copy is editable without a deploy, mirroring the
// candidate templates. The seeded rows are blank placeholders — Corey fills them
// in. Until 0004 is applied the fetch no-ops to [] and we fall back to BLANK so
// the modal stays usable (the recipient just types subject/body).
const BLANK: OutboundTemplate = {
  id: '__blank__',
  key: '__blank__',
  label: 'Blank',
  subject: '',
  body: '',
};

export default function ComposeModal({
  contacts,
  onClose,
  onSent,
}: {
  contacts: Contact[];
  onClose: () => void;
  onSent: () => void;
}) {
  // null = still loading; otherwise the list to drive the dropdown (never empty —
  // falls back to [BLANK]).
  const [templates, setTemplates] = useState<OutboundTemplate[] | null>(null);
  const [templateKey, setTemplateKey] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  // Load the outbound templates once; seed the compose fields from the first one.
  useEffect(() => {
    let cancelled = false;
    listOutboundTemplates().then((res) => {
      if (cancelled) return;
      const list = res.ok && res.templates.length ? res.templates : [BLANK];
      setTemplates(list);
      setTemplateKey(list[0].key);
      setSubject(list[0].subject);
      setBody(list[0].body);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sendable = contacts.filter((c) => c.email && c.email.includes('@'));
  const noEmail = contacts.length - sendable.length;

  const applyTemplate = (key: string) => {
    setTemplateKey(key);
    const t = (templates ?? []).find((x) => x.key === key);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  };

  // Live preview against the first sendable recipient.
  const preview = useMemo(() => {
    const c = sendable[0];
    if (!c) return null;
    const first = c.first_name || (c.name ? c.name.split(/\s+/)[0] : '') || 'there';
    const company = c.company || 'your team';
    const merge = (s: string) =>
      s.replaceAll('{first_name}', first).replaceAll('{company}', company);
    return { to: c.email as string, subject: merge(subject), body: merge(body) };
  }, [sendable, subject, body]);

  const handleSend = async () => {
    if (sendable.length === 0 || sending) return;
    setSending(true);
    setResult(null);
    setIsError(false);
    try {
      const res = await fetch('/api/outbound/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactIds: sendable.map((c) => c.id),
          subject,
          body,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');
      const skipNote = data.skippedIneligible
        ? ` · ${data.skippedIneligible} skipped (already sent / ineligible)`
        : '';
      if (data.dryRun) {
        setResult(
          `Dry run — ${data.wouldSend} email(s) rendered, none sent${skipNote}. ` +
            `Set OUTBOUND_LIVE_SEND=true to arm real sends.`
        );
      } else {
        setResult(`Sent ${data.sent}, failed ${data.failed}${skipNote}. Marked contacted ✓`);
        onSent();
      }
    } catch (e) {
      setIsError(true);
      setResult(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div style={styles.modalHeader}>
          <div>
            <h2 style={styles.modalTitle}>Compose outbound</h2>
            <p style={styles.modalSub}>
              {sendable.length} recipient{sendable.length === 1 ? '' : 's'}
              {noEmail > 0 ? ` · ${noEmail} skipped (no email)` : ''}
            </p>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div style={styles.sectionCol}>
          <label style={styles.label}>Template</label>
          <select
            style={styles.input}
            value={templateKey}
            onChange={(e) => applyTemplate(e.target.value)}
            disabled={templates === null}
          >
            {templates === null ? (
              <option>Loading templates…</option>
            ) : (
              templates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))
            )}
          </select>

          <label style={styles.label}>Subject</label>
          <input
            style={styles.input}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          <label style={styles.label}>Body</label>
          <textarea
            style={styles.textarea}
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <p style={styles.hint}>
            Merge fields: <code>{'{first_name}'}</code> · <code>{'{company}'}</code>
          </p>

          {preview && (
            <div style={styles.previewBox}>
              <div style={styles.previewLabel}>Preview · {preview.to}</div>
              <div style={styles.previewSubject}>{preview.subject}</div>
              <div style={styles.previewBody}>{preview.body}</div>
            </div>
          )}

          <div style={styles.saveRow}>
            <button
              style={styles.primaryBtn}
              onClick={handleSend}
              disabled={sending || sendable.length === 0}
            >
              {sending ? 'Sending…' : `Send to ${sendable.length}`}
            </button>
            {result && (
              <span style={{ ...styles.saveMsg, color: isError ? '#f87171' : C.green }}>
                {result}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.62)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 50,
  },
  modal: {
    background: C.panel,
    border: BORDER,
    borderRadius: RADIUS.card,
    padding: 24,
    width: '100%',
    maxWidth: 560,
    maxHeight: '90vh',
    overflowY: 'auto',
    color: C.white,
    fontFamily: FONT,
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: C.white },
  modalSub: { margin: '4px 0 0', color: C.muted, fontSize: 13 },
  closeBtn: { border: 'none', background: 'transparent', fontSize: 16, cursor: 'pointer', color: C.muted, lineHeight: 1, padding: 4 },
  sectionCol: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 18 },
  label: { fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted2 },
  input: {
    marginTop: 6,
    padding: 10,
    background: C.panel2,
    border: BORDER,
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 14,
    color: C.white,
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    marginTop: 6,
    padding: 11,
    background: C.panel2,
    border: BORDER,
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 14,
    color: C.white,
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  hint: { fontSize: 11, color: C.muted2, margin: '4px 0 0' },
  previewBox: { marginTop: 14, border: BORDER, borderRadius: 10, background: C.panel2, padding: 14 },
  previewLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted2, marginBottom: 8 },
  previewSubject: { fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 6 },
  previewBody: { fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', color: C.white },
  saveRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' },
  primaryBtn: {
    padding: '9px 18px',
    border: 'none',
    borderRadius: RADIUS.button,
    background: C.green,
    color: C.bg,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  saveMsg: { fontSize: 13 },
};
