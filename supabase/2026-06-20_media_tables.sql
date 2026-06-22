create table if not exists public.media_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  youtube_url text not null,
  youtube_id text not null,
  description text,
  week_tag text,
  team_tag text,
  posted_by text,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.media_videos add column if not exists title text;
alter table public.media_videos add column if not exists youtube_url text;
alter table public.media_videos add column if not exists youtube_id text;
alter table public.media_videos add column if not exists description text;
alter table public.media_videos add column if not exists week_tag text;
alter table public.media_videos add column if not exists team_tag text;
alter table public.media_videos add column if not exists posted_by text;
alter table public.media_videos add column if not exists published_at timestamptz not null default now();
alter table public.media_videos add column if not exists created_at timestamptz not null default now();

create table if not exists public.media_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  author text,
  thumbnail_url text,
  posted_by text,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.media_articles add column if not exists title text;
alter table public.media_articles add column if not exists body text;
alter table public.media_articles add column if not exists author text;
alter table public.media_articles add column if not exists thumbnail_url text;
alter table public.media_articles add column if not exists posted_by text;
alter table public.media_articles add column if not exists published_at timestamptz not null default now();
alter table public.media_articles add column if not exists created_at timestamptz not null default now();

create index if not exists media_videos_published_at_idx on public.media_videos(published_at desc);
create index if not exists media_videos_posted_by_idx on public.media_videos(lower(posted_by));
create index if not exists media_articles_published_at_idx on public.media_articles(published_at desc);
create index if not exists media_articles_posted_by_idx on public.media_articles(lower(posted_by));

notify pgrst, 'reload schema';
