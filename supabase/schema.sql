-- Run this once in Supabase: SQL Editor → New query → Run.
-- Service role (server) bypasses RLS. Anon has no access.

create table if not exists public.events (
  id text primary key,
  person_name text not null,
  title text not null,
  message text not null,
  template_id text not null default 'freeform',
  folder_id text not null,
  status text not null default 'open',
  owner_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.contributors (
  id text primary key,
  event_id text not null references public.events(id) on delete cascade,
  email text not null,
  invited_at timestamptz,
  uploaded_at timestamptz,
  unique (event_id, email)
);

create table if not exists public.poster_state (
  event_id text primary key references public.events(id) on delete cascade,
  layout_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.google_accounts (
  email text primary key,
  refresh_token text not null,
  access_token text,
  expiry_date bigint,
  drive_root_folder_id text,
  updated_at timestamptz not null default now()
);

alter table public.events enable row level security;
alter table public.contributors enable row level security;
alter table public.poster_state enable row level security;
alter table public.google_accounts enable row level security;
