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

-- ── Affirmation feedback ──────────────────────────────────────────────────
-- Append-only log of what users did with AI-proposed affirmations.
--
-- This is the one thing that genuinely cannot live in the app_state blob:
-- quality review means asking questions ACROSS rows ("which affirmations get
-- rejected most?"), and a per-user jsonb document has no query surface for
-- that. Everything else about the lens pipeline stays in the blob, where the
-- rest of the app's data already lives.
--
-- Rows are immutable by design: no update or delete policy exists, so the
-- record of what was proposed and what the user did with it can't be quietly
-- rewritten later. Users can read their own rows; aggregate review across
-- users is done from the dashboard with the service role, never from the
-- client.

create table if not exists public.affirmation_feedback (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- Which lens produced it, so lenses can be compared against each other.
  lens_id text not null,

  -- Denormalised on purpose: the analysis and affirmation live in the user's
  -- blob, which this table can't join against, and a review needs to see the
  -- actual text without reaching into anyone's private state.
  observation text not null,
  certainty text not null check (certainty in ('high', 'medium', 'low')),
  affirmation_text text not null,

  action text not null check (action in ('confirmed', 'edited', 'rejected')),
  -- Present only when action = 'edited': what the user changed it to. That
  -- delta is the most useful quality signal in the table.
  edited_text text
);

create index if not exists affirmation_feedback_lens_action_idx
  on public.affirmation_feedback (lens_id, action);

alter table public.affirmation_feedback enable row level security;

create policy "Users can insert their own feedback"
  on public.affirmation_feedback for insert
  with check (auth.uid () = user_id);

create policy "Users can read their own feedback"
  on public.affirmation_feedback for select
  using (auth.uid () = user_id);
