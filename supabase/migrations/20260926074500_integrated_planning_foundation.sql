-- Integrated planning foundation
-- Adds persistent weekly actions and daily tasks with full goal/milestone lineage.

create table if not exists public.goal_weekly_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  goal_id uuid not null references public.goals(id) on delete cascade,
  milestone_id uuid references public.goal_milestones(id) on delete set null,
  title text not null check (char_length(title) between 1 and 240),
  week_start date not null,
  status text not null default 'planned'
    check (status in ('planned','in_progress','completed','deferred','skipped')),
  estimated_minutes integer not null default 0
    check (estimated_minutes >= 0 and estimated_minutes <= 10080),
  notes text not null default '' check (char_length(notes) <= 4000),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_weekly_actions_monday_start
    check (extract(isodow from week_start) = 1)
);

create table if not exists public.goal_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  goal_id uuid not null references public.goals(id) on delete cascade,
  milestone_id uuid references public.goal_milestones(id) on delete set null,
  weekly_action_id uuid references public.goal_weekly_actions(id) on delete set null,
  title text not null check (char_length(title) between 1 and 240),
  scheduled_date date,
  scheduled_time time,
  estimated_minutes integer not null default 0
    check (estimated_minutes >= 0 and estimated_minutes <= 1440),
  status text not null default 'planned'
    check (status in ('planned','completed','deferred','skipped')),
  completed_at timestamptz,
  deferred_from_date date,
  notes text not null default '' check (char_length(notes) <= 4000),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goal_weekly_actions_user_week_idx
  on public.goal_weekly_actions(user_id, week_start, status);

create index if not exists goal_weekly_actions_goal_week_idx
  on public.goal_weekly_actions(goal_id, week_start);

create index if not exists goal_tasks_user_date_idx
  on public.goal_tasks(user_id, scheduled_date, status);

create index if not exists goal_tasks_goal_date_idx
  on public.goal_tasks(goal_id, scheduled_date);

create index if not exists goal_tasks_weekly_action_idx
  on public.goal_tasks(weekly_action_id);

grant select, insert, update, delete on public.goal_weekly_actions to authenticated;
grant select, insert, update, delete on public.goal_tasks to authenticated;
grant all on public.goal_weekly_actions to service_role;
grant all on public.goal_tasks to service_role;

alter table public.goal_weekly_actions enable row level security;
alter table public.goal_tasks enable row level security;

drop policy if exists "Users can view own weekly goal actions" on public.goal_weekly_actions;
create policy "Users can view own weekly goal actions"
on public.goal_weekly_actions for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own weekly goal actions" on public.goal_weekly_actions;
create policy "Users can create own weekly goal actions"
on public.goal_weekly_actions for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own weekly goal actions" on public.goal_weekly_actions;
create policy "Users can update own weekly goal actions"
on public.goal_weekly_actions for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own weekly goal actions" on public.goal_weekly_actions;
create policy "Users can delete own weekly goal actions"
on public.goal_weekly_actions for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can view own goal tasks" on public.goal_tasks;
create policy "Users can view own goal tasks"
on public.goal_tasks for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own goal tasks" on public.goal_tasks;
create policy "Users can create own goal tasks"
on public.goal_tasks for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own goal tasks" on public.goal_tasks;
create policy "Users can update own goal tasks"
on public.goal_tasks for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own goal tasks" on public.goal_tasks;
create policy "Users can delete own goal tasks"
on public.goal_tasks for delete to authenticated
using (user_id = auth.uid());

create or replace function public.validate_goal_planning_lineage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.goals g
    where g.id = new.goal_id
      and g.user_id = new.user_id
  ) then
    raise exception 'Goal does not belong to this planning user';
  end if;

  if new.milestone_id is not null and not exists (
    select 1
    from public.goal_milestones m
    where m.id = new.milestone_id
      and m.goal_id = new.goal_id
  ) then
    raise exception 'Milestone must belong to the selected goal';
  end if;

  if tg_table_name = 'goal_tasks'
     and new.weekly_action_id is not null
     and not exists (
       select 1
       from public.goal_weekly_actions a
       where a.id = new.weekly_action_id
         and a.goal_id = new.goal_id
         and a.user_id = new.user_id
     ) then
    raise exception 'Weekly action must belong to the selected goal and user';
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_goal_weekly_action_lineage on public.goal_weekly_actions;
create trigger validate_goal_weekly_action_lineage
before insert or update on public.goal_weekly_actions
for each row execute function public.validate_goal_planning_lineage();

drop trigger if exists validate_goal_task_lineage on public.goal_tasks;
create trigger validate_goal_task_lineage
before insert or update on public.goal_tasks
for each row execute function public.validate_goal_planning_lineage();

drop trigger if exists update_goal_weekly_actions_updated_at on public.goal_weekly_actions;
create trigger update_goal_weekly_actions_updated_at
before update on public.goal_weekly_actions
for each row execute function public.update_updated_at_column();

drop trigger if exists update_goal_tasks_updated_at on public.goal_tasks;
create trigger update_goal_tasks_updated_at
before update on public.goal_tasks
for each row execute function public.update_updated_at_column();

comment on table public.goal_weekly_actions is
  'Weekly execution commitments that preserve lineage to a goal and optional milestone.';

comment on table public.goal_tasks is
  'Daily executable tasks linked to goals, milestones, and optional weekly actions.';
