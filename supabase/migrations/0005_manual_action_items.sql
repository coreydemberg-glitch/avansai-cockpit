-- 0005_manual_action_items.sql
--
-- Run ONCE against your Supabase project:
--   Dashboard → SQL Editor → New query → paste this file → Run.
--
-- Idempotent: safe to re-run. Extends `action_items` (0002) so the right-hand
-- To-Do sidebar can hold recruiter-created `manual` to-dos alongside the
-- auto-populated funnel ones. Manual rows have no candidate (candidate_id null)
-- and carry their free-text label in `title`.

-- 1. Allow candidate-less rows ---------------------------------------------
-- Manual to-dos aren't tied to a candidate, so candidate_id must be nullable.
alter table public.action_items alter column candidate_id drop not null;

-- 2. Free-text label --------------------------------------------------------
-- Holds the manual to-do's text; null for auto (prep/feedback/thankyou) rows.
alter table public.action_items add column if not exists title text;

-- 3. Allow the 'manual' type ------------------------------------------------
-- The 0002 CHECK only permits ('prep','feedback','thankyou'). Drop it (the name
-- is auto-generated like action_items_type_check) and re-add a widened one. The
-- add is wrapped so a re-run that hits an already-present constraint no-ops.
alter table public.action_items drop constraint if exists action_items_type_check;
do $$ begin
  alter table public.action_items
    add constraint action_items_type_check
    check (type in ('prep','feedback','thankyou','manual'));
exception when duplicate_object then null; end $$;
