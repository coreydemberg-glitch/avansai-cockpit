'use client';

import { useEffect, useState, useTransition } from 'react';
import type { Candidate } from './types';
import { saveNotes, saveLinkedin } from './actions';

const trelloUrl = (cardId: string | null) =>
  cardId ? `https://trello.com/c/${cardId}` : null;

// Classify a candidate into one of three pipeline stages from its free-text
// status. Drives both the list rail/pill colors and the stats bar counts.
type Stage = 'new' | 'interview' | 'sourced';
const stageOf = (status: string | null): Stage => {
  const s = (status || '').toLowerCase();
  if (s.includes('interview')) return 'interview';
  if (s.includes('source')) return 'sourced';
  return 'new';
};

const stageColor: Record<Stage, string> = {
  new: '#34e5a0',
  interview: '#4a90e2',
  sourced: '#5a5f6b',
};

const stageTint: Record<Stage, string> = {
  new: 'rgba(52, 229, 160, 0.12)',
  interview: 'rgba(74, 144, 226, 0.14)',
  sourced: 'rgba(90, 95, 107, 0.18)',
};

export default function CockpitBoard({
  candidates,
}: {
  candidates: Candidate[];
}) {
  const [selected, setSelected] = useState<Candidate | null>(null);

  // Date is rendered after mount to avoid an SSR/client hydration mismatch.
  const [today, setToday] = useState('');
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    );
  }, []);

  const total = candidates.length;
  const activePipeline = candidates.filter(
    (c) => stageOf(c.status) === 'interview'
  ).length;
  const needsAction = candidates.filter(
    (c) => stageOf(c.status) === 'new'
  ).length;

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.h1}>Cockpit</h1>
          <span style={styles.kicker}>Recruiter view</span>
        </div>
        <span style={styles.date}>{today}</span>
      </header>

      <section style={styles.statsBar}>
        <StatCard value={total} label="Total Candidates" />
        <StatCard value={activePipeline} label="Active Pipeline" />
        <StatCard value={needsAction} label="Needs Action" />
      </section>

      {candidates.length === 0 ? (
        <p style={styles.empty}>
          No candidates yet. Create a card on the connected Trello board and it
          will appear here.
        </p>
      ) : (
        <div style={styles.list}>
          {candidates.map((c) => {
            const stage = stageOf(c.status);
            return (
              <article
                key={c.id}
                style={{
                  ...styles.card,
                  borderLeft: `3px solid ${stageColor[stage]}`,
                }}
                onClick={() => setSelected(c)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelected(c);
                }}
              >
                <div style={styles.cardMain}>
                  <h2 style={styles.name}>{c.name || 'Untitled'}</h2>
                  <p style={styles.role}>{c.role || 'Role not set'}</p>
                </div>
                <StatusPill stage={stage} status={c.status} />
              </article>
            );
          })}
        </div>
      )}

      {selected && (
        <CandidateModal
          candidate={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function StatusPill({
  stage,
  status,
}: {
  stage: Stage;
  status: string | null;
}) {
  const label = status || 'New';
  return (
    <span
      style={{
        ...styles.pill,
        color: stageColor[stage],
        background: stageTint[stage],
      }}
    >
      {label}
    </span>
  );
}

function CandidateModal({
  candidate,
  onClose,
}: {
  candidate: Candidate;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(candidate.notes ?? '');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [cleaned, setCleaned] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanErr, setCleanErr] = useState<string | null>(null);

  const handleClean = async () => {
    setCleanErr(null);
    setCleaning(true);
    try {
      const res = await fetch('/api/clean-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clean notes');
      setCleaned(data.structured);
    } catch (e) {
      setCleanErr(e instanceof Error ? e.message : 'Failed to clean notes');
    } finally {
      setCleaning(false);
    }
  };

  const [emailTo, setEmailTo] = useState(candidate.email ?? '');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sending, setSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  const handleSend = async () => {
    setEmailMsg(null);
    setSending(true);
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailTo,
          subject: emailSubject,
          body: emailBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setEmailMsg('Sent ✓');
    } catch (e) {
      setEmailMsg(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleSave = () => {
    setSaveMsg(null);
    startTransition(async () => {
      const res = await saveNotes(candidate.id, notes);
      setSaveMsg(res.ok ? 'Saved' : `Error: ${res.error ?? 'unknown'}`);
    });
  };

  // Resume upload
  const [resumeUrl, setResumeUrl] = useState<string | null>(
    candidate.resume ?? null
  );
  const [uploading, setUploading] = useState(false);
  const [resumeMsg, setResumeMsg] = useState<string | null>(null);

  const handleResume = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeMsg(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('candidateId', candidate.id);
      fd.append('file', file);
      const res = await fetch('/api/upload-resume', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setResumeUrl(data.url);
      setResumeMsg('Uploaded ✓');
    } catch (err) {
      setResumeMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // LinkedIn
  const [linkedin, setLinkedin] = useState(candidate.linkedin_url ?? '');
  const [savedLinkedin, setSavedLinkedin] = useState(
    candidate.linkedin_url ?? ''
  );
  const [linkedinSaving, setLinkedinSaving] = useState(false);
  const [linkedinMsg, setLinkedinMsg] = useState<string | null>(null);

  const handleSaveLinkedin = async () => {
    setLinkedinMsg(null);
    setLinkedinSaving(true);
    const res = await saveLinkedin(candidate.id, linkedin.trim());
    if (res.ok) {
      setSavedLinkedin(linkedin.trim());
      setLinkedinMsg('Saved ✓');
    } else {
      setLinkedinMsg(`Error: ${res.error ?? 'unknown'}`);
    }
    setLinkedinSaving(false);
  };

  const [activeTab, setActiveTab] = useState<
    'email' | 'notes' | 'resume' | 'linkedin'
  >('notes');
  const resumeName = resumeUrl
    ? decodeURIComponent(resumeUrl.split('/').pop() || 'resume').replace(
        /^\d+-/,
        ''
      )
    : null;

  // Action buttons are stubs for now — wired to clear feedback so the flow is
  // visible. Real integrations (Gmail, Bullhorn, calendar) come next.
  const stub = (label: string) =>
    setActionMsg(`${label} — not connected yet (coming soon)`);

  const tUrl = trelloUrl(candidate.trello_card_id);
  const stage = stageOf(candidate.status);

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
            <h2 style={styles.modalTitle}>{candidate.name || 'Untitled'}</h2>
            <p style={styles.modalSub}>{candidate.role || 'Role not set'}</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <dl style={styles.meta}>
          <Field
            label="Status"
            value={<StatusPill stage={stage} status={candidate.status} />}
          />
          {tUrl && (
            <Field
              label="Trello"
              value={
                <a
                  href={tUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.link}
                >
                  Card ↗
                </a>
              }
            />
          )}
        </dl>

        <div style={styles.tabBar}>
          {(
            [
              { key: 'email', label: '✉️ Email' },
              { key: 'notes', label: '📝 Notes' },
              { key: 'resume', label: '📄 Resume' },
              { key: 'linkedin', label: '🔗 LinkedIn' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={activeTab === t.key ? styles.tabActive : styles.tab}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={styles.tabContent}>
          {activeTab === 'notes' && (
            <>
              <label style={styles.label}>Notes</label>
              <textarea
                style={styles.textarea}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this candidate…"
                rows={5}
              />
              <div style={styles.saveRow}>
                <button
                  style={styles.secondaryBtn}
                  onClick={handleClean}
                  disabled={cleaning || notes.trim().length === 0}
                >
                  {cleaning
                    ? 'Cleaning…'
                    : cleaned
                    ? 'Re-clean notes'
                    : 'Clean notes'}
                </button>
                <button
                  style={styles.primaryBtn}
                  onClick={handleSave}
                  disabled={isPending}
                >
                  {isPending ? 'Saving…' : 'Save notes'}
                </button>
                {saveMsg && (
                  <span
                    style={{
                      ...styles.saveMsg,
                      color: saveMsg.startsWith('Error') ? '#f87171' : '#34e5a0',
                    }}
                  >
                    {saveMsg}
                  </span>
                )}
              </div>
              {cleanErr && <p style={styles.cleanErrMsg}>{cleanErr}</p>}
              {cleaned !== null && (
                <div style={styles.cleanedBox}>
                  <div style={styles.cleanedLabel}>Structured (AI cleanup)</div>
                  <div style={styles.cleanedText}>{cleaned}</div>
                </div>
              )}
            </>
          )}

          {activeTab === 'email' && (
            <div style={styles.sectionCol}>
              <label style={styles.label}>To</label>
              <input
                style={styles.input}
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="candidate@email.com"
              />
              <label style={styles.label}>Subject</label>
              <input
                style={styles.input}
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Subject"
              />
              <label style={styles.label}>Body</label>
              <textarea
                style={styles.textarea}
                rows={5}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Message…"
              />
              <div style={styles.saveRow}>
                <button
                  style={styles.primaryBtn}
                  onClick={handleSend}
                  disabled={sending || !emailTo}
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
                {emailMsg && (
                  <span
                    style={{
                      ...styles.saveMsg,
                      color: emailMsg.startsWith('Sent') ? '#34e5a0' : '#f87171',
                    }}
                  >
                    {emailMsg}
                  </span>
                )}
              </div>
            </div>
          )}

          {activeTab === 'resume' && (
            <div style={styles.sectionCol}>
              <label style={styles.label}>Resume (PDF or image)</label>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={handleResume}
                disabled={uploading}
                style={styles.input}
              />
              {uploading && <span style={styles.actionMsg}>Uploading…</span>}
              {resumeUrl && (
                <p style={styles.fieldValue}>
                  📄{' '}
                  <a
                    href={resumeUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.link}
                  >
                    {resumeName}
                  </a>
                </p>
              )}
              {resumeMsg && (
                <span
                  style={{
                    ...styles.saveMsg,
                    color: resumeMsg.startsWith('Uploaded')
                      ? '#34e5a0'
                      : '#f87171',
                  }}
                >
                  {resumeMsg}
                </span>
              )}
            </div>
          )}

          {activeTab === 'linkedin' && (
            <div style={styles.sectionCol}>
              {savedLinkedin ? (
                <>
                  <a
                    href={savedLinkedin}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.openProfileBtn}
                  >
                    Open LinkedIn profile ↗
                  </a>
                  <button
                    style={styles.secondaryBtn}
                    onClick={() => setSavedLinkedin('')}
                  >
                    Edit URL
                  </button>
                </>
              ) : (
                <>
                  <label style={styles.label}>Add LinkedIn</label>
                  <input
                    style={styles.input}
                    value={linkedin}
                    onChange={(e) => setLinkedin(e.target.value)}
                    placeholder="https://www.linkedin.com/in/…"
                  />
                  <div style={styles.saveRow}>
                    <button
                      style={styles.primaryBtn}
                      onClick={handleSaveLinkedin}
                      disabled={linkedinSaving || !linkedin.trim()}
                    >
                      {linkedinSaving ? 'Saving…' : 'Save LinkedIn'}
                    </button>
                    {linkedinMsg && (
                      <span
                        style={{
                          ...styles.saveMsg,
                          color: linkedinMsg.startsWith('Error')
                            ? '#f87171'
                            : '#34e5a0',
                        }}
                      >
                        {linkedinMsg}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div style={styles.actionsRow}>
          <button style={styles.secondaryBtn} onClick={() => stub('Log to Bullhorn')}>
            📋 Log to Bullhorn
          </button>
          <button
            style={styles.secondaryBtn}
            onClick={() => stub('Schedule follow-up')}
          >
            📅 Schedule follow-up
          </button>
        </div>
        {actionMsg && <p style={styles.actionMsg}>{actionMsg}</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={styles.field}>
      <dt style={styles.fieldLabel}>{label}</dt>
      <dd style={styles.fieldValue}>{value}</dd>
    </div>
  );
}

const FONT = "Inter, system-ui, -apple-system, sans-serif";

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    padding: 40,
    fontFamily: FONT,
    maxWidth: 1100,
    margin: '0 auto',
    background: '#0f1115',
    color: '#e8eaed',
    fontWeight: 400,
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeft: { display: 'flex', alignItems: 'baseline', gap: 12 },
  h1: {
    margin: 0,
    fontSize: 20,
    fontWeight: 500,
    letterSpacing: '-0.01em',
    color: '#e8eaed',
  },
  kicker: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#8b909c',
    fontWeight: 400,
  },
  date: { fontSize: 13, color: '#8b909c', fontWeight: 400 },

  statsBar: {
    marginTop: 28,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 14,
  },
  statCard: {
    background: '#1a1d24',
    border: '1px solid #262a33',
    borderRadius: 14,
    padding: '20px 22px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 500,
    color: '#34e5a0',
    letterSpacing: '-0.01em',
    lineHeight: 1,
  },
  statLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#8b909c',
    fontWeight: 400,
  },

  empty: { marginTop: 28, color: '#8b909c', fontSize: 14 },

  list: {
    marginTop: 28,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  card: {
    background: '#1a1d24',
    border: '1px solid #262a33',
    borderRadius: 14,
    padding: '14px 18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    cursor: 'pointer',
  },
  cardMain: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  name: {
    margin: 0,
    fontSize: 14,
    fontWeight: 500,
    color: '#e8eaed',
    letterSpacing: '-0.01em',
  },
  role: { margin: 0, color: '#8b909c', fontSize: 12, fontWeight: 400 },
  pill: {
    fontSize: 10,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderRadius: 999,
    padding: '4px 10px',
    whiteSpace: 'nowrap',
  },
  link: { color: '#34e5a0', textDecoration: 'none' },

  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 50,
  },
  modal: {
    background: '#1a1d24',
    border: '1px solid #262a33',
    borderRadius: 14,
    padding: 24,
    width: '100%',
    maxWidth: 540,
    maxHeight: '90vh',
    overflowY: 'auto',
    color: '#e8eaed',
    fontFamily: FONT,
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modalTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 500,
    letterSpacing: '-0.01em',
    color: '#e8eaed',
  },
  modalSub: { margin: '4px 0 0', color: '#8b909c', fontSize: 13 },
  closeBtn: {
    border: 'none',
    background: 'transparent',
    fontSize: 16,
    cursor: 'pointer',
    color: '#8b909c',
    lineHeight: 1,
    padding: 4,
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 20,
    margin: '18px 0',
  },
  field: { margin: 0 },
  fieldLabel: {
    margin: 0,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#5a5f6b',
    fontWeight: 400,
  },
  fieldValue: { margin: '4px 0 0', fontSize: 13, color: '#e8eaed' },
  label: {
    fontSize: 11,
    fontWeight: 400,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#5a5f6b',
  },
  textarea: {
    width: '100%',
    marginTop: 6,
    padding: 11,
    background: '#0f1115',
    border: '1px solid #262a33',
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 14,
    color: '#e8eaed',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  saveRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 },
  primaryBtn: {
    padding: '9px 18px',
    border: 'none',
    borderRadius: 10,
    background: '#34e5a0',
    color: '#0f1115',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'inherit',
  },
  secondaryBtn: {
    padding: '9px 16px',
    border: '1px solid #262a33',
    borderRadius: 10,
    background: 'transparent',
    color: '#e8eaed',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 400,
    fontFamily: 'inherit',
  },
  saveMsg: { fontSize: 13 },
  cleanErrMsg: { marginTop: 12, fontSize: 13, color: '#f87171' },
  cleanedBox: {
    marginTop: 16,
    border: '1px solid #262a33',
    borderRadius: 10,
    background: '#0f1115',
    padding: 14,
  },
  cleanedLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#5a5f6b',
    marginBottom: 8,
  },
  cleanedText: {
    fontSize: 14,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    color: '#e8eaed',
  },
  actionsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 22,
    borderTop: '1px solid #262a33',
    paddingTop: 18,
  },
  actionMsg: { marginTop: 12, fontSize: 13, color: '#8b909c' },
  input: {
    marginTop: 6,
    padding: 10,
    background: '#0f1115',
    border: '1px solid #262a33',
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 14,
    color: '#e8eaed',
    boxSizing: 'border-box',
  },
  tabBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 6,
    marginBottom: 18,
  },
  tab: {
    padding: '9px 8px',
    border: '1px solid #262a33',
    borderRadius: 10,
    background: '#23272f',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 400,
    fontFamily: 'inherit',
    color: '#8b909c',
    textAlign: 'center',
  },
  tabActive: {
    padding: '9px 8px',
    border: '1px solid rgba(52, 229, 160, 0.4)',
    borderRadius: 10,
    background: 'rgba(52, 229, 160, 0.12)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'inherit',
    color: '#34e5a0',
    textAlign: 'center',
  },
  tabContent: { minHeight: 140 },
  sectionCol: { display: 'flex', flexDirection: 'column', gap: 6 },
  openProfileBtn: {
    display: 'inline-block',
    alignSelf: 'flex-start',
    padding: '9px 18px',
    borderRadius: 10,
    background: '#34e5a0',
    color: '#0f1115',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 500,
  },
};
