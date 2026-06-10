'use client';

import { C, STATUS, FONT } from './tokens';

// Spec §7 legend, reduced to the binary the recruiter asked for: not-prepped (red)
// then prepped (green). Rendered as a sleek inline-flex so it sits cleanly inside a
// header row — each item is a small rounded-square color swatch + label.
const ITEMS: { label: string; color: string }[] = [
  { label: 'Not prepped', color: STATUS.notPrepped },
  { label: 'Prepped', color: STATUS.prepped },
];

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 16,
    fontFamily: FONT,
  },
  item: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
    flex: '0 0 auto',
  },
  label: {
    fontSize: 11,
    color: C.muted,
  },
};

export default function Legend() {
  return (
    <div style={styles.root}>
      {ITEMS.map((it) => (
        <span key={it.label} style={styles.item}>
          <span style={{ ...styles.swatch, background: it.color }} />
          <span style={styles.label}>{it.label}</span>
        </span>
      ))}
    </div>
  );
}
