-- 0001_email_templates_and_job_descriptions.sql
--
-- Run ONCE against your Supabase project:
--   Dashboard → SQL Editor → New query → paste this file → Run.
--
-- Idempotent: safe to re-run. Re-running will NOT overwrite an edited template
-- (the seed uses `on conflict do nothing`), so you can tweak the email copy in
-- the Table Editor afterwards without code changes.

-- 1. Email templates --------------------------------------------------------
-- One row per reusable template, looked up by `key`. The greeting is stored
-- separately from the body so the recruiter can edit the "Hi [name]," line per
-- candidate while the rest stays constant. Use the literal token [name] as a
-- placeholder — the app substitutes the candidate's first name on open.
create table if not exists public.email_templates (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,
  subject    text not null,
  greeting   text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.email_templates (key, subject, greeting, body)
values (
  'candidate_follow_up',
  'MaintainX Follow-Up - Updated Resume',
  'Hi [name],',
  $body$Was great speaking with you earlier, I appreciate your time.

Please find below more information about the opportunity at MaintainX.

I have included the job description for the role we discussed.

Can you please send me back your updated resume?

Thanks, and looking forward to working with you!
Corey

Links
- Their product and culture: https://crew.vc/perspectives-insights/scaling-culture-through-hyper-growth
- Customer Interview – Titan Concrete: https://www.youtube.com/watch?v=8tcYMdBaJKE

Benefits
- Health and Dental
- Unlimited PTO
- Equity packages$body$
)
on conflict (key) do nothing;

-- 2. Job descriptions -------------------------------------------------------
-- One row per uploaded JD PDF. `file_path` is the object path WITHIN the
-- job-descriptions storage bucket (not a public URL) — the send-email route
-- downloads it server-side with the service-role key to attach to outgoing mail.
create table if not exists public.job_descriptions (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  file_path  text not null,
  created_at timestamptz not null default now()
);

-- 3. Storage bucket for the JD PDFs -----------------------------------------
-- Public so the uploaded PDF can be linked/previewed directly; uploads still go
-- through the server (service-role key), which bypasses storage RLS.
insert into storage.buckets (id, name, public)
values ('job-descriptions', 'job-descriptions', true)
on conflict (id) do nothing;
