alter table public.player_awards add column if not exists team_name text;
alter table public.player_awards add column if not exists week text;
alter table public.player_awards add column if not exists award_type text not null default 'season';

create index if not exists player_awards_award_type_idx on public.player_awards(award_type);

create table if not exists public.team_awards (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete set null,
  team_name text,
  season integer,
  week text,
  award_name text,
  award_detail text,
  award_type text not null default 'season',
  awarded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists team_awards_team_id_idx on public.team_awards(team_id);
create index if not exists team_awards_season_idx on public.team_awards(season);
create index if not exists team_awards_award_type_idx on public.team_awards(award_type);
