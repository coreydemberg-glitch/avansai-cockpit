-- 0006_funnel_8stage.sql
--
-- Run ONCE against your Supabase project:
--   Dashboard → SQL Editor → New query → paste this file → Run.
--
-- Idempotent: safe to re-run. Two things:
--   1. Widen the funnel to 8 stages (slider build): relax the funnel_stage CHECK
--      from 1..5 to 1..8 so candidates can reach the new stages 6–8.
--   2. Add the `prep_materials` library (round-by-round prep docs) + its storage
--      bucket, mirroring `job_descriptions`.
--
-- Stage model (slider build): the per-candidate slider runs 1.0 → 8.0 in
-- half-steps. We store it on the EXISTING columns — no new stage column:
--   funnel_stage = floor(slider)         -- 1..8, the whole milestone reached
--   pending      = slider is a half-step -- sitting in the gap after that stage
--   prep_sent    = prep email actually sent at that half-step (solid green laser)
-- So a slider at 3.5 with prep sent → funnel_stage=3, pending=true, prep_sent=true.

-- 1. Widen funnel_stage to 8 stages -----------------------------------------
-- Drop the old 1..5 range constraint (whatever it's named) and re-add 1..8.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.candidates'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%funnel_stage%'
  loop
    execute format('alter table public.candidates drop constraint %I', c);
  end loop;
exception when undefined_table then null; end $$;

do $$ begin
  alter table public.candidates
    add constraint candidates_funnel_stage_range check (funnel_stage between 1 and 8);
exception when duplicate_object then null; end $$;

-- 2. Prep materials library --------------------------------------------------
-- One row per uploaded prep document (interview-round prep the candidate may
-- need). `stage` optionally tags a doc to a funnel stage (1..8) so the prep
-- modal can surface the most relevant docs first; null = applies to any stage.
create table if not exists public.prep_materials (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  stage      int,
  file_path  text not null,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.prep_materials
    add constraint prep_materials_stage_range check (stage is null or stage between 1 and 8);
exception when duplicate_object then null; end $$;

create index if not exists prep_materials_stage_idx on public.prep_materials(stage);

-- Service-role-only access pattern (RLS on, no policies) like the other tables.
alter table public.prep_materials enable row level security;

-- 3. Storage bucket for prep docs -------------------------------------------
-- Public bucket so the library can render PDF previews (matches job-descriptions).
insert into storage.buckets (id, name, public)
values ('prep-materials', 'prep-materials', true)
on conflict (id) do nothing;
