'use client';

import { C, STATUS, FONT } from './tokens';

// Funnel legend (slider build §2): a solid green "laser" line = prep sent /
// complete, a dotted green line = not prepped. Rendered as small inline SVG line
// samples so it reads exactly like the connectors in the funnel above it.
const styles: Record<string, React.CSSProperties> = {
  root: { display: 'inline-flex', alignItems: 'center', gap: 18, fontFamily: FONT },
  item: { display: 'inline-flex', alignItems: 'center', gap: 8 },
  label: {
    fontSize: 10,
    fontWeight: 600,
    color: C.muted,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
};

function Sample({ solid }: { solid: boolean }) {
  return (
    <svg width="34" height="8" viewBox="0 0 34 8" aria-hidden>
      <line
        x1="1"
        y1="4"
        x2="33"
        y2="4"
        stroke={STATUS.prepped}
        strokeWidth={solid ? 2.4 : 1.6}
        strokeDasharray={solid ? undefined : '1 5'}
        strokeLinecap="round"
        opacity={solid ? 1 : 0.6}
        style={solid ? { filter: 'drop-shadow(0 0 3px rgba(34,255,136,0.8))' } : undefined}
      />
    </svg>
  );
}

export default function Legend() {
  return (
    <div style={styles.root}>
      <span style={styles.item}>
        <Sample solid />
        <span style={styles.label}>Prep sent / complete</span>
      </span>
      <span style={styles.item}>
        <Sample solid={false} />
        <span style={styles.label}>Not prepped</span>
      </span>
    </div>
  );
}
