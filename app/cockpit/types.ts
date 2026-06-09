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

  // Funnel-timeline state (build spec §4). Synced from the candidate's Trello
  // column by the webhook. All optional so rows from before the 0002 migration
  // (and the cockpit) keep working if the columns aren't present yet.
  funnel_stage?: number | null; // 1..5; null = not placed in the funnel yet
  pending?: boolean | null; // sitting in a dotted "pending zone" after a stage
  prep_sent?: boolean | null; // prep emailed → segment flips amber → green
  dq?: boolean | null; // exited the funnel to the DQ column
};

// A row in `action_items`. Auto-populated by the webhook when a candidate enters
// a state that needs action; the funnel's action panel reads open rows directly.
export type ActionItem = {
  id: string;
  candidate_id: string;
  type: 'prep' | 'feedback' | 'thankyou';
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
