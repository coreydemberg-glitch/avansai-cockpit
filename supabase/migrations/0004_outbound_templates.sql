-- 0004_outbound_templates.sql
--
-- Run ONCE against your Supabase project:
--   Dashboard → SQL Editor → New query → paste this file → Run.
--
-- Idempotent: safe to re-run. Moves the Outbound (cold-email) templates OUT of
-- code (they were hardcoded in app/cockpit/outreach/ComposeModal.tsx) and INTO
-- the existing `email_templates` table, so the copy is editable in the Table
-- Editor without a deploy — mirroring how the candidate template already works.
--
-- The two seeded rows are intentionally BLANK placeholders: Corey fills in the
-- real subject/body later (in the Table Editor or a future template UI). The
-- compose modal reads these rows; merge fields {first_name} / {company} still
-- substitute at send time.

-- 1. Discriminate candidate vs outbound templates ----------------------------
-- email_templates (0001) backed only the single candidate follow-up. Add a
-- `kind` discriminator (same idiom as contacts.list_type) so the Outbound
-- quadrant can query its templates as a set, and a `label` for the compose
-- dropdown's display name. Existing rows backfill to kind='candidate'.
alter table public.email_templates
  add column if not exists kind  text not null default 'candidate';
alter table public.email_templates
  add column if not exists label text;

do $$ begin
  alter table public.email_templates
    add constraint email_templates_kind_check
    check (kind in ('candidate', 'outbound'));
exception when duplicate_object then null; end $$;

create index if not exists email_templates_kind_idx
  on public.email_templates (kind);

-- 2. Seed two BLANK outbound templates ---------------------------------------
-- subject/greeting/body are NOT NULL, so blanks are empty strings. greeting is
-- unused by the Outbound compose flow (kept '' to satisfy the column). Re-running
-- will NOT overwrite edited copy (on conflict do nothing), so Corey can fill these
-- in and re-run this file safely.
insert into public.email_templates (key, kind, label, subject, greeting, body)
values
  ('outbound_1', 'outbound', 'Template 1', '', '', ''),
  ('outbound_2', 'outbound', 'Template 2', '', '', '')
on conflict (key) do nothing;
