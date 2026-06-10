'use client';

import { C, FONT, BORDER, RADIUS } from '../funnel/tokens';

// A clickable dashboard "quadrant" preview tile (matches the funnel panel
// template: section + head with eyebrow/meta + body). One component backs both
// the Outbound and Referral tiles. Clicking it drills into the full view
// (fewer clicks: the whole tile is the target, plus an explicit Open button).
export default function QuadrantTile({
  eyebrow,
  icon,
  headline,
  stats,
  onOpen,
}: {
  eyebrow: string;
  icon: string;
  headline: string;
  stats: { label: string; value: number | string }[];
  onOpen: () => void;
}) {
  return (
    <section
      style={styles.panel}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div style={styles.head}>
        <span style={styles.eyebrow}>
          <i className={`ti ${icon}`} aria-hidden /> {eyebrow}
        </span>
        <span style={styles.meta}>Open →</span>
      </div>
      <div style={styles.headline}>{headline}</div>
      <div style={styles.statsRow}>
        {stats.map((s) => (
          <div key={s.label} style={styles.stat}>
            <div style={styles.statValue}>{s.value}</div>
            <div style={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>
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
    cursor: 'pointer',
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
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  meta: { fontSize: 11, color: C.muted2 },
  headline: { fontSize: 13, color: C.muted, marginBottom: 12 },
  statsRow: { display: 'flex', gap: 18 },
  stat: { display: 'flex', flexDirection: 'column', gap: 2 },
  statValue: { fontSize: 22, fontWeight: 700, color: C.white, letterSpacing: '-0.02em' },
  statLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: C.muted2,
  },
  note: { fontSize: 10.5, color: C.muted2, marginTop: 10, marginBottom: 0 },
};
