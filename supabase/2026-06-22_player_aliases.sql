create table if not exists public.player_aliases (
  id uuid primary key default gen_random_uuid(),
  canonical_username text not null,
  alias_username text not null,
  canonical_key text generated always as (lower(trim(canonical_username))) stored,
  alias_key text generated always as (lower(trim(alias_username))) stored,
  note text not null default 'Formerly known as',
  created_at timestamptz not null default now(),
  constraint player_aliases_distinct_names check (lower(trim(canonical_username)) <> lower(trim(alias_username)))
);

alter table public.player_aliases
add column if not exists canonical_key text generated always as (lower(trim(canonical_username))) stored;

alter table public.player_aliases
add column if not exists alias_key text generated always as (lower(trim(alias_username))) stored;

create unique index if not exists player_aliases_alias_username_key
on public.player_aliases (alias_key);

create index if not exists player_aliases_canonical_username_idx
on public.player_aliases (canonical_key);
