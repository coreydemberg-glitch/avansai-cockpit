'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import type {
  ActionContext,
  ActionItemWithCandidate,
  Candidate,
  Contact,
  EmailTemplate,
  JobDescription,
} from './types';
import {
  saveNotes,
  saveLinkedin,
  listJobDescriptions,
  getEmailTemplate,
  setCandidateArchived,
  setPrepSent,
  closeActionItem,
  saveFeedback,
} from './actions';
import { C, STATUS, FONT, RADIUS, BORDER } from './funnel/tokens';
import FunnelTimeline from './funnel/FunnelTimeline';
import Legend from './funnel/Legend';
import ActionItemsPanel from './funnel/ActionItemsPanel';
import DqColumn from './funnel/DqColumn';
import QuadrantTile from './outreach/QuadrantTile';
import OutboundView from './outbound/OutboundView';
import ReferralView from './referral/ReferralView';
import JobLibrary from './jobs/JobLibrary';

// Which top-level section the cockpit is showing. In-page view switching (no
// routing) — matches the codebase's existing local-state model and keeps the
// sidebar + center reactive to the current selection.
type View = 'dashboard' | 'outbound' | 'referrals';

const trelloUrl = (cardId: string | null) =>
  cardId ? `https://trello.com/c/${cardId}` : null;

// Interview-prep doc options for the email picker (spec §5).
const PREP_OPTIONS: { slug: string; label: string }[] = [
  { slug: 'hr_screen', label: 'HR screen' },
  { slug: 'hiring_manager', label: 'Hiring manager' },
  { slug: 'technical_1', label: 'Technical 1 (system design)' },
  { slug: 'technical_2', label: 'Technical 2 (take-home)' },
  { slug: 'technical_3', label: 'Technical 3 (code review)' },
  { slug: 'leadership', label: 'Leadership' },
];

