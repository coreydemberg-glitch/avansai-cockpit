'use client';

// Candidate notes/chat dropdown (Candidates Hub build §4). Drops down below a
// candidate bar when the bar (or its Notes icon) is clicked. Transplanted from
// the Sourcing workspace: same composer + green-arrow capture mechanic, same
// debounced autosave pattern (here wired to the candidate notes column via
// saveNotes — "existing logic"). The green arrow flushes the save, raises a BOLD
// to-do in the Candidates to-do list, and collapses the bar back up.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Candidate } from '../types';
import { saveNotes } from '../actions';
import { C, FONT, RADIUS, BORDER } from '../funnel/tokens';

export default function CandidateChat({
  candidate,
  onCapture,
  onClose,
}: {
  candidate: Candidate;
  // Raise the BOLD hub to-do + collapse the bar. Resolves once the to-do is in.
  onCapture: (candidate: Candidate) => Promise<void>;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(candidate.notes ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [capturing, setCapturing] = useState(false);
  const lastSaved = useRef(candidate.notes ?? '');

  // Debounced autosave — same shape as the Sourcing memory autosave.
  const save = useCallback(
    async (value: string) => {
      setStatus('saving');
      const res = await saveNotes(candidate.id, value);
      if (res.ok) {
        lastSaved.current = value;
        setStatus('saved');
      } else {
        setStatus('error');
      }
    },
    [candidate.id]
  );

  useEffect(() => {
    if (notes === lastSaved.current) return;
    setStatus('saving');
    const t = setTimeout(() => save(notes), 1000);
    return () => clearTimeout(t);
  }, [notes, save]);

  // Green arrow: flush any pending edit, raise the to-do, collapse.
  const capture = async () => {
    if (capturing) return;
    setCapturing(true);
    if (notes !== lastSaved.current) await save(notes);
    try {
      await onCapture(candidate);
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div style={styles.dropdown}>
      <div style={styles.head}>
        <span style={styles.label}>
          <i className="ti ti-notes" aria-hidden /> Notes — {candidate.name || 'Untitled'}
        </span>
        <div style={styles.headRight}>
          <SaveStatus status={status} />
          <button style={styles.closeBtn} onClick={onClose} aria-label="Collapse notes">
            ✕
          </button>
        </div>
      </div>

      <div style={styles.composer}>
        <textarea
          style={styles.input}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Type notes — they autosave to the candidate file as you go. Hit the arrow to log a to-do and collapse."
          rows={3}
          autoFocus
        />
        <button
          style={styles.captureBtn}
          onClick={capture}
          disabled={capturing}
          title="Save note, raise a to-do, and collapse"
          aria-label="Capture note"
        >
          <i className={`ti ${capturing ? 'ti-loader-2' : 'ti-arrow-right'}`} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function SaveStatus({
  status,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error';
}) {
  if (status === 'idle') return null;
  const map = {
    saving: { dot: C.amber, text: 'Saving…' },
    saved: { dot: C.green, text: 'Saved' },
    error: { dot: C.red, text: 'Save failed — retrying on next edit' },
  } as const;
  const s = map[status];
  return (
    <span style={styles.saveIndicator}>
      <span style={{ ...styles.saveDot, background: s.dot }} aria-hidden />
      {s.text}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  dropdown: {
    marginTop: -4,
    marginBottom: 2,
    padding: 14,
    background: C.panel2,
    border: `1px solid ${C.line2}`,
    borderTop: 'none',
    borderRadius: `0 0 ${RADIUS.card}px ${RADIUS.card}px`,
    fontFamily: FONT,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: C.muted2,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  headRight: { display: 'flex', alignItems: 'center', gap: 12 },
  saveIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    color: C.muted,
  },
  saveDot: { width: 7, height: 7, borderRadius: '50%' },
  closeBtn: {
    border: 'none',
    background: 'transparent',
    fontSize: 14,
    cursor: 'pointer',
    color: C.muted,
    lineHeight: 1,
    padding: 4,
    fontFamily: FONT,
  },
  composer: { display: 'flex', gap: 8, alignItems: 'flex-end' },
  input: {
    flex: 1,
    padding: 11,
    background: C.panel,
    border: BORDER,
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 13.5,
    color: C.white,
    resize: 'none',
    boxSizing: 'border-box',
  },
  captureBtn: {
    width: 38,
    height: 38,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${C.green}66`,
    borderRadius: RADIUS.button,
    background: `${C.green}1f`,
    color: C.green,
    cursor: 'pointer',
    fontSize: 18,
  },
};
