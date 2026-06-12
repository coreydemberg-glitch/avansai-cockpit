'use client';

// Candidate notes studio (candidate-card iteration §4/§5/§6) — the centerpiece
// of the candidate card. One screen for a live call:
//   • LEFT  — dirty/raw notes Corey types without looking (autosaves to
//             candidates.notes, reusing the debounced autosave pattern).
//   • RIGHT — the same notes cleaned in real time by /api/clean-notes mode:'live'
//             (re-cleaned on a debounce as he types), with a green completeness
//             bar that fills as the required candidate fields are captured and a
//             quiet "still missing" line. No pop-ups — gaps surface here.
//   • BELOW — a Claude command bar (/api/candidate-chat) grounded in this
//             candidate's résumé + notes, for live context mid-call.
// The green arrow flushes saves, raises the "{name} — notes on file" hub to-do,
// and the cleaned summary persists to candidates.notes_clean for the To-Do copy
// module. Mounted inside the existing CandidateModal's Notes tab.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Candidate } from '../types';
import { saveNotes, saveCleanNotes } from '../actions';
import { addCandidateTodo } from './actions';
import { C, FONT, RADIUS, BORDER, GLOW } from '../funnel/tokens';

// Must match LIVE_FIELDS in app/api/clean-notes/route.ts (§5: one list drives
// the prompt, the response, and this bar).
const TOTAL_FIELDS = 10;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type Msg = { role: 'user' | 'assistant'; content: string };

