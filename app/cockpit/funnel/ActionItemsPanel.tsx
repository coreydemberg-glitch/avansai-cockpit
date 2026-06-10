'use client';

import { useEffect, useState } from 'react';
import type {
  ActionItem,
  ActionItemWithCandidate,
  ActionContext,
} from '../types';
import { C, FONT, RADIUS, BORDER } from './tokens';
import {
  listManualActionItems,
  addManualActionItem,
  removeActionItem,
} from './actionItemActions';

// Per-type icon (approved mockup §7). prep is the actionable row (amber accent +
// green Send button); feedback is passive (blue note icon, "later"). thankyou
// belongs to the DQ column, so it never appears here.
const ICON: Record<'prep' | 'feedback', { icon: string; color: string }> = {
  prep: { icon: 'ti-mail', color: C.amber },
  feedback: { icon: 'ti-notes', color: C.blue },
};

// Verb + status line for a row, made round-aware (R1 vs R2) from the candidate's
// funnel stage: prep at the manager round (stage ≥ 4) is R2, everything else R1.
function rowCopy(type: 'prep' | 'feedback', stage: number | null | undefined) {
  const round = (stage ?? 0) >= 4 ? 'R2' : 'R1';
  return type === 'prep'
    ? { verb: `Send ${round} interview prep`, status: 'prep owed' }
    : { verb: `Log ${round} feedback`, status: 'awaiting notes' };
}

