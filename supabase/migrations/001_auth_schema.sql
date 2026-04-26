-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

-- ── Profiles (one row per user, stores username) ──────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ── Arena matches ─────────────────────────────────────────────────────────
create table if not exists public.arena_matches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  date          timestamptz default now(),
  difficulty    text not null check (difficulty in ('easy','medium','hard')),
  won           boolean not null,
  player_score  int not null,
  ai_score      int not null,
  trophy_earned boolean default false
);

alter table public.arena_matches enable row level security;

create policy "Users manage own arena matches"
  on public.arena_matches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Dojo saves ────────────────────────────────────────────────────────────
create table if not exists public.dojo_saves (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  date         timestamptz default now(),
  stroke_label text not null,
  score        int not null,
  phase        text,
  note         text
);

alter table public.dojo_saves enable row level security;

create policy "Users manage own dojo saves"
  on public.dojo_saves for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
