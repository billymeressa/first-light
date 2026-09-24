-- First Light — cloud sync schema.
-- Run this once in your Supabase project's SQL editor (Dashboard → SQL Editor → New query).
-- One row per signed-in user, holding the whole synced app state as JSON —
-- mirrors the shape already used for localStorage, just with a real owner
-- and row-level security instead of "whoever has this browser."

create table if not exists public.app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

create policy "Users can read their own state"
  on public.app_state for select
  using (auth.uid () = user_id);

create policy "Users can insert their own state"
  on public.app_state for insert
  with check (auth.uid () = user_id);

create policy "Users can update their own state"
  on public.app_state for update
  using (auth.uid () = user_id);

-- Note: API keys for Claude/Gemini are deliberately NOT part of the synced
-- state — they stay local to each browser (see src/state/store.ts), so this
-- table never holds them.
