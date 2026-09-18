-- ============================================================
-- CHALLENGERS CRICKET CLUB — SUPABASE SQL SCHEMA
-- Run this in your Supabase Project -> SQL Editor -> New query
-- ============================================================

-- 1. Create Matches Table
create table if not exists public.matches (
  id text primary key,
  date text not null,
  start_time text default '',
  end_time text default '',
  turf text not null,
  format text default 'Turf Match',
  max_players integer default 22,
  playing jsonb default '[]'::jsonb,
  waiting jsonb default '[]'::jsonb,
  locked boolean default false,
  created_at timestamptz default now()
);

-- 2. Create Players Table
create table if not exists public.players (
  id text primary key,
  name text not null,
  mobile text default '',
  is_admin boolean default false,
  is_guest boolean default false,
  joined_at timestamptz default now()
);

-- 3. Enable Row Level Security (RLS)
alter table public.matches enable row level security;
alter table public.players enable row level security;

-- 4. Create Policies for Matches
drop policy if exists "Allow public read matches" on public.matches;
create policy "Allow public read matches" on public.matches for select using (true);

drop policy if exists "Allow public insert matches" on public.matches;
create policy "Allow public insert matches" on public.matches for insert with check (true);

drop policy if exists "Allow public update matches" on public.matches;
create policy "Allow public update matches" on public.matches for update using (true);

drop policy if exists "Allow public delete matches" on public.matches;
create policy "Allow public delete matches" on public.matches for delete using (true);

-- 5. Create Policies for Players
drop policy if exists "Allow public read players" on public.players;
create policy "Allow public read players" on public.players for select using (true);

drop policy if exists "Allow public insert players" on public.players;
create policy "Allow public insert players" on public.players for insert with check (true);

drop policy if exists "Allow public update players" on public.players;
create policy "Allow public update players" on public.players for update using (true);

drop policy if exists "Allow public delete players" on public.players;
create policy "Allow public delete players" on public.players for delete using (true);

-- 6. Enable Realtime Publications (Safely without throwing duplicate error)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
end $$;

-- 7. Add format and draft columns if table already exists
alter table public.matches add column if not exists format text default 'Turf Match';
alter table public.matches add column if not exists draft jsonb default null;

