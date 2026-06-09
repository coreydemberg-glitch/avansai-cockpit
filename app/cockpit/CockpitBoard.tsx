'use client';

import { useState, useTransition } from 'react';
import type { Candidate } from './types';
import { saveNotes } from './actions';

const trelloUrl = (cardId: string | null) =>
  cardId ? `https://trello.com/c/${cardId}` : null;

export default function CockpitBoard({
  candidates,
}: {
  candidates: Candidate[];
}) {
  const [selected, setSelected] = useState<Candidate | null>(null);

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Cockpit</h1>
        <span style={styles.count}>
          {candidates.length} candidate{candidates.length === 1 ? '' : 's'}
        </span>
      </header>

      {candidates.length === 0 ? (
        <p style={{ color: '#6b7280' }}>
          No candidates yet. Create a card on the connected Trello board and it
          will appear here.
        </p>
      ) : (
        <div style={styles.grid}>
          {candidates.map((c) => (
            <article key={c.id} style={styles.card}>
              <div style={styles.cardTop}>
                <h2 style={styles.name}>{c.name || 'Untitled'}</h2>
                <StatusBadge status={c.status} />
              </div>
              <p style={styles.role}>{c.role || 'Role not set'}</p>

              <div style={styles.cardLinks}>
                {trelloUrl(c.trello_card_id) && (
                  <a
                    href={trelloUrl(c.trello_card_id)!}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.link}
                  >
                    Trello card ↗
                  </a>
                )}
              </div>

              <button style={styles.openBtn} onClick={() => setSelected(c)}>
                Open
              </button>
            </article>
          ))}
        </div>
      )}

      {selected && (
        <CandidateModal
          candidate={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const label = status || 'New';
  return <span style={styles.badge}>{label}</span>;
}

function CandidateModal({
  candidate,
  onClose,
}: {
  candidate: Candidate;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(candidate.notes ?? '');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [cleaned, setCleaned] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanErr, setCleanErr] = useState<string | null>(null);

  const handleClean = async () => {
    setCleanErr(null);
    setCleaning(true);
    try {
      const res = await fetch('/api/clean-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clean notes');
      setCleaned(data.structured);
    } catch (e) {
      setCleanErr(e instanceof Error ? e.message : 'Failed to clean notes');
    } finally {
      setCleaning(false);
    }
  };

  const handleSave = () => {
    setSaveMsg(null);
    startTransition(async () => {
      const res = await saveNotes(candidate.id, notes);
      setSaveMsg(res.ok ? 'Saved' : `Error: ${res.error ?? 'unknown'}`);
    });
  };

  // Action buttons are stubs for now — wired to clear feedback so the flow is
  // visible. Real integrations (Gmail, Bullhorn, calendar) come next.
  const stub = (label: string) =>
    setActionMsg(`${label} — not connected yet (coming soon)`);

  const tUrl = trelloUrl(candidate.trello_card_id);

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
            <h2 style={{ margin: 0 }}>{candidate.name || 'Untitled'}</h2>
            <p style={styles.modalSub}>{candidate.role || 'Role not set'}</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <dl style={styles.meta}>
          <Field label="Status" value={candidate.status || 'New'} />
          {candidate.linkedin_url && (
            <Field
              label="LinkedIn"
              value={
                <a
                  href={candidate.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.link}
                >
                  Profile ↗
                </a>
              }
            />
          )}
          {tUrl && (
            <Field
              label="Trello"
              value={
                <a
                  href={tUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.link}
                >
                  Card ↗
                </a>
              }
            />
          )}
        </dl>

        <label style={styles.label}>Notes</label>
        <textarea
          style={styles.textarea}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes about this candidate…"
          rows={5}
        />
        <div style={styles.saveRow}>
          <button
            style={styles.cleanBtn}
            onClick={handleClean}
            disabled={cleaning || notes.trim().length === 0}
          >
            {cleaning ? 'Cleaning…' : cleaned ? 'Re-clean notes' : 'Clean notes'}
          </button>
          <button
            style={styles.primaryBtn}
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? 'Saving…' : 'Save notes'}
          </button>
          {saveMsg && (
            <span
              style={{
                ...styles.saveMsg,
                color: saveMsg.startsWith('Error') ? '#b91c1c' : '#15803d',
              }}
            >
              {saveMsg}
            </span>
          )}
        </div>

        {cleanErr && <p style={styles.cleanErrMsg}>{cleanErr}</p>}
        {cleaned !== null && (
          <div style={styles.cleanedBox}>
            <div style={styles.cleanedLabel}>Structured (AI cleanup)</div>
            <div style={styles.cleanedText}>{cleaned}</div>
          </div>
        )}

        <div style={styles.actionsRow}>
          <button style={styles.actionBtn} onClick={() => stub('Email candidate')}>
            ✉️ Email candidate
          </button>
          <button style={styles.actionBtn} onClick={() => stub('Log to Bullhorn')}>
            📋 Log to Bullhorn
          </button>
          <button
            style={styles.actionBtn}
            onClick={() => stub('Schedule follow-up')}
          >
            📅 Schedule follow-up
          </button>
        </div>
        {actionMsg && <p style={styles.actionMsg}>{actionMsg}</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={styles.field}>
      <dt style={styles.fieldLabel}>{label}</dt>
      <dd style={styles.fieldValue}>{value}</dd>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 40,
    fontFamily: 'system-ui, sans-serif',
    maxWidth: 1100,
    margin: '0 auto',
    color: '#111827',
  },
  header: { display: 'flex', alignItems: 'baseline', gap: 12 },
  h1: { margin: 0 },
  count: { color: '#6b7280', fontSize: 14 },
  grid: {
    marginTop: 24,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 16,
  },
  card: {
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: 16,
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  name: { margin: 0, fontSize: 17 },
  role: { margin: 0, color: '#6b7280', fontSize: 14 },
  cardLinks: { display: 'flex', gap: 12, fontSize: 14 },
  link: { color: '#2563eb', textDecoration: 'none' },
  openBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    padding: '6px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#f9fafb',
    cursor: 'pointer',
    fontSize: 14,
  },
  badge: {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
    background: '#f3f4f6',
    border: '1px solid #e5e7eb',
    borderRadius: 999,
    padding: '2px 10px',
    whiteSpace: 'nowrap',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 50,
  },
  modal: {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 520,
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modalSub: { margin: '4px 0 0', color: '#6b7280', fontSize: 14 },
  closeBtn: {
    border: 'none',
    background: 'transparent',
    fontSize: 18,
    cursor: 'pointer',
    color: '#6b7280',
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    margin: '16px 0',
  },
  field: { margin: 0 },
  fieldLabel: {
    margin: 0,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: '#9ca3af',
  },
  fieldValue: { margin: '2px 0 0', fontSize: 14 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  textarea: {
    width: '100%',
    marginTop: 6,
    padding: 10,
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontFamily: 'inherit',
    fontSize: 14,
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  saveRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 },
  primaryBtn: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 6,
    background: '#111827',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
  },
  saveMsg: { fontSize: 13 },
  cleanBtn: {
    padding: '8px 16px',
    border: '1px solid #111827',
    borderRadius: 6,
    background: '#fff',
    color: '#111827',
    cursor: 'pointer',
    fontSize: 14,
  },
  cleanErrMsg: { marginTop: 10, fontSize: 13, color: '#b91c1c' },
  cleanedBox: {
    marginTop: 14,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#f9fafb',
    padding: 14,
  },
  cleanedLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: '#9ca3af',
    marginBottom: 8,
  },
  cleanedText: {
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    color: '#111827',
  },
  actionsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 20,
    borderTop: '1px solid #f3f4f6',
    paddingTop: 16,
  },
  actionBtn: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  },
  actionMsg: { marginTop: 10, fontSize: 13, color: '#6b7280' },
};
