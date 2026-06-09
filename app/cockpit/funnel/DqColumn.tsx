'use client';

import type { Candidate } from '../types';
import { C, FONT, BORDER } from './tokens';

// Which milestone a candidate exited after, from the funnel_stage retained on the
// DQ row (the stage they left). Mirrors the mockup's "DQ'd after R1".
function exitedAfter(stage: number | null | undefined): string {
  if ((stage ?? 0) >= 4) return "DQ'd after R2";
  if (stage === 3) return "DQ'd after R1";
  if (stage === 2) return "DQ'd after submission";
  return "DQ'd";
}

// The DQ column (approved mockup §7): candidates that exited the funnel (dq =
// true). Same send plumbing as a pending action — the thank-you email fires from
// the Send button here.
export default function DqColumn({
  candidates,
  onThankYou,
}: {
  candidates: Candidate[];
  onThankYou: (candidateId: string) => void;
}) {
  return (
    <section style={styles.panel}>
      <div style={styles.head}>
        <span style={styles.eyebrow}>DQ column</span>
        <span style={styles.meta}>same plumbing as pending</span>
      </div>

      {candidates.length === 0 ? (
        <p style={styles.empty}>No disqualified candidates.</p>
      ) : (
        <ul style={styles.list}>
          {candidates.map((c) => (
            <li key={c.id} style={styles.row}>
              <i className="ti ti-user-x" style={styles.icon} aria-hidden />
              <div style={styles.body}>
                <div style={styles.name}>{c.name || 'Untitled'}</div>
                <div style={styles.sub}>{exitedAfter(c.funnel_stage)}</div>
              </div>
              <button
                type="button"
                style={styles.sendBtn}
                onClick={() => onThankYou(c.id)}
                title="Send thank-you email"
              >
                Send
              </button>
            </li>
          ))}
        </ul>
      )}

      <p style={styles.note}>
        Thank-you email + attachment fires from here — attachment TBD for MVP.
      </p>
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
    color: C.muted,
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
    gap: 8,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '11px 12px',
    background: C.panel,
    border: BORDER,
    borderLeft: `3px solid ${C.muted2}`,
    borderRadius: '0 8px 8px 0',
  },
  icon: { fontSize: 18, color: C.muted, flexShrink: 0 },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 13, fontWeight: 700, color: '#dde0ea' },
  sub: { fontSize: 11, color: C.muted2 },
  sendBtn: {
    fontSize: 12,
    fontWeight: 700,
    color: C.muted,
    background: 'transparent',
    border: BORDER,
    borderRadius: 7,
    padding: '7px 10px',
    cursor: 'pointer',
    fontFamily: FONT,
    flexShrink: 0,
  },
  note: {
    fontSize: 10.5,
    color: C.muted2,
    marginTop: 10,
    marginBottom: 0,
    lineHeight: 1.5,
  },
};
