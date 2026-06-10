'use client';

// Per-client sourcing workspace (sourcing build): Brain Buzz toggle, per-client
// Memory/Instructions (debounced autosave, same pattern as candidate notes),
// a persistent Claude chat with Apollo tools, and a right-rail table of
// captured Booleans. Closing the window auto-archives the chat to Supabase
// unless Brain Buzz is ON — the server re-checks the toggle from the DB.
import { useCallback, useEffect, useRef, useState } from 'react';
import { C, FONT, RADIUS, BORDER } from '../funnel/tokens';
import type { BooleanRow, SourcingClient, SourcingMessage } from './types';

export default function ClientWorkspace({
  client,
  onClientChange,
  onClose,
}: {
  client: SourcingClient;
  onClientChange: (c: SourcingClient) => void;
  onClose: () => void;
}) {
  const [brainBuzz, setBrainBuzz] = useState(client.brain_buzz);
  const [memory, setMemory] = useState(client.memory_instructions ?? '');
  const [memStatus, setMemStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastSavedMemory = useRef(client.memory_instructions ?? '');

  const [messages, setMessages] = useState<SourcingMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(true);
  const [booleans, setBooleans] = useState<BooleanRow[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [chatErr, setChatErr] = useState<string | null>(null);
  const [captured, setCaptured] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Load thread + booleans ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mRes, bRes] = await Promise.all([
          fetch(`/api/sourcing-messages?client_id=${client.id}`),
          fetch(`/api/sourcing-booleans?client_id=${client.id}`),
        ]);
        const mData = await mRes.json();
        const bData = await bRes.json();
        if (cancelled) return;
        if (mRes.ok && mData.ok) setMessages(mData.messages);
        if (bRes.ok && bData.ok) setBooleans(bData.booleans);
      } finally {
        if (!cancelled) setLoadingThread(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client.id]);

  // Keep the chat pinned to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // ── Brain Buzz toggle: instant flip, persisted immediately ───────────────
  const toggleBuzz = async () => {
    const next = !brainBuzz;
    setBrainBuzz(next);
    const res = await fetch('/api/sourcing-clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id, brain_buzz: next }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      setBrainBuzz(!next); // roll back
    } else {
      onClientChange(data.client as SourcingClient);
    }
  };

  // ── Memory/Instructions: debounced autosave (notes pattern) ──────────────
  const saveMemory = useCallback(
    async (value: string) => {
      setMemStatus('saving');
      const res = await fetch('/api/sourcing-clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: client.id, memory_instructions: value }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        lastSavedMemory.current = value;
        setMemStatus('saved');
        onClientChange(data.client as SourcingClient);
      } else {
        setMemStatus('error');
      }
    },
    [client.id, onClientChange]
  );

  useEffect(() => {
    if (memory === lastSavedMemory.current) return;
    setMemStatus('saving');
    const t = setTimeout(() => saveMemory(memory), 1200);
    return () => clearTimeout(t);
  }, [memory, saveMemory]);

  // ── Chat send ─────────────────────────────────────────────────────────────
  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setChatErr(null);
    setSending(true);
    // Optimistic user bubble — the server persists the real row.
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${prev.length}`,
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      },
    ]);
    try {
      const res = await fetch('/api/sourcing-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: client.id, message: text }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Chat failed');
      setMessages((prev) => [...prev, data.reply as SourcingMessage]);
    } catch (e) {
      setChatErr(e instanceof Error ? e.message : 'Chat failed');
    } finally {
      setSending(false);
    }
  };

  // ── Boolean capture (arrow next to a delivered Boolean) ──────────────────
  const capture = async (key: string, value: string) => {
    if (captured.has(key)) return;
    const res = await fetch('/api/sourcing-booleans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: client.id, boolean_string: value }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) {
      setBooleans((prev) => [data.row as BooleanRow, ...prev]);
      setCaptured((prev) => new Set(prev).add(key));
    }
  };

  const removeBoolean = async (id: string) => {
    setBooleans((prev) => prev.filter((b) => b.id !== id));
    await fetch('/api/sourcing-booleans', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  };

  const copyBoolean = async (row: BooleanRow) => {
    try {
      await navigator.clipboard.writeText(row.boolean_string);
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  // ── Close → auto-archive unless Brain Buzz (server re-checks the flag) ───
  const handleClose = async () => {
    if (closing) return;
    setClosing(true);
    if (memory !== lastSavedMemory.current) await saveMemory(memory);
    try {
      await fetch('/api/sourcing-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: client.id }),
      });
    } catch {
      /* archive failure shouldn't trap the user in the modal */
    }
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={handleClose}>
      <div
        style={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header: name + Brain Buzz + close */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>{client.name}</h2>
            <p style={styles.sub}>Sourcing workspace</p>
          </div>
          <div style={styles.headerRight}>
            <div style={styles.buzzWrap} title="ON = chat persists between sessions (no auto-archive). OFF = chat archives to Supabase when you close this window.">
              <span style={brainBuzz ? styles.buzzLabelOn : styles.buzzLabel}>
                <i className="ti ti-bolt" aria-hidden /> Brain Buzz
              </span>
              <button
                style={brainBuzz ? styles.switchOn : styles.switch}
                onClick={toggleBuzz}
                role="switch"
                aria-checked={brainBuzz}
                aria-label="Brain Buzz"
              >
                <span style={brainBuzz ? styles.knobOn : styles.knob} />
              </button>
            </div>
            <button style={styles.closeBtn} onClick={handleClose} aria-label="Close">
              {closing ? '…' : '✕'}
            </button>
          </div>
        </div>

        {/* Memory / Instructions */}
        <div style={styles.memorySection}>
          <div style={styles.memoryHead}>
            <span style={styles.label}>Memory / Instructions</span>
            <MemoryStatus status={memStatus} />
          </div>
          <textarea
            style={styles.memoryInput}
            value={memory}
            onChange={(e) => setMemory(e.target.value)}
            placeholder="Boolean formatting rules, sourcing strategy, Apollo query templates — Claude reads this on every message for this client."
            rows={3}
          />
        </div>

        {/* Body: chat + boolean rail */}
        <div style={styles.body}>
          <div style={styles.chatCol}>
            <div style={styles.thread} ref={scrollRef}>
              {loadingThread ? (
                <div style={styles.state}>Loading chat…</div>
              ) : messages.length === 0 && !sending ? (
                <div style={styles.state}>
                  Clean slate. Ask for Booleans, similar companies, title
                  mapping — Apollo data is wired in.
                </div>
              ) : (
                messages.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.id} style={styles.userRow}>
                      <div style={styles.userBubble}>{m.content}</div>
                    </div>
                  ) : (
                    <div key={m.id} style={styles.assistantRow}>
                      <div style={styles.assistantBubble}>
                        <AssistantContent
                          msgId={m.id}
                          content={m.content}
                          captured={captured}
                          onCapture={capture}
                        />
                      </div>
                    </div>
                  )
                )
              )}
              {sending && (
                <div style={styles.assistantRow}>
                  <div style={{ ...styles.assistantBubble, color: C.muted }}>
                    Thinking…
                  </div>
                </div>
              )}
            </div>

            {chatErr && <div style={styles.error}>{chatErr}</div>}

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
                placeholder={`Message the ${client.name} copilot… (Enter to send)`}
                rows={2}
              />
              <button
                style={styles.sendBtn}
                onClick={send}
                disabled={sending || !draft.trim()}
              >
                Send
              </button>
            </div>
          </div>

          {/* Right rail: captured Booleans */}
          <aside style={styles.rail} aria-label="Captured Booleans">
            <div style={styles.railHead}>
              <span style={styles.label}>Captured Booleans</span>
              <span style={styles.railCount}>{booleans.length}</span>
            </div>
            <div style={styles.railScroll}>
              {booleans.length === 0 ? (
                <p style={styles.railEmpty}>
                  Click the <i className="ti ti-arrow-right" aria-hidden /> next
                  to a Boolean in chat to save it here.
                </p>
              ) : (
                booleans.map((row) => (
                  <div key={row.id} style={styles.boolRow}>
                    <div style={styles.boolText}>{row.boolean_string}</div>
                    <div style={styles.boolMeta}>
                      <span style={styles.boolStamp}>{formatStamp(row.created_at)}</span>
                      <div style={styles.boolActions}>
                        <button
                          style={styles.iconBtn}
                          onClick={() => copyBoolean(row)}
                          title="Copy to clipboard"
                          aria-label="Copy boolean"
                        >
                          <i
                            className={`ti ${copiedId === row.id ? 'ti-check' : 'ti-copy'}`}
                            style={copiedId === row.id ? { color: C.green } : undefined}
                            aria-hidden
                          />
                        </button>
                        <button
                          style={styles.iconBtn}
                          onClick={() => removeBoolean(row.id)}
                          title="Remove"
                          aria-label="Remove boolean"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// Assistant message renderer: fenced code blocks (Claude delivers every
// Boolean inside ```boolean fences) become capture targets with the
// right-arrow button; everything else renders as plain text.
function AssistantContent({
  msgId,
  content,
  captured,
  onCapture,
}: {
  msgId: string;
  content: string;
  captured: Set<string>;
  onCapture: (key: string, value: string) => void;
}) {
  const parts: { type: 'text' | 'code'; value: string }[] = [];
  const re = /```[^\n]*\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m.index > last)
      parts.push({ type: 'text', value: content.slice(last, m.index) });
    if (m[1].trim()) parts.push({ type: 'code', value: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < content.length)
    parts.push({ type: 'text', value: content.slice(last) });

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          const text = part.value.trim();
          if (!text) return null;
          return (
            <p key={i} style={styles.msgText}>
              {text}
            </p>
          );
        }
        const key = `${msgId}:${i}`;
        const done = captured.has(key);
        return (
          <div key={i} style={styles.boolBlock}>
            <code style={styles.boolCode}>{part.value}</code>
            <button
              style={done ? styles.captureBtnDone : styles.captureBtn}
              onClick={() => onCapture(key, part.value)}
              disabled={done}
              title={done ? 'Saved to table' : 'Save to Boolean table'}
              aria-label="Capture boolean"
            >
              <i className={`ti ${done ? 'ti-check' : 'ti-arrow-right'}`} aria-hidden />
            </button>
          </div>
        );
      })}
    </>
  );
}

function MemoryStatus({
  status,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error';
}) {
  if (status === 'idle') return null;
  const map = {
    saving: { dot: C.amber, text: 'Saving…' },
    saved: { dot: C.green, text: 'Saved' },
    error: { dot: C.red, text: 'Save failed — retrying on next edit' },
  } as const;
  const s = map[status];
  return (
    <span style={styles.saveIndicator}>
      <span style={{ ...styles.saveDot, background: s.dot }} aria-hidden />
      {s.text}
    </span>
  );
}

const formatStamp = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 50,
  },
  panel: {
    background: C.panel,
    border: BORDER,
    borderRadius: RADIUS.card,
    padding: 20,
    width: 'min(1180px, 96vw)',
    height: '90vh',
    display: 'flex',
    flexDirection: 'column',
    color: C.white,
    fontFamily: FONT,
    boxSizing: 'border-box',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: C.white },
  sub: { margin: '4px 0 0', color: C.muted, fontSize: 13 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  buzzWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  buzzLabel: { fontSize: 12, fontWeight: 700, color: C.muted2, display: 'flex', alignItems: 'center', gap: 4 },
  buzzLabelOn: { fontSize: 12, fontWeight: 700, color: C.green, display: 'flex', alignItems: 'center', gap: 4 },
  switch: {
    position: 'relative',
    width: 42,
    height: 23,
    borderRadius: 999,
    border: BORDER,
    background: C.panel2,
    cursor: 'pointer',
    padding: 0,
  },
  switchOn: {
    position: 'relative',
    width: 42,
    height: 23,
    borderRadius: 999,
    border: `1px solid ${C.green}66`,
    background: `${C.green}33`,
    cursor: 'pointer',
    padding: 0,
  },
  knob: {
    position: 'absolute',
    top: 2,
    left: 3,
    width: 17,
    height: 17,
    borderRadius: '50%',
    background: C.muted,
    transition: 'left 0.15s ease',
  },
  knobOn: {
    position: 'absolute',
    top: 2,
    left: 20,
    width: 17,
    height: 17,
    borderRadius: '50%',
    background: C.green,
    boxShadow: '0 0 8px rgba(34,255,136,0.45)',
    transition: 'left 0.15s ease',
  },
  closeBtn: {
    border: 'none',
    background: 'transparent',
    fontSize: 16,
    cursor: 'pointer',
    color: C.muted,
    lineHeight: 1,
    padding: 4,
    fontFamily: FONT,
  },

  memorySection: { marginTop: 14 },
  memoryHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  label: {
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: C.muted2,
  },
  saveIndicator: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted },
  saveDot: { width: 7, height: 7, borderRadius: '50%' },
  memoryInput: {
    width: '100%',
    marginTop: 6,
    padding: 11,
    background: C.panel2,
    border: BORDER,
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 13,
    color: C.white,
    resize: 'none',
    boxSizing: 'border-box',
  },

  body: { flex: 1, minHeight: 0, marginTop: 14, display: 'flex', gap: 14 },
  chatCol: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  thread: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '4px 2px',
  },
  state: { color: C.muted, fontSize: 13, padding: '40px 16px', textAlign: 'center' },
  userRow: { display: 'flex', justifyContent: 'flex-end' },
  userBubble: {
    maxWidth: '78%',
    padding: '10px 13px',
    background: `${C.green}14`,
    border: `1px solid ${C.line2}`,
    borderRadius: '12px 12px 4px 12px',
    fontSize: 13.5,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  assistantRow: { display: 'flex', justifyContent: 'flex-start' },
  assistantBubble: {
    maxWidth: '88%',
    padding: '10px 13px',
    background: C.panel2,
    border: BORDER,
    borderRadius: '12px 12px 12px 4px',
    fontSize: 13.5,
    lineHeight: 1.5,
  },
  msgText: { margin: '6px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  boolBlock: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '8px 0',
    padding: '9px 11px',
    background: C.bg,
    border: `1px solid ${C.line2}`,
    borderRadius: 9,
  },
  boolCode: {
    flex: 1,
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 1.45,
    color: C.green,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  captureBtn: {
    width: 30,
    height: 30,
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
  captureBtnDone: {
    width: 30,
    height: 30,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: BORDER,
    borderRadius: RADIUS.button,
    background: 'transparent',
    color: C.greenDim,
    cursor: 'default',
    fontSize: 16,
  },
  error: {
    marginTop: 8,
    padding: '8px 12px',
    background: `${C.red}1f`,
    border: `1px solid ${C.red}55`,
    borderRadius: RADIUS.chip,
    color: C.red,
    fontSize: 12.5,
  },
  composer: { marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-end' },
  composerInput: {
    flex: 1,
    padding: 11,
    background: C.panel2,
    border: BORDER,
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 13.5,
    color: C.white,
    resize: 'none',
    boxSizing: 'border-box',
  },
  sendBtn: {
    padding: '11px 20px',
    border: 'none',
    borderRadius: RADIUS.button,
    background: C.green,
    color: C.bg,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: FONT,
  },

  rail: {
    width: 300,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderLeft: BORDER,
    paddingLeft: 14,
    minHeight: 0,
  },
  railHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  railCount: { fontSize: 11, fontWeight: 700, color: C.green },
  railScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  railEmpty: { fontSize: 12, color: C.muted2, lineHeight: 1.5 },
  boolRow: {
    padding: '9px 10px',
    background: C.panel2,
    border: BORDER,
    borderRadius: 10,
  },
  boolText: {
    fontFamily: MONO,
    fontSize: 11.5,
    lineHeight: 1.45,
    color: C.white,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  boolMeta: {
    marginTop: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  boolStamp: { fontSize: 10.5, color: C.muted2 },
  boolActions: { display: 'flex', gap: 4 },
  iconBtn: {
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    color: C.muted,
    background: C.panelHi,
    border: BORDER,
    borderRadius: 6,
    cursor: 'pointer',
  },
};
