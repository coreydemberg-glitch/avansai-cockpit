-- 0007: Sourcing Hub (sourcing build) — per-client AI sourcing workspaces.
--   sourcing_clients   one row per client/account thumbnail
--   sourcing_messages  the LIVE chat thread (moved to archives on window close
--                      unless the client's Brain Buzz toggle is ON)
--   sourcing_archives  archived session transcripts (jsonb) — Claude reads these
--                      back via the search_archived_sessions chat tool
--   sourcing_booleans  Boolean strings captured into the right-rail table
--
-- Same conventions as 0001–0006: uuid PKs, timestamptz now() defaults,
-- ON DELETE CASCADE FKs, indexes on FK + sort columns, RLS enabled with no
-- policies (all access goes through the server-side service-role client).

create table if not exists public.sourcing_clients (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  brain_buzz          boolean not null default false,
  memory_instructions text,
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.sourcing_messages (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.sourcing_clients(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists sourcing_messages_client_idx
  on public.sourcing_messages (client_id, created_at);

create table if not exists public.sourcing_archives (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.sourcing_clients(id) on delete cascade,
  -- Array of { role, content, created_at } — the whole session, verbatim.
  transcript    jsonb not null,
  message_count int not null default 0,
  archived_at   timestamptz not null default now()
);

create index if not exists sourcing_archives_client_idx
  on public.sourcing_archives (client_id, archived_at desc);

create table if not exists public.sourcing_booleans (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.sourcing_clients(id) on delete cascade,
  boolean_string text not null,
  created_at     timestamptz not null default now()
);

create index if not exists sourcing_booleans_client_idx
  on public.sourcing_booleans (client_id, created_at desc);

alter table public.sourcing_clients  enable row level security;
alter table public.sourcing_messages enable row level security;
alter table public.sourcing_archives enable row level security;
alter table public.sourcing_booleans enable row level security;
