create extension if not exists pgcrypto;

create table if not exists public.discord_transactions (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('signed', 'released', 'traded')),
  player_id text,
  player_name text,
  team_name text not null,
  team_id uuid references public.teams(id) on delete set null,
  salary bigint,
  clauses jsonb,
  event_timestamp timestamptz not null,
  raw_payload jsonb not null default '{}'::jsonb,
  roster_move_id uuid references public.roster_moves(id) on delete set null,
  status text not null default 'processed' check (status in ('processed', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists discord_transactions_event_type_idx on public.discord_transactions(event_type);
create index if not exists discord_transactions_player_id_idx on public.discord_transactions(player_id);
create index if not exists discord_transactions_team_id_idx on public.discord_transactions(team_id);
create index if not exists discord_transactions_event_timestamp_idx on public.discord_transactions(event_timestamp desc);
