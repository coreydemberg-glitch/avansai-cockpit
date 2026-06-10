'use client';

// Prep modal (slider build §4) — auto-pops the instant a candidate's slider snaps
// to a half-step. Two sections: the relevant Job Description (auto-selected; the
// primary action at stage 1.5 — "send them the JD") and additional Prep Documents
// for the round. "Send Prep" reuses the existing Outbound send transport
// (/api/send-email, from corey@avansai.com) with the same one-time-send guard, then
// locks the half-step into a solid green laser via setPrepSent.
import { useEffect, useMemo, useState } from 'react';
import type { Candidate, JobDescription, PrepMaterial } from '../types';
import { C, STATUS, FONT, RADIUS, BORDER, GLOW, stageLabel } from './tokens';
import { getEmailTemplate, setPrepSent, closeActionItem, listPrepMaterials } from '../actions';

// Sensible default prep email when no prep_stage_<n> template exists in the DB.
function defaultPrepEmail(candidate: Candidate, stage: number) {
  const name = stageLabel(stage);
  const role = candidate.role || 'the role';
  if (stage === 1) {
    return {
      subject: `The role at Avansai — ${role}`,
      body: `Hi,\n\nThanks for your interest — I've attached the job description for ${role}. Have a read and let me know if it looks like a fit; happy to set up a quick call.\n\nThanks,\nCorey`,
    };
  }
  return {
    subject: `Interview prep — ${name}`,
    body: `Hi,\n\nAhead of your ${name.toLowerCase()} round, I've attached some prep materials to help you get ready. Take a look and let me know if you have any questions.\n\nThanks,\nCorey`,
  };
}

// Best-guess JD for this candidate: a title that overlaps the candidate's role,
// else the first JD. Pre-selected so the recruiter can just hit Send.
function bestJobId(jobs: JobDescription[], role: string | null): string {
  if (!jobs.length) return '';
  if (role) {
    const r = role.toLowerCase();
    const hit = jobs.find(
      (j) => r.includes(j.title.toLowerCase()) || j.title.toLowerCase().includes(r)
    );
    if (hit) return hit.id;
  }
  return jobs[0].id;
}

