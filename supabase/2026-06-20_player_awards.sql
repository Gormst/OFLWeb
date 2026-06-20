create table if not exists public.player_awards (
  id uuid primary key default gen_random_uuid(),
  player_username text,
  roblox_user_id text,
  season integer,
  award_name text,
  award_detail text,
  team_id uuid references public.teams(id) on delete set null,
  awarded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.player_awards add column if not exists player_username text;
alter table public.player_awards add column if not exists roblox_user_id text;
alter table public.player_awards add column if not exists season integer;
alter table public.player_awards add column if not exists award_name text;
alter table public.player_awards add column if not exists award_detail text;
alter table public.player_awards add column if not exists team_id uuid references public.teams(id) on delete set null;
alter table public.player_awards add column if not exists awarded_at timestamptz not null default now();
alter table public.player_awards add column if not exists created_at timestamptz not null default now();

create index if not exists player_awards_username_idx on public.player_awards((lower(player_username)));
create index if not exists player_awards_roblox_user_id_idx on public.player_awards(roblox_user_id);
create index if not exists player_awards_season_idx on public.player_awards(season);
