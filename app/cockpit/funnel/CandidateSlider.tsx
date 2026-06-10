'use client';

// Candidate BAR (Candidates Hub build §3) with the 1.0 → 8.0 stage slider (slider
// build §3). The slider IS the control: drag a candidate's progression and the
// green fill + readout update live, then snap cleanly to the nearest half-step the
// instant you release. Whole numbers = stage reached (dotted), half-steps = prep
// state (auto-pops the Prep modal). Moves freely left and right. Built on pointer
// events (not a native range) so the "continuous while dragging, snap on release"
// behaviour is exact and the thumb/fill match the matrix aesthetic.
//
// In the Candidates hub the bar grows three trailing icons — LinkedIn (links to
// the profile), Notes (opens the chat/notes dropdown), Résumé (opens the file) —
// and clicking the bar's identity toggles that same notes dropdown (§4). Lit
// green when a note or résumé is on file (the §3 "signal").
import { useEffect, useRef, useState } from 'react';
import type { Candidate } from '../types';
import { C, STATUS, FONT, GLOW, RADIUS, BORDER } from './tokens';
import { sliderValue, snapHalf, fraction, valueFromFraction, stageReadout, MIN, MAX } from './stage';

const httpUrl = (u: string | null | undefined): string | null =>
  u && /^https?:\/\//i.test(u) ? u : null;

