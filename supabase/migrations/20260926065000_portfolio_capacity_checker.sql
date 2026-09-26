-- Portfolio capacity checker
-- Stores a user's normal weekly goal-work capacity and optional date-specific overrides.

create table if not exists public.goal_capacity_settings (
  user_id uuid primary key,
  default_hours_per_week numeric(6,2) not null default 0
    check (default_hours_per_week >= 0 and default_hours_per_week <= 168),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goal_capacity_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  label text not null default '' check (char_length(label) <= 120),
  start_date date not null,
  end_date date not null,
  hours_per_week numeric(6,2) not null
    check (hours_per_week >= 0 and hours_per_week <= 168),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_capacity_periods_window_valid check (end_date >= start_date)
);

create index if not exists goal_capacity_periods_user_dates_idx
  on public.goal_capacity_periods(user_id, start_date, end_date);

grant select, insert, update, delete on public.goal_capacity_settings to authenticated;
grant select, insert, update, delete on public.goal_capacity_periods to authenticated;
grant all on public.goal_capacity_settings to service_role;
grant all on public.goal_capacity_periods to service_role;

alter table public.goal_capacity_settings enable row level security;
alter table public.goal_capacity_periods enable row level security;

drop policy if exists "Users can view own goal capacity settings" on public.goal_capacity_settings;
create policy "Users can view own goal capacity settings"
on public.goal_capacity_settings for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own goal capacity settings" on public.goal_capacity_settings;
create policy "Users can create own goal capacity settings"
on public.goal_capacity_settings for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own goal capacity settings" on public.goal_capacity_settings;
create policy "Users can update own goal capacity settings"
on public.goal_capacity_settings for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own goal capacity settings" on public.goal_capacity_settings;
create policy "Users can delete own goal capacity settings"
on public.goal_capacity_settings for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can view own goal capacity periods" on public.goal_capacity_periods;
create policy "Users can view own goal capacity periods"
on public.goal_capacity_periods for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own goal capacity periods" on public.goal_capacity_periods;
create policy "Users can create own goal capacity periods"
on public.goal_capacity_periods for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own goal capacity periods" on public.goal_capacity_periods;
create policy "Users can update own goal capacity periods"
on public.goal_capacity_periods for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own goal capacity periods" on public.goal_capacity_periods;
create policy "Users can delete own goal capacity periods"
on public.goal_capacity_periods for delete to authenticated
using (user_id = auth.uid());

create or replace function public.prevent_overlapping_goal_capacity_periods()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if exists (
    select 1
    from public.goal_capacity_periods p
    where p.user_id = new.user_id
      and p.id <> new.id
      and p.start_date <= new.end_date
      and p.end_date >= new.start_date
  ) then
    raise exception 'Goal capacity periods cannot overlap';
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_goal_capacity_period_overlap on public.goal_capacity_periods;
create trigger prevent_goal_capacity_period_overlap
before insert or update on public.goal_capacity_periods
for each row execute function public.prevent_overlapping_goal_capacity_periods();

drop trigger if exists update_goal_capacity_settings_updated_at on public.goal_capacity_settings;
create trigger update_goal_capacity_settings_updated_at
before update on public.goal_capacity_settings
for each row execute function public.update_updated_at_column();

drop trigger if exists update_goal_capacity_periods_updated_at on public.goal_capacity_periods;
create trigger update_goal_capacity_periods_updated_at
before update on public.goal_capacity_periods
for each row execute function public.update_updated_at_column();

comment on table public.goal_capacity_settings is
  'Default weekly hours a user is willing to devote to goal execution across the portfolio.';

comment on table public.goal_capacity_periods is
  'Optional date-specific overrides to a user''s normal weekly goal-work capacity.';
