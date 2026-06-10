'use client';

import { useState } from 'react';
import type { Contact } from '../types';
import { setContactArchived, retryEnrichContact } from '../outreach/actions';
import UploadCsvDialog from '../outreach/UploadCsvDialog';
import ComposeModal from '../outreach/ComposeModal';
import { C, FONT, BORDER, RADIUS, STATUS } from '../funnel/tokens';

// Outbound quadrant — full view. Empty state = single "Upload & Send". Populated
// = batch-selectable list (Name | Title/Project | Sent status), click a row to
// compose to just that person, or select several and compose to the batch.
// Missing-email rows drop into a "contact info not provided" bucket with
// archive / retry — they never block the rest of the list.
export default function OutboundView({
  contacts,
  onChanged,
}: {
  contacts: Contact[];
  onChanged: () => void;
}) {
  const [showUpload, setShowUpload] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [composeContacts, setComposeContacts] = useState<Contact[] | null>(null);

  const visible = contacts.filter((c) => !c.archived);
  const main = visible.filter((c) => c.email_status !== 'missing');
  const missing = visible.filter((c) => c.email_status === 'missing');

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allSelected = main.length > 0 && main.every((c) => selected.has(c.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(main.map((c) => c.id)));

  const selectedContacts = main.filter((c) => selected.has(c.id));

  if (contacts.length === 0) {
    return (
      <div style={styles.wrap}>
        <Header count={0} onUpload={() => setShowUpload(true)} />
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>
            No outbound contacts yet. Upload a CSV exported from a LinkedIn
            Recruiter project to get started.
          </p>
          <button style={styles.primaryBtn} onClick={() => setShowUpload(true)}>
            Upload &amp; Send
          </button>
        </div>
        {showUpload && (
          <UploadCsvDialog
            listType="outbound"
            onClose={() => setShowUpload(false)}
            onUploaded={onChanged}
          />
        )}
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <Header count={main.length} onUpload={() => setShowUpload(true)} />

      {/* Batch action bar */}
      <div style={styles.batchBar}>
        <label style={styles.selectAll}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          Select all ({main.length})
        </label>
        <button
          style={selectedContacts.length ? styles.primaryBtn : styles.disabledBtn}
          disabled={selectedContacts.length === 0}
          onClick={() => setComposeContacts(selectedContacts)}
        >
          Compose to {selectedContacts.length} →
        </button>
      </div>

      <div style={styles.list}>
        {main.map((c) => (
          <article
            key={c.id}
            style={styles.row}
            onClick={() => setComposeContacts([c])}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setComposeContacts([c]);
              }
            }}
          >
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              onClick={(e) => e.stopPropagation()}
              style={styles.checkbox}
            />
            <div style={styles.rowMain}>
              <div style={styles.name}>{c.name || 'Untitled'}</div>
              <div style={styles.sub}>{c.source_project || c.title || '—'}</div>
            </div>
            <div style={styles.rowRight}>
              {c.contacted ? (
                <span style={{ ...styles.pill, color: C.green, background: `${C.green}1f` }}>
                  ✓ Sent
                </span>
              ) : (
                <span style={{ ...styles.pill, color: C.muted2, background: `${C.muted2}1f` }}>
                  Not sent
                </span>
              )}
            </div>
          </article>
        ))}
      </div>

      {/* Contact info not provided */}
      {missing.length > 0 && (
        <section style={styles.missingBlock}>
          <div style={styles.missingHead}>
            <span style={styles.eyebrowAmber}>Contact info not provided</span>
            <span style={styles.meta}>{missing.length} — enrichment couldn’t find an email</span>
          </div>
          <div style={styles.list}>
            {missing.map((c) => (
              <article key={c.id} style={styles.missingRow}>
                <div style={styles.rowMain}>
                  <div style={styles.name}>{c.name || 'Untitled'}</div>
                  <div style={styles.sub}>{c.source_project || c.title || '—'}</div>
                </div>
                <div style={styles.rowRight}>
                  <button
                    style={styles.smallBtn}
                    title="Re-run enrichment (placeholder)"
                    onClick={async () => {
                      await retryEnrichContact(c.id);
                      onChanged();
                    }}
                  >
                    Retry
                  </button>
                  <button
                    style={styles.smallBtn}
                    onClick={async () => {
                      await setContactArchived(c.id, true);
                      onChanged();
                    }}
                  >
                    Archive
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {showUpload && (
        <UploadCsvDialog
          listType="outbound"
          onClose={() => setShowUpload(false)}
          onUploaded={onChanged}
        />
      )}
      {composeContacts && (
        <ComposeModal
          contacts={composeContacts}
          onClose={() => setComposeContacts(null)}
          onSent={() => {
            setComposeContacts(null);
            setSelected(new Set());
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function Header({ count, onUpload }: { count: number; onUpload: () => void }) {
  return (
    <div style={styles.header}>
      <div>
        <span style={styles.eyebrow}>Outbound</span>
        <span style={styles.count}> · {count} contacts</span>
      </div>
      <button style={styles.primaryBtn} onClick={onUpload}>
        Upload &amp; Send
      </button>
    </div>
  );
}

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
  emptyText: { color: C.muted, fontSize: 14, maxWidth: 380, margin: 0 },
  batchBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  selectAll: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  row: {
    background: C.panel,
    border: BORDER,
    borderRadius: RADIUS.card,
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    cursor: 'pointer',
  },
  checkbox: { flexShrink: 0 },
  rowMain: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 },
  rowRight: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  name: { fontSize: 14, fontWeight: 600, color: C.white, letterSpacing: '-0.01em' },
  sub: { fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pill: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderRadius: 999,
    padding: '4px 10px',
    whiteSpace: 'nowrap',
  },
  missingBlock: { marginTop: 28 },
  missingHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eyebrowAmber: {
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: STATUS.pending,
    fontWeight: 800,
  },
  meta: { fontSize: 11, color: C.muted2 },
  missingRow: {
    background: C.panel,
    border: BORDER,
    borderLeft: `3px solid ${STATUS.pending}`,
    borderRadius: '0 8px 8px 0',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  smallBtn: {
    padding: '5px 10px',
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
  disabledBtn: {
    padding: '9px 18px',
    border: BORDER,
    borderRadius: RADIUS.button,
    background: 'transparent',
    color: C.muted2,
    cursor: 'not-allowed',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: FONT,
  },
};
