alter table public.teams add column if not exists tier_rank integer;

notify pgrst, 'reload schema';
