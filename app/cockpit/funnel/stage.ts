// Pure stage/slider math for the 8-stage funnel (slider build §3). The slider
// runs 1.0 → 8.0 and snaps to half-steps only (1.0, 1.5, … 7.5, 8.0). We keep
// every conversion between the slider value and the stored columns here so the
// component stays a thin renderer and the half-step rules are easy to reason about.
import type { Candidate } from '../types';
import { STAGE_COUNT, stageLabel } from './tokens';

export const MIN = 1;
export const MAX = STAGE_COUNT; // 8

export const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

// Snap a raw drag value to the nearest half-step and clamp to [1, 8]. The result
// is always a clean .0 or .5 — never an arbitrary value like 1.75 or 2.3.
export function snapHalf(v: number): number {
  return clamp(Math.round(v * 2) / 2);
}

export const isHalfStep = (v: number) => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9 && (Math.round(v * 2) % 2 !== 0);

// The slider value a candidate currently sits at, from the stored columns:
//   funnel_stage (1..8) + half-step when `pending`.
export function sliderValue(c: Pick<Candidate, 'funnel_stage' | 'pending'>): number {
  const stage = clamp(c.funnel_stage ?? 1);
  return c.pending ? clamp(stage + 0.5) : stage;
}

// Decompose a (snapped) slider value into the columns we persist.
//   3.0 → { funnel_stage: 3, pending: false }
//   3.5 → { funnel_stage: 3, pending: true  }
export function decompose(value: number): { funnel_stage: number; pending: boolean } {
  const snapped = snapHalf(value);
  return { funnel_stage: Math.floor(snapped), pending: isHalfStep(snapped) };
}

// The stage whose name a slider value reads under (the floored whole stage).
export const stageOf = (value: number) => Math.floor(snapHalf(value));

// The readout shown beside the slider, e.g.:
//   1.0 → "1.0 IDENTIFIED"
//   3.5 (prep sent) → "3.5 HR INTERVIEW (PREP SENT)"
//   3.5 (not sent)  → "3.5 HR INTERVIEW (PREP NEEDED)"
export function stageReadout(value: number, prepSent: boolean): string {
  const snapped = snapHalf(value);
  const name = stageLabel(stageOf(snapped)).toUpperCase();
  const num = snapped.toFixed(1);
  if (isHalfStep(snapped)) {
    return `${num} ${name} (${prepSent ? 'PREP SENT' : 'PREP NEEDED'})`;
  }
  return `${num} ${name}`;
}

// Fraction (0..1) of the track a value occupies, for fill width + thumb position.
export const fraction = (value: number) => (clamp(value) - MIN) / (MAX - MIN);

// Map a pointer fraction (0..1 along the track) back to a raw slider value.
export const valueFromFraction = (f: number) => clamp(MIN + f * (MAX - MIN));

// Per-stage active candidate counts for the funnel badges (slider build §2).
// A candidate counts under the whole stage their slider floors to.
export function stageCounts(candidates: Pick<Candidate, 'funnel_stage' | 'pending' | 'dq'>[]): number[] {
  const counts = new Array(STAGE_COUNT).fill(0);
  for (const c of candidates) {
    if (c.dq) continue;
    const stage = clamp(c.funnel_stage ?? 1);
    counts[stage - 1] += 1;
  }
  return counts;
}