export default function PrepModal({
  candidate,
  stage,
  value,
  jobs,
  onSent,
  onClose,
  onOpenLibrary,
}: {
  candidate: Candidate;
  stage: number; // floored stage 1..8
  value: number; // the half-step, e.g. 3.5
  jobs: JobDescription[];
  onSent: () => void;
  onClose: () => void;
  onOpenLibrary: () => void;
}) {
  const stageName = stageLabel(stage);
  const jdPrimary = stage === 1; // 1.5 → "send them the job description" moment

  const [emailTo, setEmailTo] = useState(candidate.email ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [jobId, setJobId] = useState<string>(() => bestJobId(jobs, candidate.role));
  const [materials, setMaterials] = useState<PrepMaterial[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loadingMats, setLoadingMats] = useState(true);

  const [sending, setSending] = useState(false);
  const [sentOnce, setSentOnce] = useState(false); // one-time-send guard
  const [msg, setMsg] = useState<string | null>(null);

  // Prefill the email once: a per-stage DB template if present, else a default.
  useEffect(() => {
    let cancelled = false;
    const d = defaultPrepEmail(candidate, stage);
    setSubject(d.subject);
    setBody(d.body);
    getEmailTemplate(`prep_stage_${stage}`)
      .then((res) => {
        if (cancelled || !res.ok || !res.template) return;
        setSubject(res.template.subject);
        const g = res.template.greeting.split('[name]').join('').trim();
        const b = res.template.body.split('[name]').join('').trim();
        setBody(g ? `${g}\n\n${b}` : b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load prep materials; preselect docs tagged to this stage.
  useEffect(() => {
    let cancelled = false;
    listPrepMaterials()
      .then((res) => {
        if (cancelled) return;
        const mats = res.materials ?? [];
        setMaterials(mats);
        setPicked(new Set(mats.filter((m) => m.stage === stage).map((m) => m.id)));
      })
      .finally(() => {
        if (!cancelled) setLoadingMats(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stage-relevant docs first (tagged to this stage or untagged), then the rest.
  const sortedMaterials = useMemo(() => {
    const rel = materials.filter((m) => m.stage === stage || m.stage == null);
    const other = materials.filter((m) => m.stage != null && m.stage !== stage);
    return [...rel, ...other];
  }, [materials, stage]);

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleSend = async () => {
    if (sending || sentOnce) return; // never fire a duplicate
    if (!emailTo.includes('@')) {
      setMsg('Add a recipient email first.');
      return;
    }
    setSending(true);
    setMsg(null);
    try {
      const attachments: { path: string; filename: string; bucket: string }[] = [];
      const job = jobs.find((j) => j.id === jobId);
      if (job) attachments.push({ path: job.file_path, filename: `${job.title}.pdf`, bucket: 'job-descriptions' });
      for (const m of materials) {
        if (picked.has(m.id)) attachments.push({ path: m.file_path, filename: `${m.title}.pdf`, bucket: 'prep-materials' });
      }

      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: emailTo, subject, body, attachments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');

      // Lock the half-step into a green laser + clear any prep to-do.
      await setPrepSent(candidate.id, true);
      await closeActionItem(candidate.id, 'prep');
      setSentOnce(true);
      setMsg('Prep sent ✓');
      onSent();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={styles.header}>
          <div>
            <span style={styles.eyebrow}>Send Prep · {value.toFixed(1)}</span>
            <h2 style={styles.title}>Send Prep — {stageName}</h2>
            <p style={styles.sub}>
              {candidate.name || 'Untitled'} · {candidate.role || 'Role not set'}
            </p>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Section 1 — Job Description */}
        <section style={jdPrimary ? styles.sectionPrimary : styles.section}>
          <div style={styles.sectionHead}>
            <span style={styles.sectionLabel}>
              <i className="ti ti-file-text" aria-hidden /> Job Description
            </span>
            {jdPrimary && <span style={styles.primaryTag}>Primary — send the JD</span>}
          </div>
          {jobs.length === 0 ? (
            <p style={styles.stub}>
              No job descriptions yet. Add one from the left panel (Add Job Description).
            </p>
          ) : (
            <select style={styles.select} value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">No job description</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          )}
        </section>

        {/* Section 2 — Prep Documents */}
        <section style={styles.section}>
          <div style={styles.sectionHead}>
            <span style={styles.sectionLabel}>
              <i className="ti ti-files" aria-hidden /> Prep Documents
            </span>
            <button style={styles.libraryLink} onClick={onOpenLibrary}>
              Browse library ↗
            </button>
          </div>
          {loadingMats ? (
            <p style={styles.stub}>Loading prep documents…</p>
          ) : sortedMaterials.length === 0 ? (
            <p style={styles.stub}>
              {/* TODO(prep-materials): empty until prep docs are uploaded and the
                  0006 migration is applied. Upload via "Browse library". */}
              No prep documents yet — add some via “Browse library”.
            </p>
          ) : (
            <div style={styles.matList}>
              {sortedMaterials.map((m) => {
                const on = picked.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    style={{ ...styles.matRow, ...(on ? styles.matRowOn : null) }}
                    onClick={() => togglePick(m.id)}
                  >
                    <span style={{ ...styles.checkbox, ...(on ? styles.checkboxOn : null) }}>
                      {on ? '✓' : ''}
                    </span>
                    <span style={styles.matTitle}>{m.title}</span>
                    {m.stage != null && <span style={styles.matStage}>Stage {m.stage}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Email composition */}
        <section style={styles.section}>
          <label style={styles.fieldLabel}>To</label>
          <input style={styles.input} value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="candidate@email.com" />
          <label style={styles.fieldLabel}>Subject</label>
          <input style={styles.input} value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label style={styles.fieldLabel}>Message</label>
          <textarea style={styles.textarea} rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
        </section>

        <div style={styles.footer}>
          <button
            style={sentOnce ? styles.sentBtn : styles.sendBtn}
            onClick={handleSend}
            disabled={sending || sentOnce || !emailTo}
          >
            {sentOnce ? 'Prep sent ✓' : sending ? 'Sending…' : 'Send Prep'}
          </button>
          {msg && (
            <span style={{ ...styles.msg, color: msg.includes('✓') ? C.green : C.red }}>{msg}</span>
          )}
          <span style={styles.flex} />
          {!sentOnce && (
            <button style={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 55,
    animation: 'none',
  },
  modal: {
    background: C.panel,
    border: `1px solid ${C.line2}`,
    borderRadius: RADIUS.card,
    padding: 24,
    width: '100%',
    maxWidth: 560,
    maxHeight: '90vh',
    overflowY: 'auto',
    color: C.white,
    fontFamily: FONT,
    boxShadow: '0 24px 60px -24px rgba(0,0,0,0.8), 0 0 0 1px rgba(34,255,136,0.05)',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  eyebrow: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: C.green,
  },
  title: { margin: '4px 0 0', fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', color: C.white },
  sub: { margin: '4px 0 0', color: C.muted, fontSize: 13 },
  closeBtn: { border: 'none', background: 'transparent', fontSize: 16, cursor: 'pointer', color: C.muted, lineHeight: 1, padding: 4 },

  section: {
    marginTop: 16,
    padding: 14,
    background: C.panel2,
    border: BORDER,
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sectionPrimary: {
    marginTop: 16,
    padding: 14,
    background: `${C.green}12`,
    border: `1px solid ${C.green}55`,
    borderRadius: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    boxShadow: GLOW.soft,
  },
  sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: C.white,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
  },
  primaryTag: {
    fontSize: 10,
    fontWeight: 700,
    color: C.green,
    background: `${C.green}1f`,
    border: `1px solid ${C.green}55`,
    borderRadius: 999,
    padding: '3px 9px',
  },
  libraryLink: {
    border: 'none',
    background: 'transparent',
    color: C.green,
    cursor: 'pointer',
    fontSize: 11.5,
    fontWeight: 600,
    fontFamily: FONT,
  },
  stub: { margin: 0, fontSize: 12.5, color: C.muted2 },
  select: {
    padding: 10,
    background: C.panel,
    border: BORDER,
    borderRadius: 10,
    color: C.white,
    fontSize: 14,
    fontFamily: FONT,
  },
  matList: { display: 'flex', flexDirection: 'column', gap: 6 },
  matRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 11px',
    border: BORDER,
    borderRadius: 9,
    background: C.panel,
    color: C.white,
    cursor: 'pointer',
    fontFamily: FONT,
    textAlign: 'left',
  },
  matRowOn: { border: `1px solid ${C.green}66`, background: `${C.green}12` },
  checkbox: {
    width: 18,
    height: 18,
    flexShrink: 0,
    borderRadius: 5,
    border: `1px solid ${C.line2}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    color: C.bg,
    background: 'transparent',
  },
  checkboxOn: { background: C.green, borderColor: C.green, fontWeight: 800 },
  matTitle: { flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  matStage: { fontSize: 10, color: C.muted2, fontWeight: 700, letterSpacing: '0.05em' },

  fieldLabel: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted2, marginTop: 2 },
  input: {
    padding: 10,
    background: C.panel,
    border: BORDER,
    borderRadius: 10,
    color: C.white,
    fontSize: 14,
    fontFamily: FONT,
    boxSizing: 'border-box',
  },
  textarea: {
    padding: 11,
    background: C.panel,
    border: BORDER,
    borderRadius: 10,
    color: C.white,
    fontSize: 14,
    fontFamily: FONT,
    resize: 'none',
    boxSizing: 'border-box',
  },

  footer: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 },
  flex: { flex: 1 },
  sendBtn: {
    padding: '11px 22px',
    border: `1px solid ${C.green}`,
    borderRadius: RADIUS.button,
    background: '#0b0b0e',
    color: C.green,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 800,
    fontFamily: FONT,
    boxShadow: GLOW.soft,
  },
  sentBtn: {
    padding: '11px 22px',
    border: `1px solid ${C.green}66`,
    borderRadius: RADIUS.button,
    background: `${C.green}1f`,
    color: C.green,
    cursor: 'default',
    fontSize: 14,
    fontWeight: 800,
    fontFamily: FONT,
  },
  cancelBtn: {
    padding: '11px 16px',
    border: BORDER,
    borderRadius: RADIUS.button,
    background: 'transparent',
    color: C.muted,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: FONT,
  },
  msg: { fontSize: 13, fontWeight: 600 },
};
