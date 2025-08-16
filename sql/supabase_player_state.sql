-- SQL to create player_state and updates log for Supabase
-- Run this in your Supabase SQL editor

-- Table that stores authoritative per-player state (single row per user)
create table if not exists public.player_state (
  user_id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_player_state_updated_at on public.player_state(updated_at);

-- Lightweight audit table used for rate limiting / metrics
create table if not exists public.player_state_updates_log (
  id bigserial primary key,
  user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_updates_log_user_created_at on public.player_state_updates_log(user_id, created_at desc);

-- Row Level Security: allow selects for the owning user; disallow client inserts/updates.
-- The trusted server (Edge Function / server) will perform upserts using the service_role key.
alter table public.player_state enable row level security;
create policy "allow_select_own" on public.player_state
  for select using (auth.uid() = user_id);

-- Deny direct client inserts/updates/deletes by not creating permissive policies.

-- Ensure updates_log is writable only by service role (no client policies created)
alter table public.player_state_updates_log enable row level security;

-- OPTIONAL: If you want the application (authenticated clients) to be able to read public.player_state for other players,
-- you can create additional policies. For now, we keep it strict for security and use server-side upserts.

-- Example: create a materialized view for aggregated metrics if needed later.


