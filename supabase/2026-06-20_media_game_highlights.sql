alter table public.media_videos
add column if not exists game_id uuid references public.games(id) on delete set null;

alter table public.media_videos
add column if not exists posted_by text;

alter table public.media_articles
add column if not exists posted_by text;

create unique index if not exists media_videos_game_id_unique_idx
on public.media_videos(game_id)
where game_id is not null;

create index if not exists media_videos_game_id_idx
on public.media_videos(game_id);

create index if not exists media_videos_posted_by_idx
on public.media_videos((lower(posted_by)));

create index if not exists media_articles_posted_by_idx
on public.media_articles((lower(posted_by)));

notify pgrst, 'reload schema';
