alter table public.games add column if not exists tier integer;

notify pgrst, 'reload schema';
