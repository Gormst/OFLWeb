alter table public.user_profiles
add column if not exists theme_preference text not null default 'light';

alter table public.user_profiles
drop constraint if exists user_profiles_theme_preference_check;

alter table public.user_profiles
add constraint user_profiles_theme_preference_check
check (theme_preference in ('light', 'dark'));
