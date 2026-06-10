// Shape of a row in the Supabase `candidates` table. Extra columns are tolerated
// (we select *), but these are the ones the cockpit reads.
export type Candidate = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  linkedin_url: string | null;
  resume: string | null;
  trello_card_id: string | null;
  notes: string | null;
  status: string | null;
  // Hidden from the cockpit when Corey is removed from the Trello card.
  // Recoverable: the row stays; re-adding him on Trello sets this back to false.
  archived?: boolean | null;

  // Funnel state (build spec §4 + the 8-stage slider build §1). The per-candidate
  // slider runs 1.0 → 8.0 in half-steps, stored across these existing columns:
  //   funnel_stage = floor(slider)   → 1..8, the whole milestone reached
  //   pending      = slider is .5     → sitting in the gap after that stage
  //   prep_sent    = prep email sent  → that half-step's line flips to a green laser
  // All optional so rows from before the 0002/0006 migrations keep working.
  funnel_stage?: number | null; // 1..8; null = not placed in the funnel yet
  pending?: boolean | null; // true on a half-step (1.5, 2.5, …) — prep zone
  prep_sent?: boolean | null; // prep emailed → segment flips red → green laser
  dq?: boolean | null; // exited the funnel to the DQ column
};

// A row in `action_items`. Auto-populated by the webhook when a candidate enters
// a state that needs action; the funnel's action panel reads open rows directly.
// `manual` items are recruiter-created to-dos (no candidate; free-text `title`),
// added/removed from the right-hand To-Do sidebar (0005 migration).
export type ActionItem = {
  id: string;
  candidate_id: string | null;
  type: 'prep' | 'feedback' | 'thankyou' | 'manual';
  title?: string | null;
  status: 'open' | 'done';
  created_at?: string | null;
};

// An open action item joined to its candidate, as the action panel consumes it.
export type ActionItemWithCandidate = ActionItem & {
  candidate: Candidate | null;
};

// Which flow the candidate modal should open in when launched from a funnel
// action (drives the active tab + which email template/prompt is prefilled).
export type ActionContext = 'prep' | 'feedback' | 'thankyou';

// A row in `job_descriptions`. `file_path` is the object path within the
// `job-descriptions` storage bucket — the send-email route downloads it
// server-side to attach the PDF.
export type JobDescription = {
  id: string;
  title: string;
  file_path: string;
  created_at?: string | null;
};

// A row in `prep_materials` (0006 migration). Interview-round prep docs the
// candidate may need, browsable in the Prep Documents library and attachable
// from the Prep modal. `stage` optionally tags a doc to a funnel stage (1..8);
// `file_path` is the object path within the `prep-materials` storage bucket.
export type PrepMaterial = {
  id: string;
  title: string;
  stage: number | null;
  file_path: string;
  created_at?: string | null;
};

// A row in `email_templates`. The greeting (e.g. "Hi [name],") is stored apart
// from the body so the recruiter can edit it per candidate; both may contain the
// literal [name] token, which the app replaces with the candidate's first name.
export type EmailTemplate = {
  id: string;
  key: string;
  subject: string;
  greeting: string;
  body: string;
};

// An Outbound (cold-email) template row from `email_templates` where
// kind='outbound' (0004 migration). The Outbound compose modal reads these as a
// set; `label` is the dropdown display name. No greeting — the cold-email flow
// uses subject + body only, with {first_name}/{company} merge fields.
export type OutboundTemplate = {
  id: string;
  key: string;
  label: string;
  subject: string;
  body: string;
};

// ── Outreach (Outbound + Referral quadrants, 0003 migration) ────────────────
// All fields optional/nullable so the cockpit still type-checks and renders
// before the 0003 migration is applied (mirrors how the funnel columns were
// added to Candidate).

export type ContactListType = 'outbound' | 'referral';

// A row in `contacts` — the shared person record behind both quadrants.
export type Contact = {
  id: string;
  list_type: ContactListType;
  name: string | null;
  first_name: string | null;
  email: string | null;
  title: string | null;
  company: string | null;
  source_project: string | null; // Outbound "Title/Project"
  linkedin_url: string | null;
  enrichment_status?: 'pending' | 'enriched' | 'failed' | null;
  email_status?: 'unknown' | 'ok' | 'missing' | null;
  contacted?: boolean | null; // Outbound "Sent status"
  last_contacted_at?: string | null; // Referral "Date last contacted"
  archived?: boolean | null;
  raw?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

// A row in `contact_work_history` — one company-tenure. The structured schema
// that makes "who in my network worked at [Company]?" a single query.
export type ContactWorkHistory = {
  id: string;
  contact_id: string;
  company: string;
  company_normalized?: string | null; // generated (lower/trim) in the DB
  title: string | null;
  start_date: string | null;
  end_date: string | null; // null = current/unknown
  is_current?: boolean | null;
  source?: 'manual' | 'resume' | 'linkedin' | 'apollo' | 'csv' | null;
  created_at?: string | null;
};

// A row in `referrals` — someone a contact has referred. referred_contact_id is
// null until the referred person is themselves a contact; referred_name holds
// the free-text name in the meantime.
export type Referral = {
  id: string;
  referrer_contact_id: string;
  referred_contact_id: string | null;
  referred_name: string | null;
  note: string | null;
  created_at?: string | null;
};

// A row in `contact_notes` — a single timestamped note.
export type ContactNote = {
  id: string;
  contact_id: string;
  body: string;
  created_at?: string | null;
};
