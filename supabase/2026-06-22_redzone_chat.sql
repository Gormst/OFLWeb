create table if not exists public.redzone_chat_messages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  roblox_user_id text,
  roblox_username text not null,
  avatar_url text,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.redzone_chat_messages
add column if not exists profile_id uuid references public.user_profiles(id) on delete cascade;
alter table public.redzone_chat_messages add column if not exists roblox_user_id text;
alter table public.redzone_chat_messages add column if not exists roblox_username text;
alter table public.redzone_chat_messages add column if not exists avatar_url text;
alter table public.redzone_chat_messages add column if not exists message text;
alter table public.redzone_chat_messages add column if not exists created_at timestamptz not null default now();

create index if not exists redzone_chat_messages_created_at_idx
on public.redzone_chat_messages(created_at desc);

create index if not exists redzone_chat_messages_profile_id_idx
on public.redzone_chat_messages(profile_id);

create table if not exists public.redzone_chat_blacklist (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  normalized_term text not null unique,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.redzone_chat_blacklist add column if not exists term text;
alter table public.redzone_chat_blacklist add column if not exists normalized_term text;
alter table public.redzone_chat_blacklist add column if not exists created_by uuid references public.user_profiles(id) on delete set null;
alter table public.redzone_chat_blacklist add column if not exists created_at timestamptz not null default now();

create unique index if not exists redzone_chat_blacklist_normalized_term_idx
on public.redzone_chat_blacklist(normalized_term);

create table if not exists public.redzone_chat_mutes (
  id uuid primary key default gen_random_uuid(),
  target_username text not null,
  normalized_username text not null,
  muted_by uuid references public.user_profiles(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.redzone_chat_mutes add column if not exists target_username text;
alter table public.redzone_chat_mutes add column if not exists normalized_username text;
alter table public.redzone_chat_mutes add column if not exists muted_by uuid references public.user_profiles(id) on delete set null;
alter table public.redzone_chat_mutes add column if not exists expires_at timestamptz;
alter table public.redzone_chat_mutes add column if not exists created_at timestamptz not null default now();

create index if not exists redzone_chat_mutes_normalized_username_idx
on public.redzone_chat_mutes(normalized_username);

create index if not exists redzone_chat_mutes_expires_at_idx
on public.redzone_chat_mutes(expires_at);

notify pgrst, 'reload schema';
