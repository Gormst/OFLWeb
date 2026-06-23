create table if not exists public.pickem_picks (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  selected_team_id uuid not null references public.teams(id) on delete cascade,
  predicted_home_score integer check (predicted_home_score >= 0 and predicted_home_score <= 255),
  predicted_away_score integer check (predicted_away_score >= 0 and predicted_away_score <= 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(game_id, profile_id)
);

create index if not exists pickem_picks_game_id_idx on public.pickem_picks(game_id);
create index if not exists pickem_picks_profile_id_idx on public.pickem_picks(profile_id);
create index if not exists pickem_picks_selected_team_id_idx on public.pickem_picks(selected_team_id);

alter table public.pickem_picks
  alter column predicted_home_score drop not null,
  alter column predicted_away_score drop not null;
