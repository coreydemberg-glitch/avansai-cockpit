'use client';

import { useState } from 'react';
import type { ContactListType } from '../types';
import { C, FONT, RADIUS, BORDER } from '../funnel/tokens';

// Shared CSV upload dialog for both quadrants. Posts to the shared
// /api/contacts/upload route with the list_type so the same plumbing serves
// Outbound and Referral. For Outbound, an optional Project name becomes each
// row's source_project ("Title/Project" column, e.g. "MaintainX Data").
export default function UploadCsvDialog({
  listType,
  onClose,
  onUploaded,
}: {
  listType: ContactListType;
  onClose: () => void;
  onUploaded: () => Promise<void> | void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [project, setProject] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [done, setDone] = useState(false);

  const handleUpload = async () => {
    if (!file || busy) return;
    setBusy(true);
    setMsg(null);
    setIsError(false);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('list_type', listType);
      if (listType === 'outbound' && project.trim()) {
        fd.append('project', project.trim());
      }
      const res = await fetch('/api/contacts/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      const parts = [`${data.inserted} added`];
      if (data.skipped) parts.push(`${data.skipped} already there`);
      if (data.missingEmail) parts.push(`${data.missingEmail} missing email`);
      setMsg(parts.join(' · '));
      setDone(true);
      await onUploaded();
    } catch (e) {
      setIsError(true);
      setMsg(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div style={styles.modalHeader}>
          <div>
            <h2 style={styles.modalTitle}>
              Upload {listType === 'outbound' ? 'outbound' : 'referral'} CSV
            </h2>
            <p style={styles.modalSub}>
              Export from LinkedIn Recruiter or any sheet with Name / Email columns
            </p>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div style={{ ...styles.sectionCol, marginTop: 18 }}>
          {listType === 'outbound' && (
            <>
              <label style={styles.label}>Project / list name (optional)</label>
              <input
                style={styles.input}
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder='e.g. "MaintainX Data"'
              />
            </>
          )}
          <label style={{ ...styles.label, marginTop: 12 }}>CSV file</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={busy}
            style={styles.input}
          />
          <div style={styles.saveRow}>
            {done ? (
              <button style={styles.primaryBtn} onClick={onClose}>
                Done
              </button>
            ) : (
              <button
                style={styles.primaryBtn}
                onClick={handleUpload}
                disabled={busy || !file}
              >
                {busy ? 'Uploading…' : 'Upload'}
              </button>
            )}
            {msg && (
              <span style={{ ...styles.saveMsg, color: isError ? '#f87171' : C.green }}>
                {msg}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  modal: {
    background: C.panel,
    border: BORDER,
    borderRadius: RADIUS.card,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    color: C.white,
    fontFamily: FONT,
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: C.white },
  modalSub: { margin: '4px 0 0', color: C.muted, fontSize: 13 },
  closeBtn: { border: 'none', background: 'transparent', fontSize: 16, cursor: 'pointer', color: C.muted, lineHeight: 1, padding: 4 },
  sectionCol: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted2 },
  input: {
    marginTop: 6,
    padding: 10,
    background: C.panel2,
    border: BORDER,
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 14,
    color: C.white,
    boxSizing: 'border-box',
  },
  saveRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' },
  primaryBtn: {
    padding: '9px 18px',
    border: 'none',
    borderRadius: RADIUS.button,
    background: C.green,
    color: C.bg,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  saveMsg: { fontSize: 13 },
};
