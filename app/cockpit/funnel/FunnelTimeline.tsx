'use client';

import type { Candidate } from '../types';
import { C, STATUS, FONT, RADIUS } from './tokens';
import { layoutFunnel, type ChipStatus, type SegmentState } from './geometry';

const segStroke: Record<SegmentState, string> = {
  prepped: STATUS.prepped,
  notPrepped: STATUS.notPrepped,
  idle: C.line,
};

// Chip color is the binary the recruiter asked for: prepped → green, not-prepped
// → red. Borders/connectors follow suit (green solid, red dashed).
const chipColor: Record<ChipStatus, string> = {
  prepped: STATUS.prepped,
  notPrepped: STATUS.notPrepped,
};

// Show the full candidate name; only ellipsize past ~22 chars so the wider chip
// rarely truncates at all.
const truncate = (s: string, n = 22) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// Reusable status badge (replaces the old filled status dot). Drawn purely as SVG
// vectors — no icon font, which doesn't render reliably inside <text>. Prepped is
// a green ring with a crisp white check; not-prepped is a hollow red ring with a
// small red center dot. `cx`/`cy` is the badge center.
function StatusBadge({ status, cx, cy }: { status: ChipStatus; cx: number; cy: number }) {
  const color = chipColor[status];
  if (status === 'prepped') {
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="none" stroke={color} strokeWidth={1.6} />
        <path
          d={`M ${cx - 3} ${cy + 0.3} L ${cx - 0.8} ${cy + 2.6} L ${cx + 3.4} ${cy - 2.4}`}
          fill="none"
          stroke={C.white}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill="none" stroke={color} strokeWidth={1.6} />
      <circle cx={cx} cy={cy} r={1.8} fill={color} />
    </g>
  );
}

// Reusable, data-driven funnel timeline (spec §7). Candidates float as chips
// above the zone they occupy with a connector down to the line; the segment a
// pending candidate stands in reflects their state (red dashed = action owed,
// green solid = prepped/advancing). DQ candidates leave via the faint peel-off.
export default function FunnelTimeline({
  candidates,
  onSelect,
}: {
  candidates: Candidate[];
  onSelect: (c: Candidate) => void;
}) {
  const L = layoutFunnel(candidates);
  const byId = new Map(candidates.map((c) => [c.id, c]));

  return (
    <svg
      viewBox={`0 0 ${L.width} ${L.height}`}
      width="100%"
      style={{ display: 'block', fontFamily: FONT, overflow: 'visible' }}
      role="img"
      aria-label="Candidate funnel timeline"
    >
      {/* Pending-zone segments between stages (inset by CIRCLE_R in geometry so the
          dashes never touch the colored stage circles) */}
      {L.segments.map((s, i) => (
        <line
          key={`seg-${i}`}
          x1={s.x1}
          y1={s.y}
          x2={s.x2}
          y2={s.y}
          stroke={segStroke[s.state]}
          strokeWidth={s.state === 'idle' ? 2 : 2.5}
          strokeDasharray={
            s.state === 'prepped' ? undefined : s.state === 'notPrepped' ? '2 6' : '2 5'
          }
          strokeLinecap="round"
        />
      ))}

      {/* DQ exit: a faint dotted peel off the stage the candidate left from, down
          into a small "out of funnel" box naming the first DQ'd candidate. */}
      {L.dq && (
        <g>
          <line
            x1={L.dq.peel.x}
            y1={L.dq.peel.y1}
            x2={L.dq.peel.x}
            y2={L.dq.peel.y2}
            stroke={STATUS.dq}
            strokeWidth={1.5}
            strokeDasharray="2 4"
          />
          <text x={L.dq.peel.x + 12} y={L.dq.peel.y2 - 10} fill={C.muted2} fontSize={10}>
            exit → DQ
          </text>
          <rect
            x={L.dq.box.x}
            y={L.dq.box.y}
            width={L.dq.box.w}
            height={L.dq.box.h}
            rx={10}
            fill={C.panel2}
            stroke={C.line}
            strokeWidth={1}
          />
          <text
            x={L.dq.box.x + 18}
            y={L.dq.box.y + 20}
            fill={C.muted}
            fontSize={11}
            fontWeight={800}
            style={{ letterSpacing: '0.12em', textTransform: 'uppercase' }}
          >
            DQ · out of funnel
          </text>
          <circle cx={L.dq.box.x + 25} cy={L.dq.box.y + 33} r={3.5} fill={C.muted2} />
          <text x={L.dq.box.x + 36} y={L.dq.box.y + 36} fill={C.muted} fontSize={11}>
            {L.dq.label}
          </text>
        </g>
      )}

      {/* Stage circles (numbered milestones) + labels. The green ring is the
          "achieved milestone" accent; the number inside stays legible in white. */}
      {L.circles.map((c) => (
        <g key={`circle-${c.n}`}>
          <circle
            cx={c.x}
            cy={c.y}
            r={L.circleR}
            fill={C.panel2}
            stroke={STATUS.prepped}
            strokeWidth={1}
          />
          <text
            x={c.x}
            y={c.y + 5}
            fill={C.white}
            fontSize={14}
            fontWeight={700}
            textAnchor="middle"
          >
            {c.n}
          </text>
          <text
            x={c.x}
            y={c.y + L.circleR + 22}
            fill={C.muted}
            fontSize={11}
            fontWeight={400}
            textAnchor="middle"
          >
            {c.label}
          </text>
        </g>
      ))}

      {/* Candidate chips + their connectors down to the line. All chips share one
          typography scale regardless of status (name 12.5/600, sub-line 9.5). */}
      {L.chips.map((chip) => {
        const color = chipColor[chip.status];
        const solid = chip.status === 'prepped';
        const cand = byId.get(chip.id);
        const x = chip.x - L.chipW / 2;
        const y = chip.cy - L.chipH / 2;
        return (
          <g
            key={`chip-${chip.id}`}
            style={{ cursor: 'pointer' }}
            onClick={() => cand && onSelect(cand)}
          >
            {/* connector (the per-candidate "segment": green solid / red dashed) */}
            <line
              x1={chip.x}
              y1={chip.connFromY}
              x2={chip.x}
              y2={chip.cy + L.chipH / 2}
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray={solid ? undefined : '2 4'}
            />
            <rect
              x={x}
              y={y}
              width={L.chipW}
              height={L.chipH}
              rx={RADIUS.chip}
              fill={C.panel}
              stroke={color}
              strokeWidth={1}
            />
            {/* sleek vector status badge (replaces the old filled status dot) */}
            <StatusBadge status={chip.status} cx={x + 16} cy={chip.cy} />
            <text
              x={x + 30}
              y={chip.cy - 4}
              fill={C.white}
              fontSize={12.5}
              fontWeight={600}
            >
              {truncate(chip.name)}
            </text>
            <text x={x + 30} y={chip.cy + 9} fill={color} fontSize={9.5}>
              {chip.status === 'prepped' ? 'prep sent' : 'prep needed'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
