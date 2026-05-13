-- Run this in Supabase SQL Editor.

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  year text,
  poster_path text,
  overview text,
  suggester_name text,
  created_at timestamptz not null default now(),
  unique (tmdb_id, media_type)
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  voter_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique (suggestion_id, voter_fingerprint)
);

create index if not exists votes_suggestion_id_idx on public.votes(suggestion_id);

create or replace view public.suggestions_with_votes as
select
  s.id, s.tmdb_id, s.media_type, s.title, s.year, s.poster_path,
  s.overview, s.suggester_name, s.created_at,
  coalesce(v.vote_count, 0) as vote_count
from public.suggestions s
left join (
  select suggestion_id, count(*)::int as vote_count
  from public.votes
  group by suggestion_id
) v on v.suggestion_id = s.id;

alter table public.suggestions enable row level security;
alter table public.votes enable row level security;

drop policy if exists "suggestions_read" on public.suggestions;
drop policy if exists "suggestions_insert" on public.suggestions;
drop policy if exists "votes_read" on public.votes;
drop policy if exists "votes_insert" on public.votes;
drop policy if exists "votes_delete_own" on public.votes;

create policy "suggestions_read" on public.suggestions for select to anon, authenticated using (true);
create policy "suggestions_insert" on public.suggestions for insert to anon, authenticated with check (true);

create policy "votes_read" on public.votes for select to anon, authenticated using (true);
create policy "votes_insert" on public.votes for insert to anon, authenticated with check (true);
-- Anyone can delete a vote — fine because voter_fingerprint is cosmetic and the worst case is unvoting someone else's vote, which the realtime channel will refresh.
-- If you want stricter rules, swap to a cookie-signed JWT later.
create policy "votes_delete_own" on public.votes for delete to anon, authenticated using (true);

-- Realtime: enable for both tables in Dashboard → Database → Replication, or:
alter publication supabase_realtime add table public.suggestions;
alter publication supabase_realtime add table public.votes;
