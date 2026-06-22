alter table public.games
add column if not exists twitch_url text;

notify pgrst, 'reload schema';
