-- 0002_funnel.sql
--
-- Run ONCE against your Supabase project:
--   Dashboard → SQL Editor → New query → paste this file → Run.
--
-- Idempotent: safe to re-run. Adds the funnel-timeline state to `candidates`
-- and the `action_items` table the funnel's action panel reads from.
-- See the funnel build spec §4.

-- 1. Funnel state on candidates --------------------------------------------
-- funnel_stage : which solid milestone the candidate has reached (1..5).
-- pending      : true when sitting in a dotted "pending zone" AFTER a stage
--                (completed that stage's event, awaiting the next move).
-- prep_sent    : flips the pending segment amber → green once prep is emailed.
-- dq           : true when the candidate has exited the funnel to the DQ column.
alter table public.candidates add column if not exists funnel_stage int;
alter table public.candidates add column if not exists pending   boolean not null default false;
alter table public.candidates add column if not exists prep_sent boolean not null default false;
alter table public.candidates add column if not exists dq        boolean not null default false;

-- Keep funnel_stage in range when set (NULL allowed for not-yet-in-funnel rows).
do $$ begin
  alter table public.candidates
    add constraint candidates_funnel_stage_range check (funnel_stage between 1 and 5);
exception when duplicate_object then null; end $$;

-- 2. Action items -----------------------------------------------------------
-- One row per to-do surfaced by a candidate's funnel state. The action panel
-- reads open rows straight from here; sending the matching email marks it done.
--   type   : 'prep'     — interview prep doc owed (entered a stage needing prep)
--            'feedback' — capture/structure interview feedback (in Pending)
--            'thankyou' — DQ thank-you email owed
--   status : 'open' | 'done'   (last-write-wins is fine per spec)
create table if not exists public.action_items (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  type         text not null check (type in ('prep','feedback','thankyou')),
  status       text not null default 'open' check (status in ('open','done')),
  created_at   timestamptz not null default now()
);

create index if not exists action_items_candidate_idx on public.action_items(candidate_id);
create index if not exists action_items_open_idx on public.action_items(status) where status = 'open';

-- At most one OPEN item of a given type per candidate, so a re-fired Trello move
-- never creates a duplicate to-do. NOTE: this is a PARTIAL index (WHERE status =
-- 'open'); PostgREST's onConflict/upsert can't target a partial index, so the
-- webhook does a plain INSERT and ignores the resulting 23505 unique-violation —
-- do NOT rewrite it into an onConflict form (see app/api/webhooks/trello/route.ts).
create unique index if not exists action_items_one_open_per_type
  on public.action_items(candidate_id, type) where status = 'open';

-- Match the service-role-only access pattern of the existing tables: RLS on,
-- no policies (the app only ever uses the service-role key, which bypasses RLS).
alter table public.action_items enable row level security;
