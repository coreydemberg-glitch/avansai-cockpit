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
  saveLinkedin,
  saveBullhornId,
  listJobDescriptions,
  getEmailTemplate,
  setCandidateArchived,
  setPrepSent,
  setFunnelStage,
  closeActionItem,
  saveFeedback,
  removeResume,
} from './actions';
import { C, STATUS, FONT, RADIUS, BORDER } from './funnel/tokens';
import StageFunnel from './funnel/StageFunnel';
import PrepModal from './funnel/PrepModal';
import { sliderValue, snapHalf, decompose, isHalfStep } from './funnel/stage';
import Legend from './funnel/Legend';
import ActionItemsPanel from './funnel/ActionItemsPanel';
import DqColumn from './funnel/DqColumn';
import QuadrantTile from './outreach/QuadrantTile';
import OutboundView from './outbound/OutboundView';
import ReferralView from './referral/ReferralView';
import JobLibrary from './jobs/JobLibrary';
import PrepLibrary from './jobs/PrepLibrary';
import SourcingView from './sourcing/SourcingView';
import CandidatesView from './candidates/CandidatesView';
import CandidatesTodoPanel from './candidates/CandidatesTodoPanel';
import CandidateNotesStudio from './candidates/CandidateNotesStudio';

// Bullhorn deep-link for a candidate's record (East swimlane / cls43). Null
// when no bullhorn_id is linked yet (the card then signals "create a profile").
const BULLHORN_BASE =
  'https://cls43.bullhornstaffing.com/BullhornStaffing/OpenWindow.cfm?Entity=Candidate&id=';
// Bullhorn home — where the one-button bridge lands when no record id is linked
// (recruiter pastes the copied summary into a new/searched candidate).
const BULLHORN_HOME = 'https://cls43.bullhornstaffing.com/BullhornStaffing/';
const bullhornUrl = (id: string | null | undefined) =>
  id && id.trim() ? `${BULLHORN_BASE}${encodeURIComponent(id.trim())}` : null;

