-- Candidate-card iteration (post-UX). Two new columns on the pre-existing
-- `candidates` table (created via the Supabase dashboard, like the funnel
-- columns before it — see 0002/0006). Both are nullable so rows from before
-- this migration keep working, and every read/write that touches them is
-- wrapped in the isMissingFunnelSchema() guard, so the cockpit renders and
-- the new card features degrade gracefully until this migration is applied.
--
-- Apply to prod with the same dashboard-query technique used for 0006/0007.

-- notes_clean: the AI-cleaned candidate summary from the live notes studio
-- (the RIGHT panel). Persisted separately from the raw `notes` (LEFT panel)
-- so the Candidates To-Do "copy" module can drop the clean version straight
-- onto the clipboard at documentation time, while the raw call notes stay
-- intact in `notes`.
alter table public.candidates
  add column if not exists notes_clean text;

-- bullhorn_id: the candidate's Bullhorn record id, powering the card's
-- Bullhorn button (deep-links to the profile when set; signals "create a
-- profile" when null). Nothing auto-populates this yet — the read-only
-- bullhorn-infrastructure extractor cannot create profiles and there is no
-- live write client/creds — so it is set manually for now (paste an existing
-- id), pending a future Trello→Bullhorn auto-create. Text (not uuid): Bullhorn
-- ids are integers exposed as strings in URLs.
alter table public.candidates
  add column if not exists bullhorn_id text;
