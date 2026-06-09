'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Contact, ContactNote, ContactWorkHistory, Referral } from '../types';
import {
  addContactNote,
  addReferral,
  addWorkHistory,
  listContactNotes,
  listReferrals,
  listWorkHistory,
} from './actions';
import { C, FONT, RADIUS, BORDER } from '../funnel/tokens';

// The Referral Level-1 card. Matches the Funnel CandidateModal behavior exactly:
// full-screen overlay (click-to-close), inner dialog (stopPropagation, role
// dialog), ✕ close button, no animation, no Escape handler. The parent renders
// it conditionally with key={contact.id} and calls onChanged()=router.refresh()
// after a write, onClose()=clear selection.
export default function ContactModal({
  contact,
  onChanged,
  onClose,
}: {
  contact: Contact;
  onChanged: () => void;
  onClose: () => void;
}) {
  type Tab = 'notes' | 'history' | 'referrals';
  const [activeTab, setActiveTab] = useState<Tab>('notes');

  const linkedinHref = /^https?:\/\//i.test(contact.linkedin_url ?? '')
    ? (contact.linkedin_url as string)
    : null;

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
            <h2 style={styles.modalTitle}>{contact.name || 'Untitled'}</h2>
            <p style={styles.modalSub}>
              {[contact.title, contact.company].filter(Boolean).join(' · ') ||
                'No title set'}
            </p>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <dl style={styles.meta}>
          <Field
            label="LinkedIn"
            value={
              // LinkedIn button — opens the stored profile URL (hyperlink for now;
              // storage method TBD, see TODO in the placeholder report).
              linkedinHref ? (
                <a
                  href={linkedinHref}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.openProfileBtn}
                >
                  Open profile ↗
                </a>
              ) : (
                <span style={styles.muted}>Not set</span>
              )
            }
          />
          <Field
            label="Last contacted"
            value={<span>{formatLastContacted(contact.last_contacted_at)}</span>}
          />
        </dl>

        <div style={styles.tabBar}>
          {(
            [
              { key: 'notes', icon: 'ti-notes', label: 'Notes' },
              { key: 'history', icon: 'ti-building', label: 'Work history' },
              { key: 'referrals', icon: 'ti-affiliate', label: 'Referrals' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={activeTab === t.key ? styles.tabActive : styles.tab}
            >
              <i className={`ti ${t.icon}`} aria-hidden /> {t.label}
            </button>
          ))}
        </div>

        <div style={styles.tabContent}>
          {activeTab === 'notes' && (
            <NotesTab contact={contact} onChanged={onChanged} />
          )}
          {activeTab === 'history' && (
            <WorkHistoryTab contactId={contact.id} />
          )}
          {activeTab === 'referrals' && (
            <ReferralsTab contactId={contact.id} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────
function NotesTab({
  contact,
  onChanged,
}: {
  contact: Contact;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await listContactNotes(contact.id);
    if (res.ok) setNotes(res.notes);
  }, [contact.id]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    const res = await addContactNote(contact.id, draft);
    if (res.ok) {
      setDraft('');
      setMsg('Saved ✓'); // auto-timestamped + bumped "Date last contacted"
      await refresh();
      onChanged(); // refresh the list column
    } else {
      setMsg(`Error: ${res.error ?? 'unknown'}`);
    }
    setBusy(false);
  };

  return (
    <div style={styles.sectionCol}>
      <label style={styles.label}>Add a note</label>
      <textarea
        style={styles.textarea}
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Note auto-timestamps, saves to Supabase, and updates Date last contacted…"
      />
      <div style={styles.saveRow}>
        <button
          style={styles.primaryBtn}
          onClick={handleAdd}
          disabled={busy || !draft.trim()}
        >
          {busy ? 'Saving…' : 'Add note'}
        </button>
        {msg && (
          <span
            style={{
              ...styles.saveMsg,
              color: msg.startsWith('Error') ? '#f87171' : C.green,
            }}
          >
            {msg}
          </span>
        )}
      </div>

      {notes.length === 0 ? (
        <p style={styles.empty}>No notes yet.</p>
      ) : (
        <ul style={styles.noteList}>
          {notes.map((n) => (
            <li key={n.id} style={styles.noteItem}>
              <div style={styles.noteStamp}>{formatStamp(n.created_at)}</div>
              <div style={styles.noteBody}>{n.body}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Work history (the structured capture surface) ───────────────────────────
function WorkHistoryTab({ contactId }: { contactId: string }) {
  const [history, setHistory] = useState<ContactWorkHistory[]>([]);
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await listWorkHistory(contactId);
    if (res.ok) setHistory(res.history);
  }, [contactId]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = async () => {
    if (!company.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    const res = await addWorkHistory(contactId, {
      company,
      title,
      source: 'manual',
    });
    if (res.ok) {
      setCompany('');
      setTitle('');
      await refresh();
    } else {
      setMsg(`Error: ${res.error ?? 'unknown'}`);
    }
    setBusy(false);
  };

  return (
    <div style={styles.sectionCol}>
      {history.length === 0 ? (
        <p style={styles.empty}>No work history captured yet.</p>
      ) : (
        <ul style={styles.noteList}>
          {history.map((h) => (
            <li key={h.id} style={styles.histItem}>
              <div style={styles.histMain}>
                <span style={styles.histCompany}>{h.company}</span>
                {h.title && <span style={styles.histTitle}> · {h.title}</span>}
              </div>
              <div style={styles.histMeta}>
                {h.is_current ? 'Current' : formatRange(h.start_date, h.end_date)}
                {h.source ? ` · ${h.source}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Manual capture. The structured schema is final; automated ingestion is
          the placeholder — see TODO below. */}
      <label style={{ ...styles.label, marginTop: 8 }}>Add a company</label>
      <input
        style={styles.input}
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        placeholder="Company"
      />
      <input
        style={styles.input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
      />
      <div style={styles.saveRow}>
        <button
          style={styles.primaryBtn}
          onClick={handleAdd}
          disabled={busy || !company.trim()}
        >
          {busy ? 'Saving…' : 'Add company'}
        </button>
        {msg && <span style={{ ...styles.saveMsg, color: '#f87171' }}>{msg}</span>}
      </div>
      <p style={styles.todoNote}>
        {/* TODO(work-history-ingestion): automate capture of FULL multi-company
            history — resume upload parse, LinkedIn scrape via the stored profile
            link, or Apollo employment_history. Schema (contact_work_history) is
            final and queryable; only the ingestion source is a placeholder. */}
        Manual capture for now · automated ingestion (resume / LinkedIn / Apollo)
        is a placeholder.
      </p>
    </div>
  );
}

// ── Referrals (Level 1) ─────────────────────────────────────────────────────
function ReferralsTab({ contactId }: { contactId: string }) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await listReferrals(contactId);
    if (res.ok) setReferrals(res.referrals);
  }, [contactId]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    const res = await addReferral(contactId, name, note);
    if (res.ok) {
      setName('');
      setNote('');
      await refresh();
    } else {
      setMsg(`Error: ${res.error ?? 'unknown'}`);
    }
    setBusy(false);
  };

  return (
    <div style={styles.sectionCol}>
      {referrals.length === 0 ? (
        <p style={styles.empty}>No referrals recorded yet.</p>
      ) : (
        <ul style={styles.noteList}>
          {referrals.map((r) => (
            <li key={r.id} style={styles.noteItem}>
              <div style={styles.noteBody}>{r.referred_name || 'Linked contact'}</div>
              {r.note && <div style={styles.noteStamp}>{r.note}</div>}
            </li>
          ))}
        </ul>
      )}

      <label style={{ ...styles.label, marginTop: 8 }}>Record a referral</label>
      <input
        style={styles.input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name of person they referred"
      />
      <input
        style={styles.input}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
      />
      <div style={styles.saveRow}>
        <button
          style={styles.primaryBtn}
          onClick={handleAdd}
          disabled={busy || !name.trim()}
        >
          {busy ? 'Saving…' : 'Add referral'}
        </button>
        {msg && <span style={{ ...styles.saveMsg, color: '#f87171' }}>{msg}</span>}
      </div>

      {/* ───────────────────────────────────────────────────────────────────────
          LEVEL 2 — DO NOT BUILD YET (intent capture only).
          The handoff target from Level 1. Goal: ingest the CONNECTIONS of each
          referral (connection-of-connection), enrich into Supabase/cockpit, and
          make them searchable, attached to the parent referral's card.
          - No viable official LinkedIn API (Connections API is gated behind a
            direct LinkedIn partnership; unofficial Voyager-style scraping
            violates ToS and breaks on UI changes).
          - Likely Level-2 MVP path: the Claude browser extension runs saved
            LinkedIn Recruiter searches (company + skill + geo), exports results,
            and attaches them to this (parent placement) card as a searchable
            referral string.
          - Known tradeoffs: bot-flagging risk, breaks on LinkedIn UI changes,
            manual-ish trigger, scales poorly — acceptable for now, flagged for a
            better long-term solution.
          ─────────────────────────────────────────────────────────────────────── */}
      <p style={styles.todoNote}>
        Level 2 (connection-of-connection network search) — not built yet.
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <dt style={styles.fieldLabel}>{label}</dt>
      <dd style={styles.fieldValue}>{value}</dd>
    </div>
  );
}

function formatLastContacted(iso?: string | null): string {
  if (!iso) return '6+ months ago'; // spec: assume nobody contacted in last 6 months
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
function formatStamp(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
function formatRange(start?: string | null, end?: string | null): string {
  const s = start ? new Date(start).getFullYear() : '?';
  const e = end ? new Date(end).getFullYear() : 'present';
  if (!start && !end) return '—';
  return `${s} – ${e}`;
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
  meta: { display: 'flex', flexWrap: 'wrap', gap: 20, margin: '18px 0' },
  field: { margin: 0 },
  fieldLabel: { margin: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted2, fontWeight: 500 },
  fieldValue: { margin: '4px 0 0', fontSize: 13, color: C.white },
  muted: { color: C.muted },
  tabBar: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 18 },
  tab: {
    padding: '9px 6px',
    border: BORDER,
    borderRadius: 10,
    background: C.panel2,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'inherit',
    color: C.muted,
    textAlign: 'center',
  },
  tabActive: {
    padding: '9px 6px',
    border: `1px solid ${C.green}66`,
    borderRadius: 10,
    background: `${C.green}1f`,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: C.green,
    textAlign: 'center',
  },
  tabContent: { minHeight: 140 },
  sectionCol: { display: 'flex', flexDirection: 'column', gap: 6 },
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
  saveRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' },
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
  empty: { marginTop: 12, color: C.muted, fontSize: 13 },
  openProfileBtn: {
    display: 'inline-block',
    padding: '6px 12px',
    borderRadius: RADIUS.button,
    background: C.green,
    color: C.bg,
    textDecoration: 'none',
    fontSize: 12,
    fontWeight: 700,
  },
  noteList: { listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  noteItem: { border: BORDER, borderRadius: 10, background: C.panel2, padding: '10px 12px' },
  noteStamp: { fontSize: 10.5, color: C.muted2, marginBottom: 4 },
  noteBody: { fontSize: 13, color: C.white, whiteSpace: 'pre-wrap', lineHeight: 1.5 },
  histItem: {
    border: BORDER,
    borderLeft: `3px solid ${C.green}`,
    borderRadius: '0 8px 8px 0',
    background: C.panel2,
    padding: '10px 12px',
  },
  histMain: { fontSize: 13, color: C.white },
  histCompany: { fontWeight: 700 },
  histTitle: { color: C.muted },
  histMeta: { fontSize: 11, color: C.muted2, marginTop: 3 },
  todoNote: { fontSize: 10.5, color: C.muted2, marginTop: 12, marginBottom: 0, lineHeight: 1.5 },
};