// Tell a résumé image apart from a PDF by its stored URL so the preview embeds
// the right element. Defaults to the PDF embed for anything non-image.
const isResumeImage = (url: string) =>
  /\.(png|jpe?g|gif|webp|bmp|svg)(?:$|[?#])/i.test(url);

// Which top-level section the cockpit is showing. In-page view switching (no
// routing) — matches the codebase's existing local-state model and keeps the
// sidebar + center reactive to the current selection.
type View = 'dashboard' | 'candidates' | 'outbound' | 'referrals' | 'sourcing';

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

  // Top-level section (Dashboard / Candidates / Outbound / Referrals / Sourcing).
  const [section, setSection] = useState<View>('dashboard');

  // Bumped whenever a candidate bar raises a to-do, so the hub's scoped to-do
  // rail refetches. Kept here (not in the hub) because the rail lives in the
  // shell alongside the home master To-Do.
  const [todoRefresh, setTodoRefresh] = useState(0);
  const bumpTodos = useCallback(() => setTodoRefresh((n) => n + 1), []);

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

  // Local copy of the rows so Archive/Restore updates the list instantly. The
  // Candidates hub renders the bars from these same rows; the home funnel/DQ
  // quadrant read them too, so a slider move stays in sync across both surfaces.
  const [rows, setRows] = useState<Candidate[]>(candidates);
  useEffect(() => setRows(candidates), [candidates]);
  // Keep the open modal's candidate pointed at the freshest row after a
  // router.refresh() (e.g. a résumé upload writes candidates.resume/email) so the
  // modal + notes studio pick up the new résumé without a close-reopen. Matches
  // by id; no-ops when nothing is open. setSelected doesn't touch `rows`, so this
  // can't loop.
  useEffect(() => {
    setSelected((cur) => (cur ? rows.find((r) => r.id === cur.id) ?? cur : cur));
  }, [rows]);
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
  const [showPrepLib, setShowPrepLib] = useState(false);
  const refreshJobs = useCallback(async () => {
    const res = await listJobDescriptions();
    if (res.ok) setJobs(res.jobs);
  }, []);

  // ── Slider → stage writes (slider build §3/§4) ─────────────────────────────
  // The prep modal auto-pops when a slider lands on a fresh half-step.
  const [prepFor, setPrepFor] = useState<{
    candidate: Candidate;
    stage: number;
    value: number;
  } | null>(null);

  // Patch a candidate in the local list (optimistic; keeps the funnel counts +
  // segment lasers in sync the instant a slider moves).
  const patchCandidate = useCallback((id: string, patch: Partial<Candidate>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  // Debounced persistence, keyed per candidate, so rapid nudges coalesce into one
  // write (spec §3: "debounced to avoid write spam").
  const writeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const persistStage = useCallback(
    (id: string, state: { funnel_stage: number; pending: boolean; prep_sent: boolean }) => {
      clearTimeout(writeTimers.current[id]);
      writeTimers.current[id] = setTimeout(() => {
        setFunnelStage(id, state);
      }, 400);
    },
    []
  );

  // Commit a slider release: decompose the snapped value, decide prep_sent + whether
  // to pop the prep modal, update the row optimistically, and persist (debounced).
  const commitStage = useCallback(
    (candidate: Candidate, value: number) => {
      const snapped = snapHalf(value);
      const { funnel_stage, pending } = decompose(snapped);
      const onHalf = isHalfStep(snapped);

      // Re-releasing on the SAME already-prepped half-step keeps prep (no re-pop).
      const prev = sliderValue(candidate);
      const stayedPrepped =
        onHalf && prev === snapped && !!candidate.prep_sent;

      const prepSent = onHalf ? (stayedPrepped ? true : false) : false;
      const patch: Partial<Candidate> = { funnel_stage, pending, prep_sent: prepSent };
      patchCandidate(candidate.id, patch);
      persistStage(candidate.id, { funnel_stage, pending, prep_sent: prepSent });

      // Landing fresh on a half-step → auto-trigger the Prep modal for that round.
      if (onHalf && !stayedPrepped) {
        setPrepFor({ candidate: { ...candidate, ...patch }, stage: funnel_stage, value: snapped });
      }
    },
    [patchCandidate, persistStage]
  );

  // Prep was sent → lock the half-step into a green laser and refresh server data.
  const handlePrepSent = useCallback(() => {
    if (prepFor) patchCandidate(prepFor.candidate.id, { prep_sent: true });
    router.refresh();
  }, [prepFor, patchCandidate, router]);

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
      key: 'sourcing',
      icon: 'ti-user-search',
      label: 'Sourcing',
      onClick: () => setSection('sourcing'),
      active: section === 'sourcing',
    },
    {
      key: 'candidates',
      icon: 'ti-users',
      label: 'Candidates',
      onClick: () => setSection('candidates'),
      active: section === 'candidates',
    },
    {
      key: 'add-job',
      icon: 'ti-file-plus',
      label: 'Add Job Description',
      onClick: () => setShowAddJob(true),
    },
    {
      key: 'prep-docs',
      icon: 'ti-files',
      label: 'Prep Documents',
      onClick: () => setShowPrepLib(true),
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
          <StageFunnel candidates={active} />
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
            <QuadrantTile
              eyebrow="Sourcing"
              icon="ti-user-search"
              headline="Boolean building & market mapping"
              stats={[]}
              onOpen={() => setSection('sourcing')}
            />
          </div>
        </section>

        {/* The full candidate list now lives in the Candidates hub (left nav).
            Home keeps only the funnel timeline + the quadrant grid. */}
        </>
        )}

        {section === 'candidates' && (
          <CandidatesView
            candidates={rows}
            onCommit={commitStage}
            onOpenDetail={(cand) => openCandidate(cand, null)}
            onArchive={archiveCandidate}
            onTodoChanged={bumpTodos}
          />
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

        {section === 'sourcing' && <SourcingView />}

        {selected && (
          <CandidateModal
            key={selected.id}
            candidate={selected}
            jobs={jobs}
            context={selectedContext}
            onChanged={() => router.refresh()}
            onTodoRaised={bumpTodos}
            onClose={() => {
              setSelected(null);
              // Refetch rows so a quick reopen seeds from the just-saved notes
              // (the studio's localStorage draft covers the in-flight window).
              router.refresh();
            }}
          />
        )}
      </main>

      {/* Right rail: To-Do panel. Scoped per section so the lists never bleed —
          the cockpit-home master To-Do (manual + auto) shows ONLY on the
          dashboard; the Candidates hub shows ONLY its own candidate to-dos;
          Outbound/Referrals/Sourcing show no rail. Roughly 2× the left nav width
          so to-dos stay readable down the side. */}
      {(section === 'dashboard' || section === 'candidates') && (
        <aside style={styles.todoSidebar} aria-label="To-do">
          {section === 'dashboard' ? (
            <ActionItemsPanel autoItems={actionItems} onOpen={openById} />
          ) : (
            <CandidatesTodoPanel
              refreshKey={todoRefresh}
              candidates={rows}
              onOpenCandidate={(id) => openById(id, null)}
            />
          )}
        </aside>
      )}

      {showAddJob && (
        <JobLibrary
          onClose={() => setShowAddJob(false)}
          onChanged={refreshJobs}
        />
      )}

      {showPrepLib && <PrepLibrary onClose={() => setShowPrepLib(false)} />}

      {prepFor && (
        <PrepModal
          key={`${prepFor.candidate.id}-${prepFor.value}`}
          candidate={prepFor.candidate}
          stage={prepFor.stage}
          value={prepFor.value}
          jobs={jobs}
          onSent={handlePrepSent}
          onClose={() => setPrepFor(null)}
          onOpenLibrary={() => setShowPrepLib(true)}
        />
      )}
    </div>
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
  onTodoRaised,
  onClose,
}: {
  candidate: Candidate;
  jobs: JobDescription[];
  context: ActionContext | null;
  onChanged: () => void;
  // Bump the hub To-Do rail when the notes studio raises a to-do.
  onTodoRaised: () => void;
  onClose: () => void;
}) {
  // The funnel context decides the opening tab + email mode. Notes (the live
  // studio) is the default when the card is opened plainly from the hub.
  type Tab = 'email' | 'notes' | 'feedback' | 'resume' | 'linkedin' | 'bullhorn';
  const initialTab: Tab =
    context === 'feedback' ? 'feedback' : context ? 'email' : 'notes';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const emailMode: EmailMode =
    context === 'prep' ? 'prep' : context === 'thankyou' ? 'thankyou' : 'follow_up';

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

  // Resolved public URLs for the visual attachment picker (#6). The client has no
  // SUPABASE_URL to build storage URLs, so /api/job-descriptions resolves them.
  // This is ONLY the preview-thumbnail source — the pickable tiles render from the
  // always-present SSR `jobs` prop (see jdTiles below), so attachment still works
  // if this client fetch fails or hasn't resolved (tiles just show a placeholder).
  type JdDoc = { id: string; title: string; file_path: string; public_url: string };
  const [jdDocs, setJdDocs] = useState<JdDoc[]>([]);
  useEffect(() => {
    let live = true;
    fetch('/api/job-descriptions')
      .then((r) => r.json())
      .then((d) => {
        if (live && d.ok && Array.isArray(d.jobs)) setJdDocs(d.jobs as JdDoc[]);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  // Pickable tiles come from the SSR `jobs` prop (always present); the fetched
  // public_url just lights up the PDF preview when available.
  const jdTiles = jobs.map((j) => ({
    id: j.id,
    title: j.title,
    file_path: j.file_path,
    public_url: jdDocs.find((d) => d.id === j.id)?.public_url ?? '',
  }));

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
      const job =
        jdDocs.find((j) => j.id === selectedJobId) ??
        jobs.find((j) => j.id === selectedJobId);
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
      // Refresh so the new candidate.resume reaches the notes studio (via the
      // rows→selected sync), which then parses the résumé into the raw notes —
      // matching the drag-drop path. Without this the Résumé-tab upload would
      // attach but never inject. Dedup (initialResumeUrl + per-URL + marker) keeps
      // it to exactly one injection.
      onChanged();
    } catch (err) {
      setResumeMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Remove the résumé from the candidate (Candidate Hub tweak #1): clears the DB
  // column + deletes the stored file, then refreshes so the modal/studio drop it.
  const [removingResume, setRemovingResume] = useState(false);
  const handleRemoveResume = async () => {
    if (removingResume) return;
    if (!window.confirm('Remove this résumé from the candidate? This deletes the stored file.')) {
      return;
    }
    setRemovingResume(true);
    setResumeMsg(null);
    try {
      const res = await removeResume(candidate.id);
      if (!res.ok) throw new Error(res.error || 'Remove failed');
      setResumeUrl(null);
      setResumeMsg('Removed ✓');
      onChanged();
    } catch (err) {
      setResumeMsg(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setRemovingResume(false);
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

  // ── Bullhorn (candidate-card §3): link an existing record id; the button
  // then deep-links to the profile. Nothing auto-creates a profile yet (the
  // extractor is read-only, no live write creds) — so when unlinked the tab
  // signals that a profile needs creating. Paste the id to link it now. ──
  const [bullhornId, setBullhornId] = useState(candidate.bullhorn_id ?? '');
  const [savedBullhornId, setSavedBullhornId] = useState(candidate.bullhorn_id ?? '');
  const [bullhornSaving, setBullhornSaving] = useState(false);
  const [bullhornMsg, setBullhornMsg] = useState<string | null>(null);
  const handleSaveBullhorn = async () => {
    setBullhornMsg(null);
    setBullhornSaving(true);
    const res = await saveBullhornId(candidate.id, bullhornId.trim());
    if (res.ok) {
      setSavedBullhornId(bullhornId.trim());
      setBullhornMsg('Linked ✓');
      onChanged();
    } else {
      setBullhornMsg(`Error: ${res.error ?? 'unknown'}`);
    }
    setBullhornSaving(false);
  };
  const bhUrl = bullhornUrl(savedBullhornId);

  // Idiot-proof one-button bridge (no live API write): copy this candidate's
  // cleaned summary to the clipboard, then open Bullhorn (their record if a id
  // is linked, otherwise the Bullhorn home) in a new tab — paste and go.
  const [bhCopied, setBhCopied] = useState(false);
  const copyAndOpenBullhorn = async () => {
    const summary = (candidate.notes_clean || candidate.notes || '').trim();
    try {
      if (summary) await navigator.clipboard.writeText(summary);
      setBhCopied(true);
      setTimeout(() => setBhCopied(false), 2000);
    } catch {
      /* clipboard blocked — still open Bullhorn below */
    }
    window.open(bhUrl || BULLHORN_HOME, '_blank', 'noopener,noreferrer');
  };

  const resumeName = resumeUrl
    ? decodeURIComponent(resumeUrl.split('/').pop() || 'resume').replace(/^\d+-/, '')
    : null;
  const tUrl = trelloUrl(candidate.trello_card_id);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={{ ...styles.modal, ...(activeTab === 'notes' ? styles.modalWide : null) }}
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
              { key: 'bullhorn', icon: 'ti-database', label: 'Bullhorn' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={activeTab === t.key ? styles.tabActive : styles.tab}
            >
              <i className={`ti ${t.icon}`} aria-hidden /> {t.label}
              {/* Green "on file" signal — lit when this tab has content saved. */}
              {((t.key === 'resume' && resumeUrl) ||
                (t.key === 'linkedin' && savedLinkedin) ||
                (t.key === 'bullhorn' && savedBullhornId)) && (
                <span style={styles.tabDot} aria-hidden />
              )}
            </button>
          ))}
        </div>

        <div style={styles.tabContent}>
          {activeTab === 'notes' && (
            <CandidateNotesStudio
              candidate={candidate}
              onTodoRaised={onTodoRaised}
              onChanged={onChanged}
              onResumeUploaded={(url) => {
                setResumeUrl(url);
                setResumeMsg('Uploaded ✓ from Notes');
              }}
            />
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
                  ? 'Attachment (optional)'
                  : 'Attach a job description'}
              </label>
              {/* Visual JD picker (#6): same preview thumbnails as the JD library,
                  half-size and reactive to the space — no dropdown. Click to pick;
                  click again to clear. */}
              <div style={styles.jdGrid}>
                <button
                  type="button"
                  onClick={() => setSelectedJobId('')}
                  style={{
                    ...styles.jdNone,
                    ...(selectedJobId === '' ? styles.jdTileActive : null),
                  }}
                  title="No attachment"
                >
                  <span style={styles.jdNoneMark}>
                    <i className="ti ti-ban" aria-hidden />
                  </span>
                  <span style={styles.jdTitle}>No attachment</span>
                </button>
                {jdTiles.map((j) => {
                  const selected = j.id === selectedJobId;
                  return (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => setSelectedJobId(selected ? '' : j.id)}
                      style={{ ...styles.jdTile, ...(selected ? styles.jdTileActive : null) }}
                      title={j.title}
                    >
                      <div style={styles.jdPreviewBox}>
                        {j.public_url ? (
                          <>
                            <object
                              data={`${j.public_url}#toolbar=0&navpanes=0&view=FitH`}
                              type="application/pdf"
                              style={styles.jdPreviewObject}
                              aria-label={j.title}
                            />
                            <div style={styles.jdPreviewOverlay} />
                          </>
                        ) : (
                          // Preview URL not resolved yet / fetch failed — still
                          // selectable, just shows a document placeholder.
                          <div style={styles.jdPreviewPlaceholder}>
                            <i className="ti ti-file-text" aria-hidden />
                          </div>
                        )}
                        {selected && (
                          <span style={styles.jdSelectedBadge} aria-hidden>
                            <i className="ti ti-check" />
                          </span>
                        )}
                      </div>
                      <span style={styles.jdTitle}>{j.title}</span>
                    </button>
                  );
                })}
              </div>
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
              {resumeMsg && (
                <span
                  style={{
                    ...styles.saveMsg,
                    color: resumeMsg.includes('✓') ? C.green : '#f87171',
                  }}
                >
                  {resumeMsg}
                </span>
              )}
              {resumeUrl ? (
                <div style={styles.resumePreviewWrap}>
                  <div style={styles.resumePreviewHead}>
                    <span style={styles.fieldValue}>
                      <i className="ti ti-file-cv" aria-hidden /> {resumeName}
                    </span>
                    <div style={styles.resumeHeadActions}>
                      <a href={resumeUrl} target="_blank" rel="noreferrer" style={styles.link}>
                        Open full ↗
                      </a>
                      <button
                        type="button"
                        style={styles.resumeRemoveBtn}
                        onClick={handleRemoveResume}
                        disabled={removingResume}
                        title="Remove this résumé from the candidate"
                      >
                        <i className="ti ti-trash" aria-hidden />{' '}
                        {removingResume ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  </div>
                  {/* In-cockpit preview — same embed plumbing as the JD library. */}
                  {isResumeImage(resumeUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resumeUrl} alt="Résumé preview" style={styles.resumePreviewImg} />
                  ) : (
                    <object
                      data={`${resumeUrl}#toolbar=0&navpanes=0&view=FitH`}
                      type="application/pdf"
                      style={styles.resumePreviewFrame}
                    >
                      <iframe src={resumeUrl} style={styles.resumePreviewFrame} title="Résumé preview" />
                    </object>
                  )}
                </div>
              ) : (
                <p style={styles.fieldValue}>
                  No résumé on file yet — upload one above, or drop it onto the Notes tab to
                  attach + parse it.
                </p>
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

          {activeTab === 'bullhorn' && (
            <div style={styles.sectionCol}>
              {/* The one-button bridge — works whether or not a record is linked. */}
              <button style={styles.bullhornBtn} onClick={copyAndOpenBullhorn}>
                <i className={`ti ${bhCopied ? 'ti-check' : 'ti-clipboard-copy'}`} aria-hidden />{' '}
                {bhCopied
                  ? 'Copied — opening Bullhorn…'
                  : savedBullhornId
                    ? 'Copy summary + open record'
                    : 'Copy summary + open Bullhorn'}
              </button>
              <p style={styles.bullhornHint}>
                Copies this candidate’s cleaned summary to your clipboard, then opens{' '}
                {savedBullhornId ? 'their Bullhorn record' : 'Bullhorn'} in a new tab — paste
                and go. No live API write; this is the one-button bridge.
              </p>

              {bhUrl ? (
                <>
                  <a href={bhUrl} target="_blank" rel="noreferrer" style={styles.link}>
                    Open record directly ↗
                  </a>
                  <p style={styles.fieldValue}>Linked record id: {savedBullhornId}</p>
                  <button style={styles.linkText} onClick={() => setSavedBullhornId('')}>
                    Edit / unlink
                  </button>
                </>
              ) : (
                <>
                  <label style={styles.label}>
                    Link a record id (optional — enables a direct deep-link)
                  </label>
                  <input
                    style={styles.input}
                    value={bullhornId}
                    onChange={(e) => setBullhornId(e.target.value)}
                    placeholder="e.g. 24681"
                  />
                  <div style={styles.saveRow}>
                    <button
                      style={styles.primaryBtn}
                      onClick={handleSaveBullhorn}
                      disabled={bullhornSaving || !bullhornId.trim()}
                    >
                      {bullhornSaving ? 'Linking…' : 'Link profile'}
                    </button>
                    {bullhornMsg && (
                      <span
                        style={{
                          ...styles.saveMsg,
                          color: bullhornMsg.startsWith('Error') ? '#f87171' : C.green,
                        }}
                      >
                        {bullhornMsg}
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

  // Frosted-glass / acetate backdrop — the cockpit shows through, faintly
  // blurred (candidate-card §1). Falls back to a plain dim where the browser
  // doesn't support backdrop-filter.
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(7,7,9,0.55)',
    backdropFilter: 'blur(8px) saturate(120%)',
    WebkitBackdropFilter: 'blur(8px) saturate(120%)',
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
  // Wider footprint for the Notes tab so the dual-panel studio + command bar
  // (candidate-card §4/§6) have room to breathe.
  modalWide: { maxWidth: 'min(1040px, 96vw)' },
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
  tabBar: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 18 },
  tab: {
    position: 'relative',
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
    position: 'relative',
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
  // Bullhorn one-button bridge. Brand-green like the cockpit; works as a real
  // <button> (border/cursor/font reset) since it now triggers copy+open.
  bullhornBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    padding: '9px 16px',
    border: 'none',
    borderRadius: RADIUS.button,
    background: C.green,
    color: C.bg,
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  bullhornHint: { fontSize: 11.5, color: C.muted, lineHeight: 1.5, margin: '2px 0 8px' },
  // Green "on file" dot on a modal tab (résumé / LinkedIn / Bullhorn present).
  // Absolutely pinned to the tab's top-right corner so it sits in the SAME spot
  // on every tab and never nudges the centered label out of alignment (#7).
  tabDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: C.green,
    boxShadow: `0 0 6px ${C.green}`,
  },
  resumePreviewWrap: { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  resumePreviewHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  resumeHeadActions: { display: 'flex', alignItems: 'center', gap: 14 },
  resumeRemoveBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    border: 'none',
    background: 'transparent',
    color: C.red,
    cursor: 'pointer',
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: 'inherit',
    padding: 0,
  },
  resumePreviewFrame: {
    width: '100%',
    height: 460,
    border: BORDER,
    borderRadius: RADIUS.card,
    background: C.panel2,
  },
  resumePreviewImg: {
    width: '100%',
    maxHeight: 460,
    objectFit: 'contain',
    border: BORDER,
    borderRadius: RADIUS.card,
    background: C.panel2,
  },

  // Visual JD attachment picker (#6) — half-size of the JD library tiles,
  // auto-fill so the grid stays reactive to the modal width.
  jdGrid: {
    marginTop: 6,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
    gap: 8,
    maxHeight: 290,
    overflowY: 'auto',
    paddingRight: 2,
  },
  jdTile: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 0,
    border: BORDER,
    borderRadius: RADIUS.card,
    background: C.panel2,
    cursor: 'pointer',
    textAlign: 'left',
    overflow: 'hidden',
    fontFamily: 'inherit',
  },
  jdTileActive: {
    border: `1px solid ${C.green}`,
    boxShadow: `0 0 0 1px ${C.green}55`,
  },
  jdPreviewBox: { position: 'relative', height: 96, overflow: 'hidden', background: C.panel2 },
  jdPreviewObject: { width: '100%', height: '100%', border: 'none', pointerEvents: 'none' },
  jdPreviewOverlay: { position: 'absolute', inset: 0, background: 'transparent' },
  jdPreviewPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: C.muted2,
    fontSize: 26,
    background: C.panel,
  },
  jdSelectedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: C.green,
    color: C.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 800,
  },
  jdTitle: {
    fontSize: 11,
    color: C.white,
    padding: '0 8px 8px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  jdNone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 124,
    border: `1.5px dashed ${C.line2}`,
    borderRadius: RADIUS.card,
    background: C.panel2,
    color: C.muted,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  jdNoneMark: { fontSize: 22, color: C.muted },
};