export default function CockpitBoard({
  candidates,
  jobs: initialJobs,
  actionItems,
  outboundContacts = [],
  referralContacts = [],
  referralCounts = {},
  loadError = null,
}: {
  candidates: Candidate[];
  jobs: JobDescription[];
  actionItems: ActionItemWithCandidate[];
  outboundContacts?: Contact[];
  referralContacts?: Contact[];
  referralCounts?: Record<string, number>;
  loadError?: string | null;
}) {
  const router = useRouter();

  // Top-level section (Dashboard / Outbound / Referrals). Named `section` to
  // avoid colliding with the candidate-list `view` (active/archived) below.
  const [section, setSection] = useState<View>('dashboard');

  // The selected candidate + which funnel flow opened it (null = plain detail).
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [selectedContext, setSelectedContext] = useState<ActionContext | null>(
    null
  );

  const openCandidate = useCallback(
    (c: Candidate, context: ActionContext | null = null) => {
      setSelected(c);
      setSelectedContext(context);
    },
    []
  );

  const openById = useCallback(
    (id: string, context: ActionContext | null) => {
      const c = candidates.find((x) => x.id === id);
      if (c) openCandidate(c, context);
    },
    [candidates, openCandidate]
  );

  // Local copy of the rows so Archive/Restore updates the list instantly.
  const [rows, setRows] = useState<Candidate[]>(candidates);
  useEffect(() => setRows(candidates), [candidates]);
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [, startArchiveTransition] = useTransition();

  const archiveCandidate = (c: Candidate, archived: boolean) => {
    setRows((prev) => prev.map((r) => (r.id === c.id ? { ...r, archived } : r)));
    if (selected?.id === c.id) setSelected(null);
    startArchiveTransition(async () => {
      const res = await setCandidateArchived(c.id, archived);
      if (!res.ok) {
        setRows((prev) =>
          prev.map((r) => (r.id === c.id ? { ...r, archived: !archived } : r))
        );
        // eslint-disable-next-line no-alert
        alert(
          `Couldn't ${archived ? 'archive' : 'restore'} that candidate: ${
            res.error ?? 'unknown error'
          }`
        );
      }
    });
  };

  // Shared job-description list (email picker + parking-lot upload).
  const [jobs, setJobs] = useState<JobDescription[]>(initialJobs);
  const [showAddJob, setShowAddJob] = useState(false);
  const refreshJobs = useCallback(async () => {
    const res = await listJobDescriptions();
    if (res.ok) setJobs(res.jobs);
  }, []);

  // Sidebar: nav items (set the active view) + a utility action (opens a dialog).
  const parkingActions: ParkingAction[] = [
    {
      key: 'dashboard',
      icon: 'ti-layout-grid',
      label: 'Cockpit',
      onClick: () => setSection('dashboard'),
      active: section === 'dashboard',
    },
    {
      key: 'outbound',
      icon: 'ti-send',
      label: 'Outbound',
      onClick: () => setSection('outbound'),
      active: section === 'outbound',
    },
    {
      key: 'referrals',
      icon: 'ti-affiliate',
      label: 'Referrals',
      onClick: () => setSection('referrals'),
      active: section === 'referrals',
    },
    {
      key: 'add-job',
      icon: 'ti-file-plus',
      label: 'Add Job Description',
      onClick: () => setShowAddJob(true),
    },
  ];

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

  const active = rows.filter((c) => !c.archived);
  const archived = rows.filter((c) => c.archived);
  const shown = view === 'active' ? active : archived;

  const inFunnel = active.filter((c) => !c.dq);
  const dqCandidates = active.filter((c) => c.dq);

  // Outreach stats for the dashboard preview tiles.
  const outboundActive = outboundContacts.filter((c) => !c.archived);
  const outboundStats = [
    {
      label: 'Contacts',
      value: outboundActive.filter((c) => c.email_status !== 'missing').length,
    },
    { label: 'Sent', value: outboundActive.filter((c) => c.contacted).length },
    {
      label: 'No email',
      value: outboundActive.filter((c) => c.email_status === 'missing').length,
    },
  ];
  const referralActive = referralContacts.filter((c) => !c.archived);
  const referralStats = [
    { label: 'Contacts', value: referralActive.length },
    {
      label: 'Referrals',
      value: Object.values(referralCounts).reduce((a, b) => a + b, 0),
    },
  ];

  return (
    <div style={styles.shell}>
      <ParkingLot actions={parkingActions} />

      <main style={styles.page}>
        <header style={styles.header}>
          <div style={styles.headerLeft}>
            <h1 style={styles.h1}>Cockpit</h1>
            <span style={styles.kicker}>Recruiter view</span>
          </div>
          <span style={styles.date}>{today}</span>
        </header>

        {loadError && (
          <p style={styles.loadError}>Some data couldn’t be loaded: {loadError}</p>
        )}

        {section === 'dashboard' && (
        <>
        {/* 1 · Funnel timeline */}
        <section style={styles.funnelCard}>
          <div style={styles.funnelHead}>
            <span style={styles.funnelEyebrow}>Candidate funnel</span>
            <Legend />
            <span style={styles.funnelCount}>
              {inFunnel.length} active · {dqCandidates.length} DQ
            </span>
          </div>
          <FunnelTimeline
            candidates={active}
            onSelect={(c) => openCandidate(c, null)}
          />
        </section>

        {/* 2 · Symmetric 2×2 quadrant grid — Outbound · Referral · DQ · (new) */}
        <section style={styles.quadGrid}>
          <div style={styles.quadCell}>
            <QuadrantTile
              eyebrow="Outbound"
              icon="ti-send"
              headline="Cold outreach"
              stats={outboundStats}
              onOpen={() => setSection('outbound')}
            />
          </div>
          <div style={styles.quadCell}>
            <QuadrantTile
              eyebrow="Referrals"
              icon="ti-affiliate"
              headline="Warm network"
              stats={referralStats}
              onOpen={() => setSection('referrals')}
            />
          </div>
          <div style={styles.quadCell}>
            <DqColumn
              candidates={dqCandidates}
              onThankYou={(id) => openById(id, 'thankyou')}
            />
          </div>
          <div style={styles.quadCell}>
            <PlaceholderQuadrant />
          </div>
        </section>

        {/* Secondary: the full candidate list (archive / detail access) */}
        <div style={styles.listHeader}>
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
        </div>

        {shown.length === 0 ? (
          <p style={styles.empty}>
            {view === 'active'
              ? 'No candidates here yet. Add yourself as a member on a Trello card and it will appear.'
              : 'Nothing archived.'}
          </p>
        ) : (
          <div style={styles.list}>
            {shown.map((c) => {
              const accent = c.dq
                ? STATUS.dq
                : c.prep_sent
                  ? STATUS.prepped
                  : STATUS.pending;
              return (
                <article
                  key={c.id}
                  style={{
                    ...styles.card,
                    borderLeft: `3px solid ${accent}`,
                    ...(c.archived ? styles.cardArchived : null),
                  }}
                  onClick={() => openCandidate(c, null)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') openCandidate(c, null);
                  }}
                >
                  <div style={styles.cardMain}>
                    <h2 style={styles.name}>{c.name || 'Untitled'}</h2>
                    <p style={styles.role}>{c.role || 'Role not set'}</p>
                  </div>
                  <div style={styles.cardRight}>
                    <FunnelPill candidate={c} />
                    {view === 'active' ? (
                      <button
                        style={styles.archiveBtn}
                        title="Remove from cockpit (does NOT touch Trello)"
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveCandidate(c, true);
                        }}
                      >
                        Archive
                      </button>
                    ) : (
                      <button
                        style={styles.restoreBtn}
                        title="Bring back into the cockpit"
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveCandidate(c, false);
                        }}
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        </>
        )}

        {section === 'outbound' && (
          <OutboundView
            contacts={outboundContacts}
            onChanged={() => router.refresh()}
          />
        )}

        {section === 'referrals' && (
          <ReferralView
            contacts={referralContacts}
            referralCounts={referralCounts}
            onChanged={() => router.refresh()}
          />
        )}

        {selected && (
          <CandidateModal
            key={selected.id}
            candidate={selected}
            jobs={jobs}
            context={selectedContext}
            onChanged={() => router.refresh()}
            onClose={() => setSelected(null)}
          />
        )}
      </main>

      {/* Right rail: persistent To-Do panel (manual + auto-populated). Roughly
          2× the left nav width so to-dos stay readable down the side. */}
      <aside style={styles.todoSidebar} aria-label="To-do">
        <ActionItemsPanel autoItems={actionItems} onOpen={openById} />
      </aside>

      {showAddJob && (
        <JobLibrary
          onClose={() => setShowAddJob(false)}
          onChanged={refreshJobs}
        />
      )}
    </div>
  );
}

// Bottom-right quadrant placeholder — a styled "next feature" slot that keeps the
// 2×2 grid symmetric until the fourth surface ships.
function PlaceholderQuadrant() {
  return (
    <section style={styles.placeholder}>
      <div style={styles.placeholderHead}>
        <span style={styles.placeholderEyebrow}>
          <i className="ti ti-sparkles" aria-hidden /> Coming soon
        </span>
      </div>
      <div style={styles.placeholderBody}>
        <i className="ti ti-layout-grid-add" style={styles.placeholderIcon} aria-hidden />
        <p style={styles.placeholderText}>Next workspace lands here.</p>
      </div>
    </section>
  );
}

type ParkingAction = {
  key: string;
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
};

function ParkingLot({ actions }: { actions: ParkingAction[] }) {
  return (
    <aside style={styles.parkingLot} aria-label="Navigation">
      <div style={styles.parkingBrand} aria-hidden />
      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          style={a.active ? styles.parkingBtnActive : styles.parkingBtn}
          onClick={a.onClick}
          title={a.label}
          aria-current={a.active ? 'page' : undefined}
        >
          <i
            className={`ti ${a.icon}`}
            style={a.active ? styles.parkingIconActive : styles.parkingIcon}
            aria-hidden
          />
          <span style={a.active ? styles.parkingLabelActive : styles.parkingLabel}>
            {a.label}
          </span>
        </button>
      ))}
    </aside>
  );
}