export default function CandidateRow({
  candidate,
  onCommit,
  onOpenDetail,
  onArchive,
  archived = false,
  onToggleChat,
  chatOpen = false,
}: {
  candidate: Candidate;
  onCommit: (c: Candidate, value: number) => void;
  onOpenDetail: (c: Candidate) => void;
  onArchive: (c: Candidate, archived: boolean) => void;
  archived?: boolean;
  // Candidates-hub mode: when provided, the identity + Notes icon toggle the
  // notes/chat dropdown instead of opening the detail modal.
  onToggleChat?: (c: Candidate) => void;
  chatOpen?: boolean;
}) {
  const committed = sliderValue(candidate);
  const prepSent = !!candidate.prep_sent;

  // Candidates-hub trailing icons. Direct links when the value is on file;
  // otherwise the icon opens the detail modal so the recruiter can add it.
  const hubMode = !!onToggleChat;
  const linkedinHref = httpUrl(candidate.linkedin_url);
  const resumeHref = httpUrl(candidate.resume);
  const hasNotes = !!candidate.notes && candidate.notes.trim().length > 0;

  // `value` is the live display value: continuous while dragging, snapped on
  // release. Re-syncs from the row whenever the persisted stage changes (and we
  // aren't mid-drag), so optimistic board updates flow back in.
  const [value, setValue] = useState(committed);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current) setValue(committed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed]);

  const valueFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    const f = rect.width ? (clientX - rect.left) / rect.width : 0;
    return valueFromFraction(Math.min(1, Math.max(0, f)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (archived) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
    setValue(valueFromClientX(e.clientX)); // continuous (raw) — no snap yet
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setValue(valueFromClientX(e.clientX)); // live, continuous
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    const snapped = snapHalf(valueFromClientX(e.clientX)); // lock to .0 / .5
    setValue(snapped);
    if (snapped !== committed || (snapped % 1 !== 0 && !prepSent)) {
      onCommit(candidate, snapped);
    }
  };

  // Keyboard: ←/→ nudge by a half-step (already snapped), Home/End jump to ends.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (archived) return;
    let next: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = snapHalf(value - 0.5);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = snapHalf(value + 0.5);
    else if (e.key === 'Home') next = MIN;
    else if (e.key === 'End') next = MAX;
    if (next == null) return;
    e.preventDefault();
    setValue(next);
    onCommit(candidate, next);
  };

  const pct = fraction(value) * 100;
  const onHalf = Math.abs(value * 2 - Math.round(value * 2)) < 1e-9 && Math.round(value * 2) % 2 !== 0;
  // Fill is a solid green laser once prep is sent at a half-step; otherwise a
  // plainer green that signals position without claiming "prepped".
  const fillSolid = prepSent && onHalf && !dragging;
  const readoutColor = fillSolid ? STATUS.prepped : onHalf ? STATUS.notPrepped : C.green;

  return (
    <article style={{ ...styles.row, ...(archived ? styles.rowArchived : null) }}>
      {/* Identity — in the hub, clicking it toggles the notes/chat dropdown (§4) */}
      <button
        type="button"
        style={styles.identity}
        onClick={() => (hubMode ? onToggleChat!(candidate) : onOpenDetail(candidate))}
        title={hubMode ? 'Open notes' : 'Open candidate'}
        aria-expanded={hubMode ? chatOpen : undefined}
      >
        <span style={styles.avatar} aria-hidden>
          <i className="ti ti-user" />
        </span>
        <span style={styles.idText}>
          <span style={styles.name}>{candidate.name || 'Untitled'}</span>
          <span style={styles.role}>{candidate.role || 'Role not set'}</span>
        </span>
      </button>

      {/* Slider + live readout */}
      <div style={styles.sliderCol}>
        <span
          style={{
            ...styles.readout,
            color: readoutColor,
            left: `${pct}%`,
            transform: 'translateX(-50%)',
            textShadow: fillSolid ? '0 0 8px rgba(34,255,136,0.6)' : undefined,
          }}
        >
          {stageReadout(value, prepSent)}
        </span>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={archived ? -1 : 0}
          aria-label={`${candidate.name || 'Candidate'} stage`}
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={value}
          aria-valuetext={stageReadout(value, prepSent)}
          style={styles.track}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {/* tick marks at every whole stage 1..8 */}
          {Array.from({ length: MAX - MIN + 1 }, (_, i) => (
            <span key={i} style={{ ...styles.tick, left: `${(i / (MAX - MIN)) * 100}%` }} />
          ))}
          <span
            style={{
              ...styles.fill,
              width: `${pct}%`,
              background: fillSolid
                ? `linear-gradient(90deg, ${C.greenDim}, ${C.green})`
                : C.green,
              boxShadow: fillSolid ? GLOW.laser : dragging ? GLOW.soft : 'none',
              transition: dragging ? 'none' : 'width 150ms ease',
            }}
          />
          <span
            style={{
              ...styles.thumb,
              left: `${pct}%`,
              transform: `translate(-50%, -50%) scale(${hover || dragging ? 1.18 : 1})`,
              boxShadow: hover || dragging ? GLOW.ring : '0 0 0 rgba(0,0,0,0)',
              transition: dragging ? 'transform 60ms ease' : 'transform 150ms ease, box-shadow 150ms ease',
            }}
          />
        </div>
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        {hubMode && (
          <div style={styles.iconGroup}>
            {/* LinkedIn → profile link (or modal to add one) */}
            {linkedinHref ? (
              <a
                href={linkedinHref}
                target="_blank"
                rel="noreferrer"
                style={{ ...styles.iconBtn, color: C.linkedin }}
                title="Open LinkedIn profile"
                aria-label="Open LinkedIn profile"
                onClick={(e) => e.stopPropagation()}
              >
                <i className="ti ti-brand-linkedin" aria-hidden />
              </a>
            ) : (
              <button
                style={styles.iconBtn}
                onClick={() => onOpenDetail(candidate)}
                title="Add LinkedIn profile"
                aria-label="Add LinkedIn profile"
              >
                <i className="ti ti-brand-linkedin" aria-hidden />
              </button>
            )}

            {/* Notes → toggle the chat/notes dropdown (lit green when on file) */}
            <button
              style={{
                ...styles.iconBtn,
                ...(chatOpen ? styles.iconBtnActive : null),
                ...(hasNotes && !chatOpen ? styles.iconBtnSignal : null),
              }}
              onClick={() => onToggleChat!(candidate)}
              title={hasNotes ? 'Notes on file — open' : 'Add notes'}
              aria-label="Open notes"
              aria-expanded={chatOpen}
            >
              <i className="ti ti-notes" aria-hidden />
            </button>

            {/* Résumé → open the file (or modal to upload one) */}
            {resumeHref ? (
              <a
                href={resumeHref}
                target="_blank"
                rel="noreferrer"
                style={{ ...styles.iconBtn, ...styles.iconBtnSignal }}
                title="Open résumé"
                aria-label="Open résumé"
                onClick={(e) => e.stopPropagation()}
              >
                <i className="ti ti-file-cv" aria-hidden />
              </a>
            ) : (
              <button
                style={styles.iconBtn}
                onClick={() => onOpenDetail(candidate)}
                title="Upload résumé"
                aria-label="Upload résumé"
              >
                <i className="ti ti-file-cv" aria-hidden />
              </button>
            )}
          </div>
        )}
        {archived ? (
          <button style={styles.restoreBtn} onClick={() => onArchive(candidate, false)} title="Restore to cockpit">
            Restore
          </button>
        ) : (
          <button style={styles.archiveBtn} onClick={() => onArchive(candidate, true)} title="Remove from cockpit (does NOT touch Trello)">
            Archive
          </button>
        )}
        <button style={styles.kebab} onClick={() => onOpenDetail(candidate)} aria-label="More" title="Open candidate">
          <i className="ti ti-dots-vertical" aria-hidden />
        </button>
      </div>
    </article>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'grid',
    gridTemplateColumns: '230px 1fr auto',
    alignItems: 'center',
    gap: 18,
    background: C.panel,
    border: BORDER,
    borderRadius: RADIUS.card,
    padding: '14px 18px',
    fontFamily: FONT,
  },
  rowArchived: { opacity: 0.5 },
  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: FONT,
  },
  avatar: {
    width: 38,
    height: 38,
    flexShrink: 0,
    borderRadius: '50%',
    background: C.panel2,
    border: `1px solid ${C.line}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: C.muted,
    fontSize: 18,
  },
  idText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  name: {
    fontSize: 14,
    fontWeight: 600,
    color: C.white,
    letterSpacing: '-0.01em',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  role: { fontSize: 11.5, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },

  sliderCol: { position: 'relative', paddingTop: 22, minWidth: 0 },
  readout: {
    position: 'absolute',
    top: 0,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
  track: {
    position: 'relative',
    height: 6,
    borderRadius: 999,
    background: '#1a1a1f',
    border: '1px solid rgba(34,255,136,0.12)',
    cursor: 'pointer',
    touchAction: 'none',
    outline: 'none',
  },
  tick: {
    position: 'absolute',
    top: '50%',
    width: 2,
    height: 2,
    borderRadius: 999,
    background: 'rgba(255,255,255,0.18)',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    pointerEvents: 'none',
  },
  thumb: {
    position: 'absolute',
    top: '50%',
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#0b0b0e',
    border: `2px solid ${C.green}`,
    pointerEvents: 'none',
  },

  actions: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  iconGroup: { display: 'flex', alignItems: 'center', gap: 4, marginRight: 2 },
  iconBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: BORDER,
    borderRadius: RADIUS.button,
    background: 'transparent',
    color: C.muted,
    cursor: 'pointer',
    fontSize: 16,
    textDecoration: 'none',
  },
  // Lit green when the value (note/résumé) is on file — the §3 "signal".
  iconBtnSignal: {
    border: `1px solid ${C.green}55`,
    background: `${C.green}14`,
    color: C.green,
  },
  // Active = the notes dropdown for this bar is open.
  iconBtnActive: {
    border: `1px solid ${C.green}66`,
    background: `${C.green}1f`,
    color: C.green,
  },
  archiveBtn: {
    padding: '6px 12px',
    border: BORDER,
    borderRadius: RADIUS.button,
    background: 'transparent',
    color: C.muted,
    fontSize: 11,
    fontWeight: 500,
    fontFamily: FONT,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  restoreBtn: {
    padding: '6px 12px',
    border: `1px solid ${C.green}66`,
    borderRadius: RADIUS.button,
    background: `${C.green}1f`,
    color: C.green,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: FONT,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  kebab: {
    width: 30,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: BORDER,
    borderRadius: RADIUS.button,
    background: 'transparent',
    color: C.muted,
    cursor: 'pointer',
    fontSize: 16,
  },
};
