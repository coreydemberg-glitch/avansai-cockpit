'use client';

// Reusable Finder-style document library — a full-screen browser over uploaded
// PDFs with live first-page previews; clicking opens a viewer that can rename or
// delete. Powers both the Job Descriptions library and the Prep Documents library
// (slider build §5): the two only differ by their title/copy and API endpoints.
import { useCallback, useEffect, useRef, useState } from 'react';
import { C, FONT, RADIUS, BORDER } from '../funnel/tokens';

export type DocLibraryEndpoints = {
  list: string; // GET  → { ok, jobs: DocItem[] }
  upload: string; // POST (FormData file) → { job }
  mutate: string; // PATCH { id, title } / DELETE { id } → { ok, job? }
};

type DocItem = {
  id: string;
  title: string;
  file_path: string;
  created_at?: string | null;
  public_url: string;
};

export default function DocLibrary({
  title,
  sub,
  endpoints,
  onClose,
  onChanged,
}: {
  title: string;
  sub: string;
  endpoints: DocLibraryEndpoints;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<DocItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoints.list);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load');
      setItems(data.jobs as DocItem[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [endpoints.list]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file || uploading) return;

    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(endpoints.upload, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>{title}</h2>
            <p style={styles.sub}>{sub}</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.scroll}>
          {loading ? (
            <div style={styles.state}>Loading library…</div>
          ) : (
            <div style={styles.grid}>
              <button type="button" style={styles.addTile} onClick={() => fileRef.current?.click()} disabled={uploading}>
                <span style={styles.addPlus}>{uploading ? '…' : '+'}</span>
                <span style={styles.addLabel}>{uploading ? 'Uploading…' : 'Add document'}</span>
                <input ref={fileRef} type="file" accept="application/pdf" onChange={handleFile} style={{ display: 'none' }} />
              </button>

              {items.length === 0 && !uploading && <div style={styles.empty}>Nothing here yet.</div>}

              {items.map((item) => (
                <button key={item.id} type="button" style={styles.tile} onClick={() => setActive(item)}>
                  <div style={styles.previewBox}>
                    <object
                      data={`${item.public_url}#toolbar=0&navpanes=0&view=FitH`}
                      type="application/pdf"
                      style={styles.previewObject}
                      aria-label={item.title}
                    />
                    <div style={styles.previewOverlay} />
                  </div>
                  <span style={styles.tileTitle}>{item.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {active && (
        <DocViewer
          item={active}
          mutateUrl={endpoints.mutate}
          onClose={() => setActive(null)}
          onChanged={() => {
            load();
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

// Viewer sub-modal: full-page PDF + rename (Save) + delete + close.
function DocViewer({
  item,
  mutateUrl,
  onClose,
  onChanged,
}: {
  item: DocItem;
  mutateUrl: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(mutateUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, title: title.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
      setMsg('Saved ✓');
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    if (!window.confirm(`Delete "${item.title}"? This can't be undone.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(mutateUrl, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed');
      onChanged();
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Delete failed');
      setBusy(false);
    }
  };

  return (
    <div style={styles.viewerOverlay} onClick={onClose}>
      <div style={styles.viewerPanel} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={styles.viewerHeader}>
          <input style={styles.titleInput} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Document title" />
          <button style={styles.saveBtn} onClick={save} disabled={busy || !title.trim()}>
            Save
          </button>
          <button style={styles.deleteBtn} onClick={remove} disabled={busy}>
            Delete
          </button>
          <button style={styles.viewerClose} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {msg && (
          <div style={{ ...styles.viewerMsg, color: msg.startsWith('Saved') ? C.green : C.red }}>{msg}</div>
        )}

        <iframe src={item.public_url} style={styles.viewerFrame} title={item.title} />
      </div>
    </div>
  );
}

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
    padding: 24,
    width: 'min(1040px, 94vw)',
    maxHeight: '88vh',
    display: 'flex',
    flexDirection: 'column',
    color: C.white,
    fontFamily: FONT,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: C.white },
  sub: { margin: '4px 0 0', color: C.muted, fontSize: 13 },
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
  error: {
    marginTop: 14,
    padding: '8px 12px',
    background: `${C.red}1f`,
    border: `1px solid ${C.red}55`,
    borderRadius: RADIUS.chip,
    color: C.red,
    fontSize: 12.5,
  },
  scroll: { flex: 1, overflowY: 'auto', marginTop: 18 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16 },
  state: { color: C.muted, fontSize: 13, padding: '40px 0', textAlign: 'center' },
  empty: { color: C.muted2, fontSize: 13, alignSelf: 'center' },
  addTile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 184,
    border: `1.5px dashed ${C.line2}`,
    borderRadius: RADIUS.card,
    background: C.panel2,
    color: C.muted,
    cursor: 'pointer',
    fontFamily: FONT,
    padding: 12,
  },
  addPlus: { fontSize: 36, fontWeight: 300, color: C.green, lineHeight: 1 },
  addLabel: { fontSize: 12.5, color: C.muted },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 0,
    border: BORDER,
    borderRadius: RADIUS.card,
    background: C.panel2,
    cursor: 'pointer',
    textAlign: 'left',
    overflow: 'hidden',
    fontFamily: FONT,
  },
  previewBox: { position: 'relative', height: 150, overflow: 'hidden', borderRadius: RADIUS.card, background: C.panel2 },
  previewObject: { width: '100%', height: '100%', border: 'none', pointerEvents: 'none' },
  previewOverlay: { position: 'absolute', inset: 0, background: 'transparent' },
  tileTitle: {
    fontSize: 12.5,
    color: C.white,
    padding: '0 10px 10px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  viewerOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.82)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 60,
  },
  viewerPanel: {
    background: C.panel,
    border: BORDER,
    borderRadius: RADIUS.card,
    padding: 20,
    width: 'min(900px, 92vw)',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    color: C.white,
    fontFamily: FONT,
  },
  viewerHeader: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  titleInput: {
    flex: 1,
    minWidth: 180,
    padding: '9px 12px',
    background: C.panel2,
    border: BORDER,
    borderRadius: RADIUS.button,
    color: C.white,
    fontSize: 14,
    fontFamily: FONT,
  },
  saveBtn: {
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
  deleteBtn: {
    padding: '9px 16px',
    border: `1px solid ${C.red}`,
    borderRadius: RADIUS.button,
    background: 'transparent',
    color: C.red,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: FONT,
  },
  viewerClose: {
    border: 'none',
    background: 'transparent',
    fontSize: 16,
    cursor: 'pointer',
    color: C.muted,
    lineHeight: 1,
    padding: 4,
    fontFamily: FONT,
  },
  viewerMsg: { marginTop: 10, fontSize: 12.5, fontWeight: 600 },
  viewerFrame: {
    marginTop: 14,
    width: '100%',
    height: '70vh',
    border: BORDER,
    borderRadius: RADIUS.card,
    background: C.panel2,
  },
};
