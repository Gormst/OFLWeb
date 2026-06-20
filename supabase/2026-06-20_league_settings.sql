create table if not exists public.league_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

