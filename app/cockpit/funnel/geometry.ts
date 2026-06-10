// Pure layout math for the funnel timeline (build spec §7). Given candidate
// rows, it computes where the five stage circles, the dotted/solid segments, and
// the floating candidate chips sit in the SVG. No React, no data fetching — so
// the timeline component stays a thin renderer and this stays easy to reason about.
import type { Candidate } from '../types';
import { STAGE_LABELS } from './tokens';

export type ChipStatus = 'prepped' | 'notPrepped';

export type PlacedChip = {
  id: string;
  name: string;
  x: number; // zone center x (also the connector column)
  cy: number; // chip center y
  status: ChipStatus;
  connFromY: number; // connector start (lower point: the line, or the chip below)
};

export type StageCircle = { n: number; x: number; y: number; label: string };

// A timeline segment (the dotted "pending zone" after a stage). Its state mirrors
// the candidates standing in it: green+solid if anyone is prepped/advancing,
// red+dashed if anyone is not-prepped (action owed), else neutral dotted structure.
export type SegmentState = 'prepped' | 'notPrepped' | 'idle';
export type Segment = { x1: number; x2: number; y: number; state: SegmentState };

// The in-SVG DQ exit (approved mockup): a faint dotted peel dropping off the stage
// circle a candidate left from, into a small "out of funnel" box that names the
// first DQ'd candidate. Null when nobody has exited, so the timeline doesn't
// reserve empty space below the line.
export type DqExit = {
  peel: { x: number; y1: number; y2: number };
  box: { x: number; y: number; w: number; h: number };
  label: string; // first DQ candidate, e.g. "Jordan · thank-you queued"
};

export type FunnelLayout = {
  width: number;
  height: number;
  baselineY: number;
  circles: StageCircle[];
  segments: Segment[];
  chips: PlacedChip[];
  chipW: number;
  chipH: number;
  circleR: number;
  dq: DqExit | null; // the exit peel + DQ box, or null when nobody has exited
};

// Coordinate system: a 680-wide canvas with the five stage circles evenly spread
// between symmetric horizontal margins (no more axis stubs), so the timeline fills
// the width with clean padding on both sides. With W=680 and 64px margins the step
// is 138, placing circles at x = 64, 202, 340, 478, 616.
const W = 680;
const MARGIN_L = 64; // x of the first circle (clean left padding)
const MARGIN_R = 64; // gap from the last circle to the right edge (symmetric)
const CIRCLE_R = 18;
const CHIP_W = 140; // wide enough to show full candidate names
const CHIP_H = 34;
const CHIP_GAP = 9;
const GAP_ABOVE_LINE = 53; // chip-bottom → line, so chips float high like the mockup
const TOP_PAD = 28;
const BELOW_LINE_BASE = 55; // just the stage labels when nobody has exited
const BELOW_LINE_DQ = 125; // room for the exit peel + DQ box (mockup height ≈ 240)

const clampStage = (s: number | null | undefined) =>
  Math.min(5, Math.max(1, s ?? 1));

// Where a candidate stands on the line:
//  - pending after stage N → in the gap to the RIGHT of circle N (the dotted
//    pending zone). Stage 5 pending has no next circle, so it floats just past it.
//  - not pending → at stage N's circle.
function zoneX(stage: number, pending: boolean, circles: StageCircle[]): number {
  const i = stage - 1; // 0-based circle index for this stage
  if (!pending) return circles[i].x;
  const next = circles[i + 1];
  if (next) return (circles[i].x + next.x) / 2;
  const step = circles[1].x - circles[0].x;
  return Math.min(circles[i].x + step * 0.45, W - MARGIN_R + 30);
}

export function layoutFunnel(candidates: Candidate[]): FunnelLayout {
  const step = (W - MARGIN_L - MARGIN_R) / 4;
  const circles: StageCircle[] = Array.from({ length: 5 }, (_, i) => ({
    n: i + 1,
    x: MARGIN_L + i * step,
    y: 0, // filled in once baselineY is known
    label: STAGE_LABELS[i + 1] ?? `Stage ${i + 1}`,
  }));

  // DQ candidates leave via the peel into the in-SVG DQ box (and the DQ column
  // panel); everyone else becomes a chip placed above their zone.
  const dqCands = candidates.filter((c) => c.dq);
  const onLine = candidates.filter((c) => !c.dq);

  // Group by rounded zone x so co-located candidates stack into one column.
  type Pre = { c: Candidate; x: number; status: ChipStatus };
  const pre: Pre[] = onLine.map((c) => {
    const stage = clampStage(c.funnel_stage);
    const pending = !!c.pending;
    return {
      c,
      x: zoneX(stage, pending, circles),
      status: c.prep_sent ? 'prepped' : 'notPrepped',
    };
  });

  const groups = new Map<number, Pre[]>();
  for (const p of pre) {
    const key = Math.round(p.x);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }

  const maxStack = Math.max(1, ...Array.from(groups.values(), (g) => g.length));
  const baselineY =
    TOP_PAD + GAP_ABOVE_LINE + CHIP_H + (maxStack - 1) * (CHIP_H + CHIP_GAP);
  const belowLine = dqCands.length ? BELOW_LINE_DQ : BELOW_LINE_BASE;
  const height = baselineY + belowLine;
  circles.forEach((c) => (c.y = baselineY));

  // Place chips bottom-up within each column; each chip's connector runs from the
  // chip below it (or the line, for the bottom chip) up to the chip's center.
  const chips: PlacedChip[] = [];
  for (const g of Array.from(groups.values())) {
    let prevY = baselineY; // connector for the lowest chip starts at the line
    g.forEach((p, j) => {
      const cy = baselineY - GAP_ABOVE_LINE - CHIP_H / 2 - j * (CHIP_H + CHIP_GAP);
      chips.push({
        id: p.c.id,
        name: p.c.name || 'Untitled',
        x: p.x,
        cy,
        status: p.status,
        connFromY: prevY,
      });
      prevY = cy;
    });
  }

  // Segment state from the candidates standing in each gap (pending stage g+1).
  const segments: Segment[] = [];
  for (let i = 0; i < 4; i++) {
    const gapPre = pre.filter(
      (p) => p.c.pending && clampStage(p.c.funnel_stage) === i + 1
    );
    const state: SegmentState = gapPre.some((p) => p.status === 'prepped')
      ? 'prepped'
      : gapPre.length
        ? 'notPrepped'
        : 'idle';
    segments.push({
      x1: circles[i].x + CIRCLE_R,
      x2: circles[i + 1].x - CIRCLE_R,
      y: baselineY,
      state,
    });
  }

  // DQ exit: peel off the stage the first exited candidate left from (funnel_stage
  // is retained on DQ rows, so it points at the milestone they exited; default to
  // R1 when unknown) down into a small box naming them.
  let dq: DqExit | null = null;
  if (dqCands.length) {
    const first = dqCands[0];
    const peelX = circles[clampStage(first.funnel_stage) - 1].x;
    const boxY = baselineY + 63;
    dq = {
      peel: { x: peelX, y1: baselineY + CIRCLE_R, y2: boxY + 22 },
      box: { x: 430, y: boxY, w: 180, h: 44 },
      label: `${first.name || 'Candidate'} · thank-you queued`,
    };
  }

  return {
    width: W,
    height,
    baselineY,
    circles,
    segments,
    chips,
    chipW: CHIP_W,
    chipH: CHIP_H,
    circleR: CIRCLE_R,
    dq,
  };
}
