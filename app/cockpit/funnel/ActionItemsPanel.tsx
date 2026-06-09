'use client';

import type { ActionItemWithCandidate, ActionContext } from '../types';
import { C, FONT, BORDER } from './tokens';

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

// Auto-populated to-do list, read straight from open `action_items` (spec §7).
export default function ActionItemsPanel({
  items,
  onOpen,
}: {
  items: ActionItemWithCandidate[];
  onOpen: (candidateId: string, context: ActionContext) => void;
}) {
  // Surface prep + feedback to-dos; thank-you to-dos live in the DQ column (same
  // plumbing), so they're excluded here to match the mockup.
  const shown = items.filter((it) => it.type === 'prep' || it.type === 'feedback');

  return (
    <section style={styles.panel}>
      <div style={styles.head}>
        <span style={styles.eyebrow}>Action items</span>
        <span style={styles.meta}>auto-populated</span>
      </div>

      {shown.length === 0 ? (
        <p style={styles.empty}>Nothing to do right now — you’re all caught up.</p>
      ) : (
        <ul style={styles.list}>
          {shown.map((it) => {
            const type = it.type as 'prep' | 'feedback';
            const icon = ICON[type];
            const name = it.candidate?.name || 'Unknown candidate';
            const { verb, status } = rowCopy(type, it.candidate?.funnel_stage);
            const actionable = type === 'prep';
            return (
              <li key={it.id}>
                <div style={actionable ? styles.rowPrep : styles.rowPlain}>
                  <i
                    className={`ti ${icon.icon}`}
                    style={{ ...styles.icon, color: icon.color }}
                    aria-hidden
                  />
                  <div style={styles.body}>
                    <div style={styles.verb}>{verb}</div>
                    <div style={styles.sub}>
                      {name} · {status}
                    </div>
                  </div>
                  {actionable ? (
                    <button
                      type="button"
                      style={styles.sendBtn}
                      onClick={() => it.candidate && onOpen(it.candidate.id, type)}
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
      )}
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: C.panel2,
    border: BORDER,
    borderRadius: 12,
    padding: '14px 16px',
    fontFamily: FONT,
    flex: 1,
    minWidth: 240,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: C.green,
    fontWeight: 800,
  },
  meta: { fontSize: 11, color: C.muted2 },
  empty: { color: C.muted, fontSize: 13, margin: '6px 0' },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
  },
  rowPrep: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '11px 12px',
    background: C.panel,
    border: '1px solid rgba(251,191,36,.35)',
    borderLeft: `3px solid ${C.amber}`,
    borderRadius: '0 8px 8px 0',
  },
  rowPlain: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '11px 12px',
    background: C.panel,
    border: BORDER,
    borderRadius: 8,
  },
  icon: { fontSize: 18, flexShrink: 0 },
  body: { flex: 1, minWidth: 0 },
  verb: { fontSize: 13, fontWeight: 700, color: C.white },
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
    borderRadius: 7,
    padding: '7px 12px',
    cursor: 'pointer',
    fontFamily: FONT,
    flexShrink: 0,
  },
  later: { fontSize: 11, color: C.muted2, flexShrink: 0 },
};