// Status pill driven by funnel state (replaces the old free-text status pill).
function FunnelPill({ candidate }: { candidate: Candidate }) {
  const { label, color } = candidate.dq
    ? { label: 'DQ', color: STATUS.dq }
    : candidate.prep_sent
      ? { label: 'Advancing', color: STATUS.prepped }
      : candidate.pending
        ? { label: 'Pending', color: STATUS.pending }
        : { label: `Stage ${candidate.funnel_stage ?? 1}`, color: C.blue };
  return (
    <span style={{ ...styles.pill, color, background: `${color}1f` }}>{label}</span>
  );
}

type EmailMode = 'follow_up' | 'prep' | 'thankyou';

function CandidateModal({
  candidate,
  jobs,
  context,
  onChanged,
  onClose,
}: {
  candidate: Candidate;
  jobs: JobDescription[];
  context: ActionContext | null;
  onChanged: () => void;
  onClose: () => void;
}) {
  // The funnel context decides the opening tab + email mode.
  type Tab = 'email' | 'notes' | 'feedback' | 'resume' | 'linkedin';
  const initialTab: Tab =
    context === 'feedback' ? 'feedback' : context ? 'email' : 'notes';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const emailMode: EmailMode =
    context === 'prep' ? 'prep' : context === 'thankyou' ? 'thankyou' : 'follow_up';

  // ── Notes: debounced auto-save + a local draft that survives close/reopen ──
  const draftKey = `cockpit:notes-draft:${candidate.id}`;
  const [notes, setNotes] = useState(candidate.notes ?? '');
  type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [isPending, startTransition] = useTransition();
  const [cleaned, setCleaned] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanErr, setCleanErr] = useState<string | null>(null);
  const lastSavedRef = useRef(candidate.notes ?? '');
  const notesHydrated = useRef(false);

  // Restore an unsaved local draft when the card opens, so edits the recruiter
  // didn't explicitly save still reappear on reopen.
  useEffect(() => {
    try {
      const draft = window.localStorage.getItem(draftKey);
      if (draft != null && draft !== (candidate.notes ?? '')) setNotes(draft);
    } catch {
      /* localStorage unavailable — fall back to the server value */
    }
    notesHydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save 2.5s after the last keystroke. The draft is mirrored to
  // localStorage on every change first, so closing mid-edit never loses work.
  useEffect(() => {
    if (!notesHydrated.current) return; // skip the initial restore pass
    try {
      window.localStorage.setItem(draftKey, notes);
    } catch {
      /* ignore */
    }
    if (notes === lastSavedRef.current) return;
    setSaveStatus('saving');
    const t = setTimeout(async () => {
      const res = await saveNotes(candidate.id, notes);
      if (res.ok) {
        lastSavedRef.current = notes;
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

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

  // Flush the current notes immediately (the debounce also saves on its own).
  const handleSaveNow = () => {
    setSaveStatus('saving');
    startTransition(async () => {
      const res = await saveNotes(candidate.id, notes);
      if (res.ok) {
        lastSavedRef.current = notes;
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
    });
  };

  // Promote the AI-cleaned version to BE the notes, so the raw text doesn't
  // linger alongside it (no duplication). Auto-save then persists the result.
  const applyCleaned = () => {
    if (cleaned == null) return;
    setNotes(cleaned);
    setCleaned(null);
  };

  // ── Interview feedback (clean-notes mode:'feedback' → save to file) ──
  const [rawFeedback, setRawFeedback] = useState('');
  const [structuredFb, setStructuredFb] = useState<string | null>(null);
  const [fbBusy, setFbBusy] = useState(false);
  const [fbMsg, setFbMsg] = useState<string | null>(null);

  const handleStructureFeedback = async () => {
    setFbMsg(null);
    setFbBusy(true);
    try {
      const res = await fetch('/api/clean-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: rawFeedback, mode: 'feedback' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to structure feedback');
      setStructuredFb(data.structured);
    } catch (e) {
      setFbMsg(e instanceof Error ? e.message : 'Failed to structure feedback');
    } finally {
      setFbBusy(false);
    }
  };

  const handleSaveFeedback = async () => {
    if (!structuredFb) return;
    setFbMsg(null);
    setFbBusy(true);
    try {
      const res = await saveFeedback(candidate.id, structuredFb);
      if (!res.ok) throw new Error(res.error || 'Save failed');
      await closeActionItem(candidate.id, 'feedback');
      setFbMsg('Saved to candidate file ✓');
      onChanged();
    } catch (e) {
      setFbMsg(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setFbBusy(false);
    }
  };

  // ── Email (follow-up / prep / thank-you), all approve-before-send ──
  const [emailTo, setEmailTo] = useState(candidate.email ?? '');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailGreeting, setEmailGreeting] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [prepSlug, setPrepSlug] = useState(PREP_OPTIONS[0].slug);
  const [sending, setSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  // Send-once guard: a given compose can fire at most one real email, so a
  // double-click (or an impatient re-click) can never send a duplicate.
  const [sentOnce, setSentOnce] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const prefillStarted = useRef(false);
  // Set once the résumé parser fills the greeting, so template prefill defers to it.
  const emailFromResume = useRef(false);

  // Prefill the email panel once, based on the mode. follow-up/thankyou pull a DB
  // template (editable without code); prep falls back to a per-stage default if no
  // prep_<slug> template exists. Greeting/body [name] tokens are dropped (MVP).
  // Run once on mount (not when the email tab is first shown) so the template is
  // already in place before a résumé upload can fill the greeting — otherwise a
  // late-resolving template fetch could clobber the parsed "Hi {name},".
  useEffect(() => {
    if (prefillStarted.current) return;
    prefillStarted.current = true;
    const fill = (s: string) => s.split('[name]').join('');
    // Don't overwrite a greeting the résumé parser already populated.
    const setGreeting = (g: string) => {
      if (!emailFromResume.current) setEmailGreeting(g);
    };

    let cancelled = false;
    setTemplateLoading(true);
    const key =
      emailMode === 'thankyou'
        ? 'dq_thank_you'
        : emailMode === 'prep'
          ? `prep_${prepSlug}`
          : 'candidate_follow_up';

    getEmailTemplate(key)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.template) {
          const t: EmailTemplate = res.template;
          setEmailSubject(t.subject);
          setGreeting(fill(t.greeting));
          setEmailBody(fill(t.body));
        } else {
          const d = defaultEmail(emailMode, candidate, prepSlug);
          setEmailSubject(d.subject);
          setGreeting(d.greeting);
          setEmailBody(d.body);
        }
      })
      .catch(() => {
        const d = defaultEmail(emailMode, candidate, prepSlug);
        setEmailSubject(d.subject);
        setGreeting(d.greeting);
        setEmailBody(d.body);
      })
      .finally(() => {
        if (!cancelled) setTemplateLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-apply the prep default when the recruiter switches prep doc (prep mode).
  const handlePrepChange = (slug: string) => {
    setPrepSlug(slug);
    if (emailMode !== 'prep') return;
    getEmailTemplate(`prep_${slug}`).then((res) => {
      if (res.ok && res.template) {
        setEmailSubject(res.template.subject);
        setEmailGreeting(res.template.greeting.split('[name]').join(''));
        setEmailBody(res.template.body.split('[name]').join(''));
      } else {
        const d = defaultEmail('prep', candidate, slug);
        setEmailSubject(d.subject);
        setEmailGreeting(d.greeting);
        setEmailBody(d.body);
      }
    });
  };

  const handleSend = async () => {
    if (sending || sentOnce) return; // never fire a duplicate email
    setEmailMsg(null);
    setSending(true);
    try {
      const job = jobs.find((j) => j.id === selectedJobId);
      const attachment = job
        ? { path: job.file_path, filename: `${job.title}.pdf` }
        : undefined;
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailTo,
          subject: emailSubject,
          body: `${emailGreeting}\n\n${emailBody}`,
          attachment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');

      // Post-send funnel side effects (spec §5): prep flips the segment green +
      // closes the prep to-do; thank-you closes the DQ to-do.
      if (emailMode === 'prep') {
        await setPrepSent(candidate.id, true);
        await closeActionItem(candidate.id, 'prep');
        onChanged();
      } else if (emailMode === 'thankyou') {
        await closeActionItem(candidate.id, 'thankyou');
        onChanged();
      }
      setSentOnce(true);
      setEmailMsg('Sent ✓');
    } catch (e) {
      setEmailMsg(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  // ── Resume upload → auto-parse email + first name into the email panel ──
  const [resumeUrl, setResumeUrl] = useState<string | null>(candidate.resume ?? null);
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

      // Parsed contact (PDF résumés only) pre-fills the email panel so the
      // recruiter doesn't retype it: email → To, first name → "Hi {name},".
      const parsed = data.parsed as
        | { email: string | null; firstName: string | null }
        | undefined;
      const hits: string[] = [];
      if (parsed?.email && !emailTo.trim()) {
        setEmailTo(parsed.email);
        hits.push('email');
      }
      if (parsed?.firstName) {
        setEmailGreeting(`Hi ${parsed.firstName},`);
        emailFromResume.current = true;
        hits.push('name');
      }
      setResumeMsg(hits.length ? `Uploaded ✓ · parsed ${hits.join(' + ')}` : 'Uploaded ✓');
    } catch (err) {
      setResumeMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ── LinkedIn (unchanged) ──
  const [linkedin, setLinkedin] = useState(candidate.linkedin_url ?? '');
  const [savedLinkedin, setSavedLinkedin] = useState(candidate.linkedin_url ?? '');
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

  const resumeName = resumeUrl
    ? decodeURIComponent(resumeUrl.split('/').pop() || 'resume').replace(/^\d+-/, '')
    : null;
  const tUrl = trelloUrl(candidate.trello_card_id);

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
          <Field label="Status" value={<FunnelPill candidate={candidate} />} />
          {tUrl && (
            <Field
              label="Trello"
              value={
                <a href={tUrl} target="_blank" rel="noreferrer" style={styles.link}>
                  Card ↗
                </a>
              }
            />
          )}
        </dl>

        <div style={styles.tabBar}>
          {(
            [
              { key: 'email', icon: 'ti-mail', label: 'Email' },
              { key: 'notes', icon: 'ti-notes', label: 'Notes' },
              { key: 'resume', icon: 'ti-file-cv', label: 'Resume' },
              { key: 'linkedin', icon: 'ti-brand-linkedin', label: 'LinkedIn' },
              { key: 'feedback', icon: 'ti-message-2', label: 'Feedback' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={activeTab === t.key ? styles.tabActive : styles.tab}
            >
              <i className={`ti ${t.icon}`} aria-hidden /> {t.label}
            </button>
          ))}
        </div>

        <div style={styles.tabContent}>
          {activeTab === 'notes' && (
            <>
              <div style={styles.notesLabelRow}>
                <label style={styles.label}>Notes</label>
                <SaveIndicator status={saveStatus} />
              </div>
              <textarea
                style={styles.textarea}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this candidate… (auto-saves as you type)"
                rows={6}
              />
              <div style={styles.saveRow}>
                <button
                  style={styles.secondaryBtn}
                  onClick={handleClean}
                  disabled={cleaning || notes.trim().length === 0}
                >
                  {cleaning ? 'Cleaning…' : cleaned ? 'Re-clean notes' : 'Clean notes'}
                </button>
                <button
                  style={styles.secondaryBtn}
                  onClick={handleSaveNow}
                  disabled={isPending || saveStatus === 'saving'}
                >
                  Save now
                </button>
              </div>
              {cleanErr && <p style={styles.errMsg}>{cleanErr}</p>}
              {cleaned !== null && (
                <div style={styles.cleanedBox}>
                  <div style={styles.cleanedHead}>
                    <span style={styles.cleanedLabel}>Structured (AI cleanup)</span>
                    <button style={styles.primaryBtnSm} onClick={applyCleaned}>
                      Use cleaned — replace notes
                    </button>
                  </div>
                  <div style={styles.cleanedText}>{cleaned}</div>
                </div>
              )}
            </>
          )}

          {activeTab === 'feedback' && (
            <div style={styles.sectionCol}>
              <label style={styles.label}>Raw interview notes</label>
              <textarea
                style={styles.textarea}
                rows={6}
                value={rawFeedback}
                onChange={(e) => setRawFeedback(e.target.value)}
                placeholder="Paste raw interview notes — they’ll be structured and saved to the candidate’s file."
              />
              <div style={styles.saveRow}>
                <button
                  style={styles.secondaryBtn}
                  onClick={handleStructureFeedback}
                  disabled={fbBusy || rawFeedback.trim().length === 0}
                >
                  {fbBusy && !structuredFb ? 'Structuring…' : 'Structure feedback'}
                </button>
                {structuredFb && (
                  <button
                    style={styles.primaryBtn}
                    onClick={handleSaveFeedback}
                    disabled={fbBusy}
                  >
                    {fbBusy ? 'Saving…' : 'Save to file'}
                  </button>
                )}
                {fbMsg && (
                  <span
                    style={{
                      ...styles.saveMsg,
                      color: fbMsg.includes('✓') ? C.green : '#f87171',
                    }}
                  >
                    {fbMsg}
                  </span>
                )}
              </div>
              {structuredFb && (
                <div style={styles.cleanedBox}>
                  <div style={styles.cleanedLabel}>Structured feedback</div>
                  <div style={styles.cleanedText}>{structuredFb}</div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'email' && (
            <div style={styles.sectionCol}>
              {context && (
                <div style={styles.contextChip}>
                  {emailMode === 'prep'
                    ? 'Interview prep email'
                    : emailMode === 'thankyou'
                      ? 'DQ thank-you email'
                      : 'Follow-up email'}
                </div>
              )}
              {templateLoading && <span style={styles.actionMsg}>Loading template…</span>}
              {emailMode === 'prep' && (
                <>
                  <label style={styles.label}>Prep doc</label>
                  <select
                    style={styles.input}
                    value={prepSlug}
                    onChange={(e) => handlePrepChange(e.target.value)}
                  >
                    {PREP_OPTIONS.map((o) => (
                      <option key={o.slug} value={o.slug}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
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
              <label style={styles.label}>Greeting</label>
              <input
                style={styles.input}
                value={emailGreeting}
                onChange={(e) => setEmailGreeting(e.target.value)}
                placeholder="Hi [name],"
              />
              <label style={styles.label}>Body</label>
              <textarea
                style={styles.textarea}
                rows={11}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Message…"
              />
              <label style={styles.label}>
                {emailMode === 'thankyou'
                  ? 'Attachment (TBD — pick if provided)'
                  : 'Attach document'}
              </label>
              <select
                style={styles.input}
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
              >
                <option value="">No attachment</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
              <div style={styles.saveRow}>
                <button
                  style={sentOnce ? styles.sentBtn : styles.primaryBtn}
                  onClick={handleSend}
                  disabled={sending || sentOnce || !emailTo}
                >
                  {sentOnce ? 'Sent ✓' : sending ? 'Sending…' : 'Send'}
                </button>
                {emailMsg && (
                  <span
                    style={{
                      ...styles.saveMsg,
                      color: emailMsg.startsWith('Sent') ? C.green : '#f87171',
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
                  <a href={resumeUrl} target="_blank" rel="noreferrer" style={styles.link}>
                    {resumeName}
                  </a>
                </p>
              )}
              {resumeMsg && (
                <span
                  style={{
                    ...styles.saveMsg,
                    color: resumeMsg.startsWith('Uploaded') ? C.green : '#f87171',
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
                    // Guard against a stored javascript:/data: URL executing on click.
                    href={/^https?:\/\//i.test(savedLinkedin) ? savedLinkedin : '#'}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.linkedinBtn}
                  >
                    <i className="ti ti-brand-linkedin" aria-hidden /> Open LinkedIn profile
                    <span aria-hidden> ↗</span>
                  </a>
                  <button style={styles.linkText} onClick={() => setSavedLinkedin('')}>
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
                          color: linkedinMsg.startsWith('Error') ? '#f87171' : C.green,
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
      </div>
    </div>
  );
}

// Sensible per-mode defaults used when no DB template exists. Recruiter reviews
// and edits before sending (approve-before-send, spec §5). Attachments TBD.
function defaultEmail(
  mode: EmailMode,
  candidate: Candidate,
  prepSlug: string
): { subject: string; greeting: string; body: string } {
  const role = candidate.role || 'the role';
  if (mode === 'prep') {
    const label =
      PREP_OPTIONS.find((o) => o.slug === prepSlug)?.label ?? 'your interview';
    return {
      subject: `Interview prep — ${role}`,
      greeting: 'Hi,',
      body: `Ahead of your ${label.toLowerCase()} interview, here are a few notes to help you prepare.\n\nLet me know if you have any questions.\n\nThanks,\nCorey`,
    };
  }
  if (mode === 'thankyou') {
    return {
      subject: 'Thank you from Avansai',
      greeting: 'Hi,',
      body: `Thank you for taking the time to interview for ${role}. After careful consideration we won’t be moving forward at this stage, but we were genuinely impressed and would love to stay in touch for future opportunities.\n\nAll the best,\nCorey`,
    };
  }
  return {
    subject: 'Follow-up',
    greeting: 'Hi,',
    body: 'Following up on our conversation.\n\nThanks,\nCorey',
  };
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <dt style={styles.fieldLabel}>{label}</dt>
      <dd style={styles.fieldValue}>{value}</dd>
    </div>
  );
}

// Inline auto-save status for the notes panel (no buttons-as-text).
function SaveIndicator({
  status,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error';
}) {
  if (status === 'idle') return null;
  const map = {
    saving: { dot: C.amber, text: 'Saving…' },
    saved: { dot: C.green, text: 'All changes saved' },
    error: { dot: '#f87171', text: 'Save failed — retrying on next edit' },
  } as const;
  const s = map[status];
  return (
    <span style={styles.saveIndicator}>
      <span style={{ ...styles.saveDot, background: s.dot }} aria-hidden />
      {s.text}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: { display: 'flex', alignItems: 'stretch', minHeight: '100vh', background: C.bg },
  page: {
    flex: 1,
    minWidth: 0,
    minHeight: '100vh',
    padding: 40,
    fontFamily: FONT,
    maxWidth: 1240,
    margin: '0 auto',
    background: C.bg,
    color: C.white,
    fontWeight: 400,
  },
  loadError: {
    marginTop: 16,
    fontSize: 12,
    color: C.amber,
    background: 'rgba(251, 191, 36, 0.10)',
    border: `1px solid rgba(251, 191, 36, 0.30)`,
    borderRadius: 10,
    padding: '8px 12px',
  },

  parkingLot: {
    position: 'sticky',
    top: 0,
    alignSelf: 'flex-start',
    height: '100vh',
    width: 92,
    flexShrink: 0,
    background: C.panel2,
    borderRight: BORDER,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '16px 8px',
    boxSizing: 'border-box',
    overflowY: 'auto',
  },
  parkingBrand: { width: 26, height: 26, borderRadius: 8, background: C.green, marginBottom: 6, flexShrink: 0 },
  parkingBtn: {
    width: '100%',
    border: BORDER,
    borderRadius: 12,
    background: C.panel,
    color: C.white,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 5,
    padding: '10px 4px',
    fontFamily: FONT,
  },
  parkingBtnActive: {
    width: '100%',
    border: `1px solid ${C.green}66`,
    borderRadius: 12,
    background: `${C.green}1f`,
    color: C.green,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 5,
    padding: '10px 4px',
    fontFamily: FONT,
  },
  parkingIcon: { fontSize: 20, lineHeight: 1, color: C.white },
  parkingIconActive: { fontSize: 20, lineHeight: 1, color: C.green },
  parkingLabel: { fontSize: 9.5, lineHeight: 1.2, textAlign: 'center', color: C.muted, fontWeight: 400 },
  parkingLabelActive: { fontSize: 9.5, lineHeight: 1.2, textAlign: 'center', color: C.green, fontWeight: 600 },

  header: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  headerLeft: { display: 'flex', alignItems: 'baseline', gap: 12 },
  h1: { margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: C.white },
  kicker: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, fontWeight: 500 },
  date: { fontSize: 13, color: C.muted, fontWeight: 400 },

  funnelCard: {
    marginTop: 28,
    background: C.panel,
    // Higher-contrast border + soft shadow so the funnel "pops" like a card.
    border: `1px solid ${C.line2}`,
    borderRadius: RADIUS.card,
    padding: '18px 24px 16px',
    boxShadow: '0 1px 0 rgba(255,255,255,0.03), 0 12px 30px -18px rgba(0,0,0,0.6)',
  },
  funnelHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    paddingBottom: 14,
    borderBottom: BORDER,
    marginBottom: 8,
  },
  funnelEyebrow: {
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: C.green,
    fontWeight: 800,
  },
  funnelCount: { fontSize: 12, color: C.muted2, whiteSpace: 'nowrap' },
  panelsRow: { marginTop: 18, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' },

  // Symmetric 2×2 quadrant grid below the funnel — all four cells equal size.
  quadGrid: {
    marginTop: 18,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  quadCell: { display: 'flex', minHeight: 196 },

  // Persistent right rail (To-Do). ~2× the 92px left nav for readability.
  todoSidebar: {
    position: 'sticky',
    top: 0,
    alignSelf: 'flex-start',
    height: '100vh',
    width: 230,
    flexShrink: 0,
    background: C.panel2,
    borderLeft: BORDER,
    padding: '16px 14px',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },

  // Bottom-right placeholder quadrant.
  placeholder: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: `repeating-linear-gradient(135deg, ${C.panel2}, ${C.panel2} 10px, #20202900 10px, #20202900 20px)`,
    border: `1px dashed ${C.line2}`,
    borderRadius: 12,
    padding: '14px 16px',
    fontFamily: FONT,
  },
  placeholderHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  placeholderEyebrow: {
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: C.muted2,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  placeholderBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    color: C.muted2,
  },
  placeholderIcon: { fontSize: 28, color: C.line2 },
  placeholderText: { margin: 0, fontSize: 12, color: C.muted2 },

  empty: { marginTop: 20, color: C.muted, fontSize: 14 },
  listHeader: { marginTop: 34, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' },
  viewToggle: { display: 'flex', gap: 6 },
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
  list: { marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    background: C.panel,
    border: BORDER,
    borderRadius: RADIUS.card,
    padding: '14px 18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    cursor: 'pointer',
  },
  cardMain: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  cardRight: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  cardArchived: { opacity: 0.55 },
  archiveBtn: {
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
  restoreBtn: {
    padding: '5px 10px',
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
  name: { margin: 0, fontSize: 14, fontWeight: 600, color: C.white, letterSpacing: '-0.01em' },
  role: { margin: 0, color: C.muted, fontSize: 12, fontWeight: 400 },
  pill: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderRadius: 999,
    padding: '4px 10px',
    whiteSpace: 'nowrap',
  },
  link: { color: C.green, textDecoration: 'none' },

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
    maxWidth: 560,
    maxHeight: '90vh',
    overflowY: 'auto',
    color: C.white,
    fontFamily: FONT,
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: C.white },
  modalSub: { margin: '4px 0 0', color: C.muted, fontSize: 13 },
  closeBtn: { border: 'none', background: 'transparent', fontSize: 16, cursor: 'pointer', color: C.muted, lineHeight: 1, padding: 4 },
  meta: { display: 'flex', flexWrap: 'wrap', gap: 20, margin: '18px 0' },
  field: { margin: 0 },
  fieldLabel: { margin: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted2, fontWeight: 500 },
  fieldValue: { margin: '4px 0 0', fontSize: 13, color: C.white },
  label: { fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted2 },
  contextChip: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: 700,
    color: C.blue,
    background: `${C.blue}1f`,
    border: `1px solid ${C.blue}55`,
    borderRadius: RADIUS.chip,
    padding: '4px 10px',
    marginBottom: 4,
  },
  textarea: {
    width: '100%',
    marginTop: 6,
    padding: 11,
    background: C.panel2,
    border: BORDER,
    borderRadius: 10,
    fontFamily: 'inherit',
    fontSize: 14,
    color: C.white,
    // Locked size — no drag-resize handle, so the card never jumps around.
    resize: 'none',
    boxSizing: 'border-box',
  },
  saveRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' },
  notesLabelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  saveIndicator: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.muted },
  saveDot: { width: 7, height: 7, borderRadius: 999, flexShrink: 0 },
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
  primaryBtnSm: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: RADIUS.button,
    background: C.green,
    color: C.bg,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  sentBtn: {
    padding: '9px 18px',
    border: `1px solid ${C.green}66`,
    borderRadius: RADIUS.button,
    background: `${C.green}1f`,
    color: C.green,
    cursor: 'default',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  secondaryBtn: {
    padding: '9px 16px',
    border: BORDER,
    borderRadius: RADIUS.button,
    background: 'transparent',
    color: C.white,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'inherit',
  },
  saveMsg: { fontSize: 13 },
  errMsg: { marginTop: 12, fontSize: 13, color: '#f87171' },
  cleanedBox: { marginTop: 16, border: BORDER, borderRadius: 10, background: C.panel2, padding: 14 },
  cleanedHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  cleanedLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted2 },
  cleanedText: { fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', color: C.white },
  actionMsg: { marginTop: 4, fontSize: 13, color: C.muted },
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
  tabBar: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 18 },
  tab: {
    padding: '9px 6px',
    border: BORDER,
    borderRadius: 10,
    background: C.panel2,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'inherit',
    color: C.muted,
    textAlign: 'center',
  },
  tabActive: {
    padding: '9px 6px',
    border: `1px solid ${C.green}66`,
    borderRadius: 10,
    background: `${C.green}1f`,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: C.green,
    textAlign: 'center',
  },
  // Fixed min-height so switching tabs doesn't make the card jump/shift.
  tabContent: { minHeight: 340 },
  sectionCol: { display: 'flex', flexDirection: 'column', gap: 6 },
  // Direct LinkedIn link, brand blue, opens the profile straight away (no menu).
  linkedinBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    padding: '9px 16px',
    borderRadius: RADIUS.button,
    background: C.linkedin,
    color: '#ffffff',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 700,
  },
  linkText: {
    alignSelf: 'flex-start',
    marginTop: 10,
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: C.muted,
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'inherit',
    textDecoration: 'underline',
  },
};
