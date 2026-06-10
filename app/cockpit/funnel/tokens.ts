// Funnel design system — build spec §7 + the 8-stage slider build. Single source
// of truth for the palette, status colors, and shape language so every funnel
// component stays consistent. Re-skinned to the matrix/cyberpunk command-center
// aesthetic: near-black background, gloss-black panels, neon-emerald (#22FF88)
// accents, emerald borders at 15–25% opacity.

export const C = {
  bg: '#070709', // near-black page (#050505–#0A0A0A range)
  panel: '#0E0E12', // gloss black panel
  panel2: '#0A0A0D', // deeper inset surface (tracks, nested cards)
  panelHi: '#16161d', // slightly elevated surface for hover / nested cards
  line: 'rgba(34,255,136,0.15)', // neon emerald border @15%
  line2: 'rgba(34,255,136,0.24)', // higher-contrast emerald border so cards "pop"
  green: '#22FF88', // neon emerald — the hero accent
  greenDim: '#0f7a45', // dimmed emerald for idle/secondary green
  teal: '#2dd4bf',
  amber: '#fbbf24',
  red: '#FF4D6D', // danger / not prepped — high-contrast against the dark bg
  blue: '#8aa0ff',
  linkedin: '#0a66c2', // LinkedIn brand blue for the direct profile button
  white: '#F4F6F5',
  muted: '#A0A0A0',
  muted2: '#6B6B72',
} as const;

// Soft emerald glow used for the "laser"/illuminated treatments (stage rings,
// solid prep segments, the slider thumb on hover).
export const GLOW = {
  ring: '0 0 10px rgba(34,255,136,0.55), inset 0 0 6px rgba(34,255,136,0.25)',
  soft: '0 0 8px rgba(34,255,136,0.45)',
  laser: '0 0 6px rgba(34,255,136,0.7)',
} as const;

// Status colors. Funnel reads as a binary the recruiter asked for:
// red = not prepped, green = prepped/advancing; grey = DQ / exited. `pending`
// keeps the amber alias used by non-funnel surfaces (pills, action rows).
export const STATUS = {
  notPrepped: C.red,
  prepped: C.green,
  pending: C.amber,
  dq: C.muted2,
} as const;

export type StatusKey = keyof typeof STATUS;

export const FONT = 'Manrope, "Segoe UI", system-ui, sans-serif';

// Shape language (spec §7): cards 12–16, chips/bubbles 8–10, buttons 7.
export const RADIUS = {
  card: 16,
  chip: 9,
  button: 7,
} as const;

export const BORDER = `1px solid ${C.line}`;

// ── 8-stage funnel (slider build §1) ────────────────────────────────────────
// Full names sit under each stage circle; the short labels feed the per-row
// slider readout (e.g. "5.0 TECHNICAL INTERVIEW 1").
export const STAGE_COUNT = 8;

export const STAGE_LABELS: Record<number, string> = {
  1: 'Identified',
  2: 'Submitted',
  3: 'HR Interview',
  4: 'Hiring Manager Interview',
  5: 'Technical Interview 1',
  6: 'Technical Interview 2',
  7: 'Final Round Interview',
  8: 'Offer',
};

// Two-line splits for the labels under the circles (keeps the funnel compact).
export const STAGE_LABEL_LINES: Record<number, string[]> = {
  1: ['Identified'],
  2: ['Submitted'],
  3: ['HR Interview'],
  4: ['Hiring Manager', 'Interview'],
  5: ['Technical', 'Interview 1'],
  6: ['Technical', 'Interview 2'],
  7: ['Final Round', 'Interview'],
  8: ['Offer'],
};

export const stageLabel = (n: number): string => STAGE_LABELS[n] ?? `Stage ${n}`;