// Right-sidebar To-Do panel (spec §7). Combines recruiter-created `manual`
// to-dos (loaded/added/removed via actionItemActions) with the auto-populated
// prep/feedback rows passed down from the funnel page.
export default function ActionItemsPanel({
  autoItems,
  onOpen,
}: {
  autoItems: ActionItemWithCandidate[];
  onOpen: (candidateId: string, context: ActionContext) => void;
}) {
  // Manual to-dos live in local state: hydrated on mount, mutated optimistically.
  const [manual, setManual] = useState<ActionItem[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let live = true;
    listManualActionItems().then((res) => {
      if (live && res.ok) setManual(res.items);
    });
    return () => {
      live = false;
    };
  }, []);

  // Surface prep + feedback to-dos; thank-you to-dos live in the DQ column (same
  // plumbing), so they're excluded here to match the mockup.
  const auto = autoItems.filter(
    (it) => it.type === 'prep' || it.type === 'feedback'
  );
  const count = manual.length + auto.length;

  // Optimistically prepend a temp row, then swap in the persisted one (or roll
  // back if the insert fails).
  async function handleAdd() {
    const title = draft.trim();
    if (!title) return;
    const tempId = `tmp-${Date.now()}`;
    const optimistic: ActionItem = {
      id: tempId,
      candidate_id: null,
      type: 'manual',
      title,
      status: 'open',
    };
    setManual((prev) => [optimistic, ...prev]);
    setDraft('');

    const res = await addManualActionItem(title);
    if (res.ok && res.item) {
      setManual((prev) =>
        prev.map((it) => (it.id === tempId ? (res.item as ActionItem) : it))
      );
    } else {
      // Roll back the optimistic insert on failure.
      setManual((prev) => prev.filter((it) => it.id !== tempId));
    }
  }

  // Optimistically drop the row, restoring it if the delete fails.
  async function handleRemove(id: string) {
    const prevList = manual;
    setManual((prev) => prev.filter((it) => it.id !== id));
    const res = await removeActionItem(id);
    if (!res.ok) setManual(prevList);
  }

  return (
    <section style={styles.panel}>
      <div style={styles.head}>
        <span style={styles.title}>
          <span style={styles.mark} aria-hidden />
          To Do
        </span>
        <span style={styles.count}>{count}</span>
      </div>

      <div style={styles.addRow}>
        <input
          style={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleAdd();
            }
          }}
          placeholder="Add a to-do…"
          aria-label="Add a to-do"
        />
        <button
          type="button"
          style={styles.addBtn}
          onClick={() => void handleAdd()}
          disabled={!draft.trim()}
        >
          Add
        </button>
      </div>

      <div style={styles.body}>
        {count === 0 ? (
          <p style={styles.empty}>Nothing to do — you’re all caught up.</p>
        ) : (
          <>
            {manual.length > 0 && (
              <ul style={styles.list}>
                {manual.map((it) => (
                  <li key={it.id}>
                    <div style={styles.manualRow}>
                      <span style={styles.manualText}>{it.title}</span>
                      <button
                        type="button"
                        style={styles.removeBtn}
                        onClick={() => void handleRemove(it.id)}
                        aria-label="Remove to-do"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {auto.length > 0 && (
              <>
                <div style={styles.divider}>
                  <span style={styles.dividerLabel}>Auto</span>
                </div>
                <ul style={styles.list}>
                  {auto.map((it) => {
                    const type = it.type as 'prep' | 'feedback';
                    const icon = ICON[type];
                    const name = it.candidate?.name || 'Unknown candidate';
                    const { verb, status } = rowCopy(
                      type,
                      it.candidate?.funnel_stage
                    );
                    const actionable = type === 'prep';
                    return (
                      <li key={it.id}>
                        <div
                          style={actionable ? styles.rowPrep : styles.rowPlain}
                        >
                          <i
                            className={`ti ${icon.icon}`}
                            style={{ ...styles.icon, color: icon.color }}
                            aria-hidden
                          />
                          <div style={styles.autoBody}>
                            <div style={styles.verb}>{verb}</div>
                            <div style={styles.sub}>
                              {name} · {status}
                            </div>
                          </div>
                          {actionable ? (
                            <button
                              type="button"
                              style={styles.sendBtn}
                              onClick={() =>
                                it.candidate && onOpen(it.candidate.id, type)
                              }
                              disabled={!it.candidate}
                            >
                              Send
                            </button>
                          ) : (
                            <span style={styles.later}>later</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
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
  addRow: {
    display: 'flex',
    gap: 7,
    marginBottom: 12,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontFamily: FONT,
    color: C.white,
    background: C.panel,
    border: BORDER,
    borderRadius: RADIUS.button,
    padding: '8px 10px',
    outline: 'none',
  },
  addBtn: {
    fontSize: 12,
    fontWeight: 800,
    color: '#0e2a18',
    background: C.green,
    border: 'none',
    borderRadius: RADIUS.button,
    padding: '8px 13px',
    cursor: 'pointer',
    fontFamily: FONT,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
  },
  empty: {
    color: C.muted,
    fontSize: 12,
    margin: '6px 0',
    lineHeight: 1.5,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  manualRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 11px',
    background: C.panel,
    border: BORDER,
    borderRadius: RADIUS.card,
  },
  manualText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 600,
    color: C.white,
    lineHeight: 1.35,
    wordBreak: 'break-word',
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
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '4px 0 2px',
  },
  dividerLabel: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: C.muted2,
  },
  rowPrep: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 11px',
    background: C.panel,
    border: '1px solid rgba(251,191,36,.35)',
    borderLeft: `3px solid ${C.amber}`,
    borderRadius: '0 8px 8px 0',
  },
  rowPlain: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 11px',
    background: C.panel,
    border: BORDER,
    borderRadius: 8,
  },
  icon: { fontSize: 17, flexShrink: 0 },
  autoBody: { flex: 1, minWidth: 0 },
  verb: { fontSize: 12, fontWeight: 700, color: C.white },
  sub: {
    fontSize: 11,
    color: C.muted,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  sendBtn: {
    fontSize: 12,
    fontWeight: 700,
    color: '#0e2a18',
    background: C.green,
    border: 'none',
    borderRadius: RADIUS.button,
    padding: '6px 11px',
    cursor: 'pointer',
    fontFamily: FONT,
    flexShrink: 0,
  },
  later: { fontSize: 11, color: C.muted2, flexShrink: 0 },
};
