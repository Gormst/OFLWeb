create extension if not exists pgcrypto;

create table if not exists public.box_scores (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games(id) on delete set null,
  team1_id uuid references public.teams(id) on delete set null,
  team2_id uuid references public.teams(id) on delete set null,
  team1_name text,
  team2_name text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists box_scores_game_id_idx on public.box_scores(game_id);
create index if not exists box_scores_created_at_idx on public.box_scores(created_at desc);
