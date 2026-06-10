'use client';

import { useState } from 'react';
import type { Contact } from '../types';
import UploadCsvDialog from '../outreach/UploadCsvDialog';
import ContactModal from '../outreach/ContactModal';
import { C, FONT, BORDER, RADIUS } from '../funnel/tokens';

// Referral Level 1 — full view. Columns: Name · Title · Company · Date last
// contacted · Referrals. Click a row → ContactModal (matches Funnel card
// behavior: conditional render, key={id} remount, onChanged=router.refresh,
// onClose=clear).
export default function ReferralView({
  contacts,
  referralCounts,
  onChanged,
}: {
  contacts: Contact[];
  referralCounts: Record<string, number>;
  onChanged: () => void;
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);

  const visible = contacts.filter((c) => !c.archived);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <span style={styles.eyebrow}>Referrals · Level 1</span>
          <span style={styles.count}> · {visible.length} in network</span>
        </div>
        <button style={styles.primaryBtn} onClick={() => setShowUpload(true)}>
          Upload CSV
        </button>
      </div>

      {visible.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>
            No referral contacts yet. Upload a CSV of people you already know —
            placements are the highest-quality referral source.
          </p>
          <button style={styles.primaryBtn} onClick={() => setShowUpload(true)}>
            Upload CSV
          </button>
        </div>
      ) : (
        <div style={styles.table}>
          <div style={styles.theadRow}>
            <span style={styles.th}>Name</span>
            <span style={styles.th}>Title</span>
            <span style={styles.th}>Company</span>
            <span style={styles.th}>Last contacted</span>
            <span style={styles.thRight}>Referrals</span>
          </div>
          {visible.map((c) => (
            <article
              key={c.id}
              style={styles.trow}
              onClick={() => setSelected(c)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected(c);
                }
              }}
            >
              <span style={styles.tdName}>{c.name || 'Untitled'}</span>
              <span style={styles.td}>{c.title || '—'}</span>
              <span style={styles.td}>{c.company || '—'}</span>
              <span style={styles.td}>{formatLastContacted(c.last_contacted_at)}</span>
              <span style={styles.tdRight}>
                <span style={styles.refPill}>{referralCounts[c.id] ?? 0}</span>
              </span>
            </article>
          ))}
        </div>
      )}

      {showUpload && (
        <UploadCsvDialog
          listType="referral"
          onClose={() => setShowUpload(false)}
          onUploaded={onChanged}
        />
      )}
      {selected && (
        <ContactModal
          key={selected.id}
          contact={selected}
          onChanged={onChanged}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// Spec: assume nobody was contacted in the last 6 months → null reads as stale.
function formatLastContacted(iso?: string | null): string {
  if (!iso) return '6+ months ago';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const COLS = '1.4fr 1.4fr 1.2fr 1fr 0.6fr';

const styles: Record<string, React.CSSProperties> = {
  wrap: { fontFamily: FONT },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 18,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: C.green,
    fontWeight: 800,
  },
  count: { fontSize: 12, color: C.muted2 },
  emptyState: {
    border: BORDER,
    borderRadius: RADIUS.card,
    background: C.panel,
    padding: 40,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    textAlign: 'center',
  },
  emptyText: { color: C.muted, fontSize: 14, maxWidth: 420, margin: 0 },
  table: { display: 'flex', flexDirection: 'column', gap: 8 },
  theadRow: {
    display: 'grid',
    gridTemplateColumns: COLS,
    gap: 12,
    padding: '0 16px 8px',
  },
  th: { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted2, fontWeight: 600 },
  thRight: { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted2, fontWeight: 600, textAlign: 'right' },
  trow: {
    display: 'grid',
    gridTemplateColumns: COLS,
    gap: 12,
    alignItems: 'center',
    background: C.panel,
    border: BORDER,
    borderRadius: RADIUS.card,
    padding: '14px 16px',
    cursor: 'pointer',
  },
  tdName: { fontSize: 14, fontWeight: 600, color: C.white, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  td: { fontSize: 13, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tdRight: { textAlign: 'right' },
  refPill: {
    fontSize: 11,
    fontWeight: 700,
    color: C.blue,
    background: `${C.blue}1f`,
    borderRadius: 999,
    padding: '3px 10px',
  },
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
};
