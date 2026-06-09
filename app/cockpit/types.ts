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
};

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
