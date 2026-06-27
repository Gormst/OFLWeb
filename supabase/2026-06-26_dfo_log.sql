alter table public.teams add column if not exists dfo_graphics_posted integer not null default 0;
alter table public.teams add column if not exists dfo_statements_posted integer not null default 0;

notify pgrst, 'reload schema';
