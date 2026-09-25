-- Goal Portfolio foundation
-- Stores each goal as a first-class record with its own planning window,
-- milestones, and workload profile.

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_analysis_id uuid references public.goal_analyses(id) on delete set null,
  title text not null check (char_length(title) between 1 and 240),
  description text not null default '' check (char_length(description) <= 8000),
  life_area text not null default 'Other' check (char_length(life_area) between 1 and 80),
  start_date date,
  end_date date,
  priority text not null default 'primary' check (priority in ('primary','maintenance','later')),
  status text not null default 'draft' check (status in ('draft','active','paused','completed','archived')),
  estimated_hours_per_week numeric(6,2) not null default 0 check (estimated_hours_per_week >= 0 and estimated_hours_per_week <= 168),
  success_definition text not null default '' check (char_length(success_definition) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_date_window_valid check (start_date is null or end_date is null or end_date >= start_date)
);

create table if not exists public.goal_milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  due_date date,
  status text not null default 'planned' check (status in ('planned','in_progress','completed')),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goal_effort_periods (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  label text not null default '' check (char_length(label) <= 120),
  start_date date not null,
  end_date date not null,
  hours_per_week numeric(6,2) not null check (hours_per_week >= 0 and hours_per_week <= 168),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_effort_periods_window_valid check (end_date >= start_date)
);

create index if not exists goals_user_status_idx on public.goals(user_id, status);
create index if not exists goals_user_dates_idx on public.goals(user_id, start_date, end_date);
create index if not exists goal_milestones_goal_due_idx on public.goal_milestones(goal_id, due_date);
create index if not exists goal_effort_periods_goal_dates_idx on public.goal_effort_periods(goal_id, start_date, end_date);

grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, update, delete on public.goal_milestones to authenticated;
grant select, insert, update, delete on public.goal_effort_periods to authenticated;
grant all on public.goals to service_role;
grant all on public.goal_milestones to service_role;
grant all on public.goal_effort_periods to service_role;

alter table public.goals enable row level security;
alter table public.goal_milestones enable row level security;
alter table public.goal_effort_periods enable row level security;

create policy "Users can view own goals"
on public.goals for select to authenticated
using (user_id = auth.uid());

create policy "Users can create own goals"
on public.goals for insert to authenticated
with check (user_id = auth.uid());

create policy "Users can update own goals"
on public.goals for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own goals"
on public.goals for delete to authenticated
using (user_id = auth.uid());

create policy "Users can view own goal milestones"
on public.goal_milestones for select to authenticated
using (
  exists (
    select 1 from public.goals g
    where g.id = goal_milestones.goal_id
      and g.user_id = auth.uid()
  )
);

create policy "Users can create own goal milestones"
on public.goal_milestones for insert to authenticated
with check (
  exists (
    select 1 from public.goals g
    where g.id = goal_milestones.goal_id
      and g.user_id = auth.uid()
  )
);

create policy "Users can update own goal milestones"
on public.goal_milestones for update to authenticated
using (
  exists (
    select 1 from public.goals g
    where g.id = goal_milestones.goal_id
      and g.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.goals g
    where g.id = goal_milestones.goal_id
      and g.user_id = auth.uid()
  )
);

create policy "Users can delete own goal milestones"
on public.goal_milestones for delete to authenticated
using (
  exists (
    select 1 from public.goals g
    where g.id = goal_milestones.goal_id
      and g.user_id = auth.uid()
  )
);

create policy "Users can view own goal effort periods"
on public.goal_effort_periods for select to authenticated
using (
  exists (
    select 1 from public.goals g
    where g.id = goal_effort_periods.goal_id
      and g.user_id = auth.uid()
  )
);

create policy "Users can create own goal effort periods"
on public.goal_effort_periods for insert to authenticated
with check (
  exists (
    select 1 from public.goals g
    where g.id = goal_effort_periods.goal_id
      and g.user_id = auth.uid()
  )
);

create policy "Users can update own goal effort periods"
on public.goal_effort_periods for update to authenticated
using (
  exists (
    select 1 from public.goals g
    where g.id = goal_effort_periods.goal_id
      and g.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.goals g
    where g.id = goal_effort_periods.goal_id
      and g.user_id = auth.uid()
  )
);

create policy "Users can delete own goal effort periods"
on public.goal_effort_periods for delete to authenticated
using (
  exists (
    select 1 from public.goals g
    where g.id = goal_effort_periods.goal_id
      and g.user_id = auth.uid()
  )
);

drop trigger if exists update_goals_updated_at on public.goals;
create trigger update_goals_updated_at
before update on public.goals
for each row execute function public.update_updated_at_column();

drop trigger if exists update_goal_milestones_updated_at on public.goal_milestones;
create trigger update_goal_milestones_updated_at
before update on public.goal_milestones
for each row execute function public.update_updated_at_column();

drop trigger if exists update_goal_effort_periods_updated_at on public.goal_effort_periods;
create trigger update_goal_effort_periods_updated_at
before update on public.goal_effort_periods
for each row execute function public.update_updated_at_column();
