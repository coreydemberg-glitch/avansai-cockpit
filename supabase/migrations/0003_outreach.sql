-- 0003_outreach.sql
--
-- Run ONCE against your Supabase project:
--   Dashboard → SQL Editor → New query → paste this file → Run.
--
-- Idempotent: safe to re-run. Adds the SHARED outreach pipeline used by both the
-- Outbound (cold email) and Referral (warm network) quadrants:
--   • contacts            — one person record per uploaded/enriched row
--   • contact_work_history — STRUCTURED company history, one row per tenure
--                            (the foundation for "who in my network worked at X?")
--   • referrals           — who a contact has referred (referral history)
--   • contact_notes       — timestamped notes that drive "date last contacted"
--
-- Convention notes (match 0001/0002): uuid PKs, snake_case, timestamptz now(),
-- RLS enabled with NO policies (service-role client only), FKs cascade.

-- 1. contacts -----------------------------------------------------------------
-- The shared person record. `list_type` is the discriminator so the SAME table
-- backs both quadrants ("build the plumbing once"). Outbound and Referral differ
-- only in which child tables / columns they exercise.
create table if not exists public.contacts (
  id                uuid primary key default gen_random_uuid(),
  list_type         text not null check (list_type in ('outbound', 'referral')),
  name              text,
  first_name        text,                 -- merge field for {first_name}; split from name if absent
  email             text,
  title             text,
  company           text,                 -- current company
  source_project    text,                 -- Outbound "Title/Project" (e.g. "MaintainX Data")
  linkedin_url      text,

  -- Enrichment lifecycle. The placeholder enrich step leaves enrichment_status
  -- 'pending' (no Apollo call yet). email_status is derived from whether an email
  -- is present so the Outbound "contact info not provided" bucket works today.
  enrichment_status text not null default 'pending'
                      check (enrichment_status in ('pending', 'enriched', 'failed')),
  email_status      text not null default 'unknown'
                      check (email_status in ('unknown', 'ok', 'missing')),

  -- Outbound: `contacted` is the "Sent status" checkmark. Referral: last_contacted_at
  -- powers the "Date last contacted" column. A send sets both; a note sets last_contacted_at.
  contacted         boolean not null default false,
  last_contacted_at timestamptz,

  archived          boolean not null default false,  -- "archive or retry" for missing-email rows
  raw               jsonb,                 -- original CSV row, for re-parse / debugging
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists contacts_list_type_idx on public.contacts (list_type);
create index if not exists contacts_email_status_idx
  on public.contacts (list_type, email_status) where archived = false;

-- Idempotent re-imports: at most one non-archived contact per (list_type, email).
-- NOTE: PostgREST/upsert cannot target a PARTIAL unique index, so the upload route
-- does a plain insert and ignores the 23505 unique_violation (same idiom as the
-- Trello webhook's action_items insert).
create unique index if not exists contacts_unique_email
  on public.contacts (list_type, lower(email)) where email is not null;

alter table public.contacts enable row level security;

-- 2. contact_work_history -----------------------------------------------------
-- THE structured schema the spec stresses. One row per company-tenure so the
-- near-future query "who in my network worked at [Company]?" is a single index
-- lookup TODAY, even though the search UI is later. `company_normalized` is a
-- STORED generated column (lower/trim) so matching is consistent regardless of
-- how the row was captured. `source` records HOW the tenure was ingested — the
-- ingestion mechanism is the placeholder, the schema is final.
create table if not exists public.contact_work_history (
  id                 uuid primary key default gen_random_uuid(),
  contact_id         uuid not null references public.contacts(id) on delete cascade,
  company            text not null,
  company_normalized text generated always as (lower(btrim(company))) stored,
  title              text,
  start_date         date,
  end_date           date,                 -- null = current or unknown
  is_current         boolean not null default false,
  source             text not null default 'manual'
                       check (source in ('manual', 'resume', 'linkedin', 'apollo', 'csv')),
  created_at         timestamptz not null default now()
);

-- The cohort query index: SELECT contact_id ... WHERE company_normalized = lower($1)
create index if not exists work_history_company_idx
  on public.contact_work_history (company_normalized);
create index if not exists work_history_contact_idx
  on public.contact_work_history (contact_id);

alter table public.contact_work_history enable row level security;

-- 3. referrals ----------------------------------------------------------------
-- People a contact has previously referred (referral history → rank/nurture).
-- referred_contact_id is nullable because a referred person may not be a contact
-- yet; referred_name carries the free-text name until they are ingested.
create table if not exists public.referrals (
  id                  uuid primary key default gen_random_uuid(),
  referrer_contact_id uuid not null references public.contacts(id) on delete cascade,
  referred_contact_id uuid references public.contacts(id) on delete set null,
  referred_name       text,
  note                text,
  created_at          timestamptz not null default now()
);

-- Require at least one way to identify the referred person.
do $$ begin
  alter table public.referrals
    add constraint referrals_referred_present
    check (referred_contact_id is not null or referred_name is not null);
exception when duplicate_object then null; end $$;

create index if not exists referrals_referrer_idx
  on public.referrals (referrer_contact_id);

alter table public.referrals enable row level security;

-- 4. contact_notes ------------------------------------------------------------
-- Timestamped notes, one row per note (queryable — unlike the append-to-text
-- hack used for candidate feedback). Adding a note also bumps the parent
-- contact's last_contacted_at (done in the server action).
create table if not exists public.contact_notes (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists contact_notes_contact_idx
  on public.contact_notes (contact_id, created_at desc);

alter table public.contact_notes enable row level security;
