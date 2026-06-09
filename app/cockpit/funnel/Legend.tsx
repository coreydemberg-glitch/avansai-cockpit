'use client';

import { C, STATUS, FONT } from './tokens';

// Spec §7 legend: pending / prepped / DQ.
const ITEMS: { label: string; color: string }[] = [
  { label: 'pending · post-interview', color: STATUS.pending },
  { label: 'prepped · advancing', color: STATUS.prepped },
  { label: 'exited to DQ', color: STATUS.dq },
];

export default function Legend() {
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: FONT }}>
      {ITEMS.map((it) => (
        <span
          key={it.label}
          style={{ display: 'flex', alignItems: 'center', gap: 7 }}
        >
          <span
            style={{
              width: 22,
              height: 0,
              borderTop: `2.5px ${
                it.color === STATUS.prepped ? 'solid' : 'dashed'
              } ${it.color}`,
            }}
          />
          <span style={{ fontSize: 11, color: C.muted }}>{it.label}</span>
        </span>
      ))}
    </div>
  );
}