export default function CandidateNotesStudio({
  candidate,
  onTodoRaised,
  onChanged,
}: {
  candidate: Candidate;
  // Bump the hub To-Do rail after the arrow raises a to-do.
  onTodoRaised: () => void;
  // Re-fetch server data after a save/capture (keeps the bars/list in sync).
  onChanged: () => void;
}) {
  // ── Left: dirty notes (autosaved to candidates.notes) ─────────────────────
  const [dirty, setDirty] = useState(candidate.notes ?? '');
  const [dirtyStatus, setDirtyStatus] = useState<SaveState>('idle');
  const lastSavedDirty = useRef(candidate.notes ?? '');

  // ── Right: cleaned summary + the field-capture map for the green bar ───────
  const [cleaned, setCleaned] = useState(candidate.notes_clean ?? '');
  const [fields, setFields] = useState<Record<string, boolean>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [cleaning, setCleaning] = useState(false);
  const [cleanErr, setCleanErr] = useState<string | null>(null);
  const lastSavedClean = useRef(candidate.notes_clean ?? '');
  const lastCleanedFrom = useRef<string | null>(null); // sentinel → cleans once on open
  const cleanSeq = useRef(0); // drop stale responses if newer typing landed

  // ── Command bar (stateless Claude chat grounded in this candidate) ────────
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [chatErr, setChatErr] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const [capturing, setCapturing] = useState(false);
  const [capturedOk, setCapturedOk] = useState(false);

  const capturedCount = useMemo(
    () => Object.values(fields).filter(Boolean).length,
    [fields]
  );
  const ratio = Math.min(1, capturedCount / TOTAL_FIELDS);
  const allGreen = capturedCount >= TOTAL_FIELDS;

  // Crash-safe draft key (raw notes). Restores unsaved text on reopen even if
  // the parent row hasn't refetched yet, and survives a hard tab close — the
  // zero-loss guarantee the old modal's localStorage draft provided.
  const draftKey = `cockpit:notes-draft:${candidate.id}`;
  const hydrated = useRef(false);

  // Latest values for the unmount / pagehide flush (avoids stale closures).
  const latest = useRef({ dirty, cleaned });
  useEffect(() => {
    latest.current = { dirty, cleaned };
  }, [dirty, cleaned]);

  // Serialize writes per field so a slower OLDER save can't commit after — and
  // clobber — a newer one (Postgres gives no order guarantee for two overlapping
  // UPDATEs). Each save chains onto the previous, so they commit strictly in call
  // order and last-write-wins. The debounce, the arrow, the unmount flush and the
  // pagehide handler all route through these.
  const dirtyChain = useRef<Promise<void>>(Promise.resolve());
  const flushDirty = useCallback(
    (value: string) => {
      dirtyChain.current = dirtyChain.current.then(async () => {
        if (value === lastSavedDirty.current) return;
        setDirtyStatus('saving');
        const res = await saveNotes(candidate.id, value);
        if (res.ok) {
          lastSavedDirty.current = value;
          setDirtyStatus('saved');
        } else {
          setDirtyStatus('error');
        }
      });
      return dirtyChain.current;
    },
    [candidate.id]
  );

  // Restore an unsaved draft on open (runs once).
  useEffect(() => {
    try {
      const d = window.localStorage.getItem(draftKey);
      if (d != null && d !== (candidate.notes ?? '')) setDirty(d);
    } catch {
      /* localStorage unavailable — fall back to the server value */
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror raw notes to localStorage on every change; clear once the server
  // value has caught up (draft === candidate.notes), so no stale orphan lingers.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      if (dirty === (candidate.notes ?? '')) window.localStorage.removeItem(draftKey);
      else window.localStorage.setItem(draftKey, dirty);
    } catch {
      /* ignore */
    }
  }, [dirty, candidate.notes, draftKey]);

  // Debounced dirty autosave.
  useEffect(() => {
    if (dirty === lastSavedDirty.current) return;
    setDirtyStatus('saving');
    const t = setTimeout(() => void flushDirty(dirty), 1000);
    return () => clearTimeout(t);
  }, [dirty, flushDirty]);

  // ── Live cleaning: re-clean the full note on a debounce as he types ───────
  useEffect(() => {
    const text = dirty.trim();
    if (!text) {
      // Clearing the field is a newer edit — invalidate any in-flight clean so
      // its stale response can't repopulate the panel/bar after the reset.
      ++cleanSeq.current;
      setCleaned('');
      setFields({});
      setMissing([]);
      lastCleanedFrom.current = '';
      return;
    }
    if (dirty === lastCleanedFrom.current) return;
    const seq = ++cleanSeq.current;
    setCleaning(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/clean-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: dirty, mode: 'live' }),
        });
        const data = await res.json();
        if (seq !== cleanSeq.current) return; // a newer keystroke superseded this
        if (!res.ok) throw new Error(data.error || 'Cleaning failed');
        lastCleanedFrom.current = dirty;
        setCleaned(typeof data.structured === 'string' ? data.structured : '');
        setFields(data.fields ?? {});
        setMissing(Array.isArray(data.missing) ? data.missing : []);
        setCleanErr(null);
      } catch (e) {
        if (seq !== cleanSeq.current) return;
        setCleanErr(e instanceof Error ? e.message : 'Cleaning failed');
      } finally {
        if (seq === cleanSeq.current) setCleaning(false);
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [dirty]);

  // ── Cleaned autosave → candidates.notes_clean (best-effort; for the copy) ──
  const cleanChain = useRef<Promise<void>>(Promise.resolve());
  const flushClean = useCallback(
    (value: string) => {
      cleanChain.current = cleanChain.current.then(async () => {
        if (value === lastSavedClean.current) return;
        const res = await saveCleanNotes(candidate.id, value);
        if (res.ok) lastSavedClean.current = value;
      });
      return cleanChain.current;
    },
    [candidate.id]
  );

  useEffect(() => {
    if (cleaned === lastSavedClean.current) return;
    const t = setTimeout(() => void flushClean(cleaned), 1000);
    return () => clearTimeout(t);
  }, [cleaned, flushClean]);

  // Flush pending edits when the card closes (unmount) OR the tab is hidden /
  // closed (pagehide — matches the Sourcing workspace's crash-safe flush). Both
  // route through the serialized savers so they can't clobber a newer write.
  useEffect(() => {
    const onHide = () => {
      const { dirty: d, cleaned: cl } = latest.current;
      void flushDirty(d);
      void flushClean(cl);
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushDirty, flushClean]);

  // Pin the command-bar thread to the latest message.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // ── Arrow capture (§2): flush, raise the to-do, persist the clean copy ────
  const capture = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      // Route through the serialized savers (awaits any in-flight debounce save
      // first) so capture can't issue an overlapping write.
      await flushDirty(dirty);
      await flushClean(cleaned);
      await addCandidateTodo(candidate.id, `${candidate.name || 'Candidate'} — notes on file`);
      onTodoRaised();
      onChanged();
      setCapturedOk(true);
      setTimeout(() => setCapturedOk(false), 2000);
    } finally {
      setCapturing(false);
    }
  };

  // ── Command bar send ──────────────────────────────────────────────────────
  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setChatErr(null);
    setSending(true);
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    try {
      const res = await fetch('/api/candidate-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate: {
            name: candidate.name,
            role: candidate.role,
            email: candidate.email,
            linkedin_url: candidate.linkedin_url,
          },
          resumeUrl: candidate.resume,
          dirtyNotes: dirty,
          cleanedNotes: cleaned,
          messages: next,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Chat failed');
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply as string }]);
    } catch (e) {
      setChatErr(e instanceof Error ? e.message : 'Chat failed');
    } finally {
      setSending(false);
    }
  };

  const insertIntoNotes = (text: string) =>
    setDirty((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));

  return (
    <div style={styles.wrap}>
      <div style={styles.panels}>
        {/* LEFT — dirty notes */}
        <section style={styles.panel}>
          <div style={styles.panelHead}>
            <span style={styles.panelLabel}>
              <i className="ti ti-pencil" aria-hidden /> Raw notes
            </span>
            <div style={styles.headRight}>
              <SaveDot status={dirtyStatus} />
              <button
                style={styles.captureBtn}
                onClick={capture}
                disabled={capturing}
                title={'Save notes + raise a "notes on file" to-do'}
                aria-label="Save notes and raise a to-do"
              >
                <i
                  className={`ti ${capturing ? 'ti-loader-2' : capturedOk ? 'ti-check' : 'ti-arrow-right'}`}
                  aria-hidden
                />
              </button>
            </div>
          </div>
          <textarea
            style={styles.dirtyInput}
            value={dirty}
            onChange={(e) => setDirty(e.target.value)}
            placeholder="Type live during the call — autosaves, and cleans on the right as you go."
            autoFocus
          />
        </section>

        {/* RIGHT — cleaned summary + completeness bar */}
        <section style={{ ...styles.panel, ...(allGreen ? styles.panelGreen : null) }}>
          <div style={styles.panelHead}>
            <span style={styles.panelLabel}>
              <i className="ti ti-sparkles" aria-hidden /> Cleaned
            </span>
            <span style={styles.cleanState}>
              {cleaning ? 'Cleaning…' : `${capturedCount}/${TOTAL_FIELDS} captured`}
            </span>
          </div>

          {/* Green completeness bar (reuses the slider's track/fill language) */}
          <div style={styles.barTrack} title={`${capturedCount} of ${TOTAL_FIELDS} required fields captured`}>
            <span
              style={{
                ...styles.barFill,
                width: `${Math.round(ratio * 100)}%`,
                background: allGreen
                  ? `linear-gradient(90deg, ${C.greenDim}, ${C.green})`
                  : C.green,
                boxShadow: allGreen ? GLOW.laser : 'none',
              }}
            />
          </div>
          {allGreen && (
            <div style={styles.goodLine}>
              <i className="ti ti-circle-check" aria-hidden /> All green — you have the full picture, safe to wrap.
            </div>
          )}

          <div style={styles.cleanedText}>
            {cleaned ? (
              cleaned
            ) : (
              <span style={styles.cleanedEmpty}>
                {cleanErr ? `Couldn't clean: ${cleanErr}` : 'The cleaned summary appears here as you type on the left.'}
              </span>
            )}
          </div>

          {missing.length > 0 && (
            <div style={styles.missingWrap}>
              <span style={styles.missingLabel}>Still missing</span>
              <div style={styles.missingChips}>
                {missing.map((m) => (
                  <span key={m} style={styles.missingChip}>
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* BELOW — Claude command bar, grounded in this candidate */}
      <section style={styles.command}>
        <div style={styles.commandHead}>
          <span style={styles.panelLabel}>
            <i className="ti ti-message-chatbot" aria-hidden /> Ask Claude — in context
          </span>
          <span style={styles.commandHint}>résumé + notes in scope</span>
        </div>
        <div style={styles.thread} ref={threadRef}>
          {messages.length === 0 && !sending ? (
            <p style={styles.threadEmpty}>
              “Is his current company any good?” · “What gaps should I probe before we wrap?” · paste a résumé to parse into the notes.
            </p>
          ) : (
            messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} style={styles.userRow}>
                  <div style={styles.userBubble}>{m.content}</div>
                </div>
              ) : (
                <div key={i} style={styles.assistantRow}>
                  <div style={styles.assistantBubble}>
                    <div style={styles.assistantText}>{m.content}</div>
                    <button
                      style={styles.insertBtn}
                      onClick={() => insertIntoNotes(m.content)}
                      title="Append this to the raw notes (left)"
                    >
                      <i className="ti ti-arrow-bar-to-left" aria-hidden /> Notes
                    </button>
                  </div>
                </div>
              )
            )
          )}
          {sending && (
            <div style={styles.assistantRow}>
              <div style={{ ...styles.assistantBubble, color: C.muted }}>Thinking…</div>
            </div>
          )}
        </div>
        {chatErr && <div style={styles.chatErr}>{chatErr}</div>}
        <div style={styles.composer}>
          <textarea
            style={styles.composerInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask about this candidate… (Enter to send)"
            rows={1}
          />
          <button style={styles.sendBtn} onClick={send} disabled={sending || !draft.trim()}>
            Send
          </button>
        </div>
      </section>
    </div>
  );
}

function SaveDot({ status }: { status: SaveState }) {
  if (status === 'idle') return null;
  const map = {
    saving: { dot: C.amber, text: 'Saving…' },
    saved: { dot: C.green, text: 'Saved' },
    error: { dot: C.red, text: 'Save failed — retries on next edit' },
  } as const;
  const s = map[status];
  return (
    <span style={styles.saveDotWrap}>
      <span style={{ ...styles.saveDot, background: s.dot }} aria-hidden />
      {s.text}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT },
  panels: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  panel: {
    flex: '1 1 320px',
    minWidth: 280,
    display: 'flex',
    flexDirection: 'column',
    background: C.panel2,
    border: BORDER,
    borderRadius: 12,
    padding: 12,
    minHeight: 320,
    boxSizing: 'border-box',
  },
  // Right panel turns green once every required field is captured (§5).
  panelGreen: {
    border: `1px solid ${C.green}66`,
    background: `${C.green}0d`,
    boxShadow: GLOW.soft,
  },
  panelHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  panelLabel: {
    fontSize: 11,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: C.muted2,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  headRight: { display: 'flex', alignItems: 'center', gap: 10 },
  saveDotWrap: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted },
  saveDot: { width: 7, height: 7, borderRadius: '50%' },
  captureBtn: {
    width: 32,
    height: 32,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${C.green}66`,
    borderRadius: RADIUS.button,
    background: `${C.green}1f`,
    color: C.green,
    cursor: 'pointer',
    fontSize: 16,
  },
  dirtyInput: {
    flex: 1,
    width: '100%',
    padding: 11,
    background: C.panel,
    border: BORDER,
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 13.5,
    lineHeight: 1.5,
    color: C.white,
    resize: 'none',
    boxSizing: 'border-box',
  },
  cleanState: { fontSize: 11, fontWeight: 700, color: C.green, whiteSpace: 'nowrap' },
  barTrack: {
    position: 'relative',
    height: 6,
    borderRadius: 999,
    background: '#1a1a1f',
    border: '1px solid rgba(34,255,136,0.12)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    transition: 'width 200ms ease',
  },
  goodLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: C.green,
    marginBottom: 8,
  },
  cleanedText: {
    flex: 1,
    overflowY: 'auto',
    fontSize: 13,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: C.white,
  },
  cleanedEmpty: { color: C.muted2, fontStyle: 'italic' },
  missingWrap: { marginTop: 10, paddingTop: 10, borderTop: BORDER },
  missingLabel: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: C.muted2,
  },
  missingChips: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  missingChip: {
    fontSize: 11,
    color: C.amber,
    background: `${C.amber}14`,
    border: `1px solid ${C.amber}40`,
    borderRadius: RADIUS.chip,
    padding: '2px 8px',
  },

  command: {
    display: 'flex',
    flexDirection: 'column',
    background: C.panel2,
    border: BORDER,
    borderRadius: 12,
    padding: 12,
    height: 200,
    boxSizing: 'border-box',
  },
  commandHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  commandHint: { fontSize: 10.5, color: C.muted2 },
  thread: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '2px 2px',
  },
  threadEmpty: { fontSize: 12, color: C.muted2, lineHeight: 1.5, margin: '4px 0' },
  userRow: { display: 'flex', justifyContent: 'flex-end' },
  userBubble: {
    maxWidth: '80%',
    padding: '8px 11px',
    background: `${C.green}14`,
    border: `1px solid ${C.line2}`,
    borderRadius: '12px 12px 4px 12px',
    fontSize: 13,
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  assistantRow: { display: 'flex', justifyContent: 'flex-start' },
  assistantBubble: {
    maxWidth: '88%',
    padding: '8px 11px',
    background: C.panel,
    border: BORDER,
    borderRadius: '12px 12px 12px 4px',
    fontSize: 13,
    lineHeight: 1.45,
  },
  assistantText: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  insertBtn: {
    marginTop: 6,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    border: BORDER,
    borderRadius: RADIUS.button,
    background: 'transparent',
    color: C.muted,
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: FONT,
  },
  chatErr: {
    marginTop: 6,
    padding: '6px 10px',
    background: `${C.red}1f`,
    border: `1px solid ${C.red}55`,
    borderRadius: RADIUS.chip,
    color: C.red,
    fontSize: 12,
  },
  composer: { marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-end' },
  composerInput: {
    flex: 1,
    padding: 9,
    background: C.panel,
    border: BORDER,
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 13,
    color: C.white,
    resize: 'none',
    boxSizing: 'border-box',
  },
  sendBtn: {
    padding: '9px 18px',
    border: 'none',
    borderRadius: RADIUS.button,
    background: C.green,
    color: C.bg,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: FONT,
  },
};
