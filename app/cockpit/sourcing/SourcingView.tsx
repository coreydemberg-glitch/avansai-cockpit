'use client';

// Sourcing Hub (sourcing build) — per-client AI sourcing workspaces. The grid
// replicates the DocLibrary thumbnail language (same tile/add-tile structure,
// minus PDF previews) with a three-dot menu for Edit / Archive, and the
// Add-Client flow swaps the file-upload modal for a single text input.
import { useCallback, useEffect, useState } from 'react';
import { C, FONT, RADIUS, BORDER } from '../funnel/tokens';
import type { SourcingClient } from './types';
import ClientWorkspace from './ClientWorkspace';

export default function SourcingView() {
  const [clients, setClients] = useState<SourcingClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [nameModal, setNameModal] = useState<
    { mode: 'add' } | { mode: 'edit'; client: SourcingClient } | null
  >(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [open, setOpen] = useState<SourcingClient | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sourcing-clients');
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load');
      setClients(data.clients as SourcingClient[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Patch one client in local state (optimistic; workspace edits flow back too).
  const patchLocal = (id: string, patch: Partial<SourcingClient>) =>
    setClients((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );

  const submitName = async (name: string) => {
    if (!nameModal) return;
    if (nameModal.mode === 'add') {
      const res = await fetch('/api/sourcing-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
      setClients((prev) => [data.client as SourcingClient, ...prev]);
    } else {
      const id = nameModal.client.id;
      const res = await fetch('/api/sourcing-clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
      patchLocal(id, { name: (data.client as SourcingClient).name });
    }
    setNameModal(null);
  };

  const setArchived = async (client: SourcingClient, archived: boolean) => {
    setMenuFor(null);
    patchLocal(client.id, { archived });
    const res = await fetch('/api/sourcing-clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id, archived }),
    });
    if (!res.ok) {
      patchLocal(client.id, { archived: !archived }); // roll back
      alert(`Couldn't ${archived ? 'archive' : 'restore'} that client.`);
    }
  };

  const remove = async (client: SourcingClient) => {
    setMenuFor(null);
    if (
      !window.confirm(
        `Delete "${client.name}" and all its chats, archives, and booleans? This can't be undone.`
      )
    )
      return;
    const res = await fetch('/api/sourcing-clients', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: client.id }),
    });
    if (res.ok) setClients((prev) => prev.filter((c) => c.id !== client.id));
    else alert("Couldn't delete that client.");
  };

  const active = clients.filter((c) => !c.archived);
  const archived = clients.filter((c) => c.archived);
  const shown = view === 'active' ? active : archived;

  return (
    <div style={styles.wrap}>
      <div style={styles.head}>
        <div>
          <span style={styles.eyebrow}>Sourcing</span>
          <p style={styles.sub}>
            Per-client Boolean building, market mapping, and Apollo-backed chat
          </p>
        </div>
        <button style={styles.primaryBtn} onClick={() => setNameModal({ mode: 'add' })}>
          Add Client
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.viewToggle}>
        <button
          style={view === 'active' ? styles.viewTabActive : styles.viewTab}
          onClick={() => setView('active')}
        >
          Active ({active.length})
        </button>
        <button
          style={view === 'archived' ? styles.viewTabActive : styles.viewTab}
          onClick={() => setView('archived')}
        >
          Archived ({archived.length})
        </button>
      </div>

      {loading ? (
        <div style={styles.state}>Loading clients…</div>
      ) : (
        <div style={styles.grid}>
          {view === 'active' && (
            <button
              type="button"
              style={styles.addTile}
              onClick={() => setNameModal({ mode: 'add' })}
            >
              <span style={styles.addPlus}>+</span>
              <span style={styles.addLabel}>Add Client</span>
            </button>
          )}

          {shown.length === 0 && view === 'archived' && (
            <div style={styles.empty}>Nothing archived.</div>
          )}

          {shown.map((client) => (
            <div key={client.id} style={styles.tileWrap}>
              <button
                type="button"
                style={styles.tile}
                onClick={() => setOpen(client)}
              >
                <div style={styles.tileTop}>
                  <i className="ti ti-building-skyscraper" style={styles.tileIcon} aria-hidden />
                  {client.brain_buzz && (
                    <span style={styles.buzzChip} title="Brain Buzz on — chat persists">
                      <i className="ti ti-bolt" aria-hidden /> Buzz
                    </span>
                  )}
                </div>
                <span style={styles.tileName}>{client.name}</span>
                <span style={styles.tileDate}>
                  {client.created_at
                    ? new Date(client.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : ''}
                </span>
              </button>

              <button
                style={styles.kebab}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuFor(menuFor === client.id ? null : client.id);
                }}
                aria-label="More"
                title="Client actions"
              >
                <i className="ti ti-dots-vertical" aria-hidden />
              </button>

              {menuFor === client.id && (
                <>
                  <div style={styles.menuBackdrop} onClick={() => setMenuFor(null)} />
                  <div style={styles.menu} role="menu">
                    <button
                      style={styles.menuItem}
                      onClick={() => {
                        setMenuFor(null);
                        setNameModal({ mode: 'edit', client });
                      }}
                    >
                      <i className="ti ti-pencil" aria-hidden /> Edit
                    </button>
                    {client.archived ? (
                      <>
                        <button
                          style={styles.menuItem}
                          onClick={() => setArchived(client, false)}
                        >
                          <i className="ti ti-archive-off" aria-hidden /> Restore
                        </button>
                        <button
                          style={{ ...styles.menuItem, color: C.red }}
                          onClick={() => remove(client)}
                        >
                          <i className="ti ti-trash" aria-hidden /> Delete
                        </button>
                      </>
                    ) : (
                      <button
                        style={styles.menuItem}
                        onClick={() => setArchived(client, true)}
                      >
                        <i className="ti ti-archive" aria-hidden /> Archive
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {nameModal && (
        <NameModal
          title={nameModal.mode === 'add' ? 'Add Client' : 'Edit Client'}
          initial={nameModal.mode === 'edit' ? nameModal.client.name : ''}
          onSubmit={submitName}
          onClose={() => setNameModal(null)}
        />
      )}

      {open && (
        <ClientWorkspace
          key={open.id}
          client={open}
          onClientChange={(c) => patchLocal(c.id, c)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

// Text-input modal — the Sourcing analogue of the JD upload dialog: one field
// ("Account Name"), Enter or Save submits, autosaves on submit.
function NameModal({
  title,
  initial,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(name.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
      setBusy(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={styles.nameModal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{title}</h2>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <label style={styles.label}>Account Name</label>
        <input
          style={styles.nameInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
          placeholder="e.g. MaintainX"
          autoFocus
        />
        {err && <div style={styles.error}>{err}</div>}
        <div style={styles.modalActions}>
          <button
            style={styles.primaryBtn}
            onClick={save}
            disabled={busy || !name.trim()}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { marginTop: 28, fontFamily: FONT },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: C.green,
    fontWeight: 800,
  },
  sub: { margin: '6px 0 0', color: C.muted, fontSize: 13 },
  primaryBtn: {
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
  error: {
    marginTop: 14,
    padding: '8px 12px',
    background: `${C.red}1f`,
    border: `1px solid ${C.red}55`,
    borderRadius: RADIUS.chip,
    color: C.red,
    fontSize: 12.5,
  },
  viewToggle: { marginTop: 20, display: 'flex', gap: 6 },
  viewTab: {
    padding: '6px 12px',
    border: BORDER,
    borderRadius: 999,
    background: 'transparent',
    color: C.muted,
    fontSize: 12,
    fontWeight: 500,
    fontFamily: FONT,
    cursor: 'pointer',
  },
  viewTabActive: {
    padding: '6px 12px',
    border: `1px solid ${C.green}66`,
    borderRadius: 999,
    background: `${C.green}1f`,
    color: C.green,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: FONT,
    cursor: 'pointer',
  },
  state: { color: C.muted, fontSize: 13, padding: '40px 0', textAlign: 'center' },
  empty: { color: C.muted2, fontSize: 13, alignSelf: 'center' },
  grid: {
    marginTop: 16,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
    gap: 16,
  },
  addTile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 124,
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
  tileWrap: { position: 'relative', display: 'flex' },
  tile: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minHeight: 124,
    padding: 14,
    border: BORDER,
    borderRadius: RADIUS.card,
    background: C.panel2,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: FONT,
  },
  tileTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 30 },
  tileIcon: { fontSize: 20, color: C.greenDim },
  buzzChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 10,
    fontWeight: 700,
    color: C.green,
    background: `${C.green}1f`,
    border: `1px solid ${C.green}55`,
    borderRadius: 999,
    padding: '2px 8px',
  },
  tileName: {
    fontSize: 14.5,
    fontWeight: 700,
    color: C.white,
    lineHeight: 1.3,
    wordBreak: 'break-word',
    flex: 1,
  },
  tileDate: { fontSize: 11, color: C.muted2 },
  kebab: {
    position: 'absolute',
    top: 12,
    right: 12,
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
  menuBackdrop: { position: 'fixed', inset: 0, zIndex: 39 },
  menu: {
    position: 'absolute',
    top: 46,
    right: 12,
    zIndex: 40,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 130,
    background: C.panel,
    border: `1px solid ${C.line2}`,
    borderRadius: 10,
    padding: 4,
    boxShadow: '0 12px 30px -12px rgba(0,0,0,0.8)',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    border: 'none',
    borderRadius: 7,
    background: 'transparent',
    color: C.white,
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: FONT,
    cursor: 'pointer',
    textAlign: 'left',
  },

  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.62)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 50,
  },
  nameModal: {
    background: C.panel,
    border: BORDER,
    borderRadius: RADIUS.card,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    color: C.white,
    fontFamily: FONT,
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: C.white },
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
  label: {
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: C.muted2,
  },
  nameInput: {
    width: '100%',
    marginTop: 6,
    padding: '10px 12px',
    background: C.panel2,
    border: BORDER,
    borderRadius: 10,
    color: C.white,
    fontSize: 14,
    fontFamily: FONT,
    boxSizing: 'border-box',
  },
  modalActions: { marginTop: 18, display: 'flex', justifyContent: 'flex-end' },
};
