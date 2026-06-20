create table if not exists public.league_weeks (
  id uuid primary key default gen_random_uuid(),
  season integer not null default 48,
  week_key text not null,
  label text not null,
  phase text not null default 'regular',
  sort_order integer not null default 0,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_weeks_phase_check check (phase in ('regular', 'playoffs')),
  constraint league_weeks_key_unique unique (season, week_key)
);

create index if not exists league_weeks_sort_idx on public.league_weeks(season, sort_order);

insert into public.league_weeks (season, week_key, label, phase, sort_order)
select 48, week_number::text, 'Week ' || week_number::text, 'regular', week_number
from generate_series(1, 10) as seed(week_number)
on conflict (season, week_key) do update
set label = excluded.label,
    phase = excluded.phase,
    sort_order = excluded.sort_order,
    updated_at = now();
