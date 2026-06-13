'use client';

// Candidates hub to-do rail (Candidates Hub build §5). Same component language as
// the cockpit-home To-Do panel (ActionItemsPanel), but HUB-SCOPED: it shows only
// candidate-hub to-dos (manual + candidate-scoped) and renders them BOLD. It
// never shows Sourcing to-dos, and the home master never collapses into here —
// no cross-bleed. Refetches whenever `refreshKey` changes (a bar raises a to-do).
import { useEffect, useMemo, useState } from 'react';
import type { ActionItem, Candidate } from '../types';
import { C, FONT, RADIUS, BORDER } from '../funnel/tokens';
import { listCandidateTodos } from './actions';
import { removeActionItem } from '../funnel/actionItemActions';

export default function CandidatesTodoPanel({
  refreshKey,
  candidates,
  onOpenCandidate,
}: {
  refreshKey: number;
  candidates: Candidate[];
  // Jump back to the candidate (opens the modal) — the §2 "source" link.
  onOpenCandidate: (id: string) => void;
}) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const candById = useMemo(
    () => new Map(candidates.map((c) => [c.id, c])),
    [candidates]
  );

  // §2 copy module: drop the candidate's CLEANED notes onto the clipboard
  // (falls back to raw notes, then the to-do title, so it works before 0008 is
  // applied). Built for end-of-week documentation: open rail → copy → paste.
  async function copyNotes(it: ActionItem) {
    const cand = it.candidate_id ? candById.get(it.candidate_id) : null;
    const text = (
      cand?.notes_clean?.trim() ||
      cand?.notes?.trim() ||
      it.title ||
      ''
    ).trim();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(it.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  useEffect(() => {
    let live = true;
    listCandidateTodos().then((res) => {
      if (live && res.ok) setItems(res.items);
    });
    return () => {
      live = false;
    };
  }, [refreshKey]);

  async function handleRemove(id: string) {
    const prev = items;
    setItems((list) => list.filter((it) => it.id !== id));
    const res = await removeActionItem(id);
    if (!res.ok) setItems(prev);
  }

  return (
    <section style={styles.panel}>
      <div style={styles.head}>
        <span style={styles.title}>
          <span style={styles.mark} aria-hidden />
          Candidates To-Do
        </span>
        <span style={styles.count}>{items.length}</span>
      </div>

      <div style={styles.body}>
        {items.length === 0 ? (
          <p style={styles.empty}>
            Add notes or a résumé to a candidate — a to-do lands here.
          </p>
        ) : (
          <ul style={styles.list}>
            {items.map((it) => {
              // Display just the candidate's name — the row's whole job is to be
              // a fast jump-back. No "notes on file" suffix, no job title; the
              // icons carry the actions (Corey's ask).
              const cand = it.candidate_id ? candById.get(it.candidate_id) : null;
              const label = cand?.name?.trim() || it.title || 'Candidate';
              const openable = !!it.candidate_id;
              return (
                <li key={it.id}>
                  <div
                    style={{ ...styles.row, ...(openable ? styles.rowClickable : null) }}
                    role={openable ? 'button' : undefined}
                    tabIndex={openable ? 0 : undefined}
                    title={openable ? 'Open candidate' : undefined}
                    onClick={openable ? () => onOpenCandidate(it.candidate_id as string) : undefined}
                    onKeyDown={
                      openable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onOpenCandidate(it.candidate_id as string);
                            }
                          }
                        : undefined
                    }
                  >
                    <span style={styles.text}>{label}</span>
                    <div style={styles.rowActions}>
                      <button
                        type="button"
                        style={styles.copyBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyNotes(it);
                        }}
                        title="Copy cleaned notes to clipboard"
                        aria-label="Copy cleaned notes"
                      >
                        <i
                          className={`ti ${copiedId === it.id ? 'ti-check' : 'ti-copy'}`}
                          style={copiedId === it.id ? { color: C.green } : undefined}
                          aria-hidden
                        />
                      </button>
                      <button
                        type="button"
                        style={styles.removeBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRemove(it.id);
                        }}
                        aria-label="Remove to-do"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: C.panel2,
    border: BORDER,
    borderRadius: 12,
    padding: '14px 14px',
    fontFamily: FONT,
    boxSizing: 'border-box',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    flexShrink: 0,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    fontWeight: 800,
    color: C.white,
    letterSpacing: '-0.01em',
  },
  mark: {
    width: 12,
    height: 12,
    borderRadius: 4,
    background: C.green,
    boxShadow: `0 0 10px ${C.green}55`,
    display: 'inline-block',
  },
  count: {
    fontSize: 11,
    fontWeight: 800,
    color: C.green,
    background: 'rgba(63,223,135,.12)',
    border: '1px solid rgba(63,223,135,.30)',
    borderRadius: RADIUS.chip,
    padding: '2px 9px',
    minWidth: 22,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
  },
  empty: { color: C.muted, fontSize: 12, margin: '6px 0', lineHeight: 1.5 },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 11px',
    background: C.panel,
    border: BORDER,
    borderRadius: RADIUS.card,
  },
  rowClickable: { cursor: 'pointer' },
  // Minimal: just the candidate's name, quiet weight, single line with an
  // ellipsis. The icons carry the actions; clicking the row opens the candidate.
  text: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    fontWeight: 600,
    color: C.white,
    lineHeight: 1.3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  rowActions: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 },
  copyBtn: {
    flexShrink: 0,
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    color: C.green,
    background: `${C.green}14`,
    border: `1px solid ${C.green}40`,
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: FONT,
    lineHeight: 1,
    padding: 0,
  },
  removeBtn: {
    flexShrink: 0,
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    color: C.muted,
    background: C.panelHi,
    border: BORDER,
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: FONT,
    lineHeight: 1,
    padding: 0,
  },
};
