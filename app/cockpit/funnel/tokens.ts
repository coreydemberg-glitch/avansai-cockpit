// Funnel design system — build spec §7. Single source of truth for the palette,
// status colors, and shape language so every funnel component stays consistent.

export const C = {
  bg: '#1c1c23',
  panel: '#2a2a34',
  panel2: '#23232c',
  line: '#383844',
  green: '#3fdf87',
  teal: '#2dd4bf',
  amber: '#fbbf24',
  blue: '#8aa0ff',
  white: '#f4f5f8',
  muted: '#9b9ba8',
  muted2: '#6b6b78',
} as const;

// Status colors (spec §7): amber = pending / action needed, green = prepped /
// advancing, grey = DQ / exited.
export const STATUS = {
  pending: C.amber,
  prepped: C.green,
  dq: C.muted2,
} as const;

export type StatusKey = keyof typeof STATUS;

export const FONT = 'Manrope, "Segoe UI", system-ui, sans-serif';

// Shape language (spec §7): cards 12–14, chips/bubbles 8–10, buttons 7.
export const RADIUS = {
  card: 14,
  chip: 9,
  button: 7,
} as const;

export const BORDER = `1px solid ${C.line}`;

// Funnel stage labels, indexed 1..5 (spec §3). Stage 1 collapses Identified +
// Call Schedule on purpose.
export const STAGE_LABELS: Record<number, string> = {
  1: 'Identified',
  2: 'Submitted',
  3: 'R1 interview',
  4: 'R2 interview',
  5: 'Offer',
};
