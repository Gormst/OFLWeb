create table if not exists public.roblox_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  roblox_user_id text not null,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_type text,
  scope text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id),
  unique(roblox_user_id)
);

alter table public.roblox_oauth_tokens
add column if not exists profile_id uuid references public.user_profiles(id) on delete cascade;

alter table public.roblox_oauth_tokens
add column if not exists roblox_user_id text;

alter table public.roblox_oauth_tokens
add column if not exists access_token_ciphertext text;

alter table public.roblox_oauth_tokens
add column if not exists refresh_token_ciphertext text;

alter table public.roblox_oauth_tokens
add column if not exists token_type text;

alter table public.roblox_oauth_tokens
add column if not exists scope text;

alter table public.roblox_oauth_tokens
add column if not exists expires_at timestamptz;

alter table public.roblox_oauth_tokens
add column if not exists created_at timestamptz not null default now();

alter table public.roblox_oauth_tokens
add column if not exists updated_at timestamptz not null default now();

create unique index if not exists roblox_oauth_tokens_profile_id_key
on public.roblox_oauth_tokens(profile_id);

create unique index if not exists roblox_oauth_tokens_roblox_user_id_key
on public.roblox_oauth_tokens(roblox_user_id);

create index if not exists roblox_oauth_tokens_expires_at_idx
on public.roblox_oauth_tokens(expires_at);

notify pgrst, 'reload schema';
