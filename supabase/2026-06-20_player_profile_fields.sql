alter table public.players
add column if not exists offensive_position text,
add column if not exists defensive_position text,
add column if not exists jersey_number integer;

alter table public.players
drop constraint if exists players_offensive_position_check;

alter table public.players
add constraint players_offensive_position_check
check (offensive_position is null or offensive_position in ('QB', 'RB', 'WR', 'TE', 'OL', 'K', 'P', 'ATH'));

alter table public.players
drop constraint if exists players_defensive_position_check;

alter table public.players
add constraint players_defensive_position_check
check (defensive_position is null or defensive_position in ('DL', 'LB', 'CB', 'S', 'ATH'));

alter table public.players
drop constraint if exists players_jersey_number_check;

alter table public.players
add constraint players_jersey_number_check
check (jersey_number is null or (jersey_number >= 0 and jersey_number <= 99));
