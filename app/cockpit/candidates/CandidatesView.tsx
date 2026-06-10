'use client';

// Candidates Hub (Candidates Hub build §1). The candidate bars used to live at
// the bottom of the cockpit home; they now live here, behind the left-sidebar
// "Candidates" tab. Everything they carried is preserved — the Trello-fed list,
// the interview slider, and the "not ready" prep signal — because this hub reads
// the SAME `candidates` rows the home funnel reads (passed down from the server
// page → CockpitBoard), and the Trello webhook still writes those rows. Nothing
// about the Supabase/Trello plumbing changed; only where the bars are displayed.
import { useEffect, useRef, useState } from 'react';
import type { Candidate } from '../types';
import { C, FONT, RADIUS, BORDER } from '../funnel/tokens';
import CandidateRow from '../funnel/CandidateSlider';
import CandidateChat from './CandidateChat';
import { addCandidateTodo, ensureCandidateSignalTodos } from './actions';

// §3 signal title — what notes/résumé is on file for a candidate.
function signalTitle(c: Candidate): string {
  const name = c.name || 'Candidate';
  const hasNotes = !!c.notes && c.notes.trim().length > 0;
  const hasResume = !!c.resume && /^https?:\/\//i.test(c.resume);
  if (hasNotes && hasResume) return `${name} — notes + résumé on file`;
  if (hasResume) return `${name} — résumé on file`;
  return `${name} — notes on file`;
}

export default function CandidatesView({
  candidates,
  onCommit,
  onOpenDetail,
  onArchive,
  onTodoChanged,
}: {
  candidates: Candidate[];
  onCommit: (c: Candidate, value: number) => void;
  onOpenDetail: (c: Candidate) => void;
  onArchive: (c: Candidate, archived: boolean) => void;
  // Bump the hub to-do rail (a bar raised or affirmed a to-do).
  onTodoChanged: () => void;
}) {
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [openChatId, setOpenChatId] = useState<string | null>(null);

  const active = candidates.filter((c) => !c.archived);
  const archived = candidates.filter((c) => c.archived);
  const shown = view === 'active' ? active : archived;

  // §3: on mount, ensure a BOLD to-do exists for every active candidate that has
  // notes or a résumé on file. Idempotent server-side (one open per candidate).
  const signalled = useRef(false);
  useEffect(() => {
    if (signalled.current) return;
    signalled.current = true;
    const items = active
      .filter(
        (c) =>
          (!!c.notes && c.notes.trim().length > 0) ||
          (!!c.resume && /^https?:\/\//i.test(c.resume))
      )
      .map((c) => ({ candidateId: c.id, title: signalTitle(c) }));
    if (items.length) {
      ensureCandidateSignalTodos(items).then(() => onTodoChanged());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // §4 green-arrow capture → raise the BOLD to-do + collapse the bar.
  const handleCapture = async (c: Candidate) => {
    await addCandidateTodo(c.id, `${c.name || 'Candidate'} — review notes`);
    onTodoChanged();
    setOpenChatId(null);
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.head}>
        <div>
          <span style={styles.eyebrow}>Candidates</span>
          <p style={styles.sub}>
            Trello-fed pipeline — slider stages, notes, résumés, and prep signals
          </p>
        </div>
      </div>

      <div style={styles.viewToggle}>
        <button
          style={view === 'active' ? styles.viewTabActive : styles.viewTab}
          onClick={() => setView('active')}
        >
          Active ({active.length})
        </button>
        <button
          style={view === 'archived' ? styles.viewTabActive : styles.viewTab}
          onClick={() => setView('archived')}
        >
          Archived ({archived.length})
        </button>
      </div>

      {shown.length === 0 ? (
        <p style={styles.empty}>
          {view === 'active'
            ? 'No candidates here yet. Add yourself as a member on a Trello card and it will appear.'
            : 'Nothing archived.'}
        </p>
      ) : (
        <div style={styles.list}>
          {shown.map((c) => (
            <div key={c.id}>
              <CandidateRow
                candidate={c}
                archived={view === 'archived'}
                onCommit={onCommit}
                onOpenDetail={onOpenDetail}
                onArchive={onArchive}
                onToggleChat={
                  view === 'archived'
                    ? undefined
                    : (cand) =>
                        setOpenChatId((cur) => (cur === cand.id ? null : cand.id))
                }
                chatOpen={openChatId === c.id}
              />
              {openChatId === c.id && view === 'active' && (
                <CandidateChat
                  candidate={c}
                  onCapture={handleCapture}
                  onClose={() => setOpenChatId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { marginTop: 28, fontFamily: FONT },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: C.green,
    fontWeight: 800,
  },
  sub: { margin: '6px 0 0', color: C.muted, fontSize: 13 },
  viewToggle: { marginTop: 20, display: 'flex', gap: 6 },
  viewTab: {
    padding: '6px 12px',
    border: BORDER,
    borderRadius: 999,
    background: 'transparent',
    color: C.muted,
    fontSize: 12,
    fontWeight: 500,
    fontFamily: FONT,
    cursor: 'pointer',
  },
  viewTabActive: {
    padding: '6px 12px',
    border: `1px solid ${C.green}66`,
    borderRadius: 999,
    background: `${C.green}1f`,
    color: C.green,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: FONT,
    cursor: 'pointer',
  },
  empty: { marginTop: 20, color: C.muted, fontSize: 14 },
  list: { marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 },
};
