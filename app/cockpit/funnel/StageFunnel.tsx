'use client';

// The command-center funnel (slider build §2). Eight stage circles in a row, an
// oversized live count badge above each ("N · CANDIDATES"), two-line stage names
// below, and dotted connectors that flip to a solid green "laser" wherever a
// candidate has completed prep heading into the next stage. Pure renderer — the
// counts/segment states are derived from the candidate rows passed in, so it
// updates in real time as the sliders below move.
import type { Candidate } from '../types';
import { C, STATUS, FONT, GLOW, STAGE_COUNT, STAGE_LABEL_LINES } from './tokens';
import { stageCounts, clamp } from './stage';

const W = 1160;
const MARGIN = 78;
const STEP = (W - MARGIN * 2) / (STAGE_COUNT - 1);
const CIRCLE_R = 30;
const CY = 132; // circle center y
const BADGE_NUM_Y = 44; // oversized count
const BADGE_LABEL_Y = 66; // "CANDIDATES"
const LABEL_Y = CY + CIRCLE_R + 26; // first stage-name line
const HEIGHT = 232;

const circleX = (i: number) => MARGIN + i * STEP;

export default function StageFunnel({ candidates }: { candidates: Candidate[] }) {
  const active = candidates.filter((c) => !c.dq);
  const counts = stageCounts(active);

  // A connector i→i+1 becomes a solid laser when someone has completed prep at
  // stage i (sitting on its half-step, heading into i+1).
  const laser: boolean[] = new Array(STAGE_COUNT - 1).fill(false);
  for (const c of active) {
    if (c.pending && c.prep_sent) {
      const s = clamp(c.funnel_stage ?? 1);
      if (s >= 1 && s <= STAGE_COUNT - 1) laser[s - 1] = true;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${HEIGHT}`}
      width="100%"
      style={{ display: 'block', fontFamily: FONT, overflow: 'visible' }}
      role="img"
      aria-label="Candidate funnel — eight stages"
    >
      <defs>
        <filter id="funnelGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Connectors between circles — inset by the radius so a line never touches
          a circle. Dotted emerald by default; a solid glowing laser where prep
          has been completed into the next stage. */}
      {Array.from({ length: STAGE_COUNT - 1 }, (_, i) => {
        const x1 = circleX(i) + CIRCLE_R + 7;
        const x2 = circleX(i + 1) - CIRCLE_R - 7;
        const on = laser[i];
        return (
          <line
            key={`seg-${i}`}
            x1={x1}
            y1={CY}
            x2={x2}
            y2={CY}
            stroke={on ? STATUS.prepped : 'rgba(34,255,136,0.34)'}
            strokeWidth={on ? 2.4 : 1.6}
            strokeDasharray={on ? undefined : '1 7'}
            strokeLinecap="round"
            style={on ? { filter: 'drop-shadow(0 0 3px rgba(34,255,136,0.8))' } : undefined}
          />
        );
      })}

      {Array.from({ length: STAGE_COUNT }, (_, i) => {
        const x = circleX(i);
        const n = i + 1;
        const count = counts[i];
        const occupied = count > 0;
        const lines = STAGE_LABEL_LINES[n] ?? [String(n)];
        return (
          <g key={`stage-${n}`}>
            {/* Oversized live count badge above the circle (Bloomberg-terminal
                style: the number is the hero, tiny uppercase label beneath). */}
            <text
              x={x}
              y={BADGE_NUM_Y}
              fill={occupied ? C.white : C.muted2}
              fontSize={34}
              fontWeight={800}
              textAnchor="middle"
              style={{ letterSpacing: '-0.02em' }}
            >
              {count}
            </text>
            <text
              x={x}
              y={BADGE_LABEL_Y}
              fill={C.muted2}
              fontSize={9}
              fontWeight={700}
              textAnchor="middle"
              style={{ letterSpacing: '0.18em' }}
            >
              CANDIDATES
            </text>

            {/* Illuminated ring (soft glow behind + crisp emerald ring + dark
                gloss fill + large white number). Occupied stages breathe gently. */}
            <circle
              cx={x}
              cy={CY}
              r={CIRCLE_R}
              fill="none"
              stroke={STATUS.prepped}
              strokeWidth={2.4}
              opacity={occupied ? 0.9 : 0.32}
              filter="url(#funnelGlow)"
            >
              {occupied && (
                <animate
                  attributeName="opacity"
                  values="0.55;1;0.55"
                  dur="2.8s"
                  repeatCount="indefinite"
                />
              )}
            </circle>
            <circle cx={x} cy={CY} r={CIRCLE_R - 2.5} fill={C.panel2} stroke="rgba(34,255,136,0.18)" strokeWidth={1} />
            <text
              x={x}
              y={CY + 8}
              fill={C.white}
              fontSize={24}
              fontWeight={700}
              textAnchor="middle"
            >
              {n}
            </text>

            {/* Two-line stage name below, uppercase + wide tracking. */}
            {lines.map((ln, li) => (
              <text
                key={li}
                x={x}
                y={LABEL_Y + li * 13}
                fill={C.muted}
                fontSize={10}
                fontWeight={600}
                textAnchor="middle"
                style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                {ln}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
