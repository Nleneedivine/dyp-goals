-- Monthly accountability check-ins for the GOALS execution loop.
-- Adds a separate opt-in sharing choice for monthly reflections.

alter table public.accountability_sharing_preferences
  add column if not exists share_monthly_checkins boolean not null default false;

alter table public.accountability_sharing_preferences
  drop constraint if exists accountability_sharing_requires_goal_context;

alter table public.accountability_sharing_preferences
  add constraint accountability_sharing_requires_goal_context
  check (
    (not share_tasks or share_goals)
    and (not share_weekly_reviews or share_goals)
    and (not share_monthly_checkins or share_goals)
  );

create table if not exists public.goal_monthly_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month_start date not null,
  planned_tasks integer not null default 0 check (planned_tasks >= 0),
  completed_tasks integer not null default 0 check (completed_tasks >= 0),
  planned_minutes integer not null default 0 check (planned_minutes >= 0),
  completed_minutes integer not null default 0 check (completed_minutes >= 0),
  milestones_due integer not null default 0 check (milestones_due >= 0),
  milestones_completed integer not null default 0 check (milestones_completed >= 0),
  per_goal_summary jsonb not null default '[]'::jsonb,
  wins text not null default '' check (char_length(wins) <= 6000),
  blockers text not null default '' check (char_length(blockers) <= 6000),
  adjustments text not null default '' check (char_length(adjustments) <= 6000),
  next_month_focus text not null default '' check (char_length(next_month_focus) <= 6000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_monthly_checkins_first_day
    check (extract(day from month_start) = 1),
  constraint goal_monthly_checkins_completed_tasks_valid
    check (completed_tasks <= planned_tasks),
  constraint goal_monthly_checkins_completed_milestones_valid
    check (milestones_completed <= milestones_due),
  unique (user_id, month_start)
);

create index if not exists goal_monthly_checkins_user_month_idx
  on public.goal_monthly_checkins(user_id, month_start desc);

grant select, insert, update, delete on public.goal_monthly_checkins to authenticated;
grant all on public.goal_monthly_checkins to service_role;

alter table public.goal_monthly_checkins enable row level security;

drop policy if exists "Users can view own monthly checkins" on public.goal_monthly_checkins;
create policy "Users can view own monthly checkins"
on public.goal_monthly_checkins
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own monthly checkins" on public.goal_monthly_checkins;
create policy "Users can create own monthly checkins"
on public.goal_monthly_checkins
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own monthly checkins" on public.goal_monthly_checkins;
create policy "Users can update own monthly checkins"
on public.goal_monthly_checkins
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own monthly checkins" on public.goal_monthly_checkins;
create policy "Users can delete own monthly checkins"
on public.goal_monthly_checkins
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "Opted-in mentors can view shared monthly checkins" on public.goal_monthly_checkins;
create policy "Opted-in mentors can view shared monthly checkins"
on public.goal_monthly_checkins
for select to authenticated
using (
  exists (
    select 1
    from public.accountability_sharing_preferences p
    where p.user_id = goal_monthly_checkins.user_id
      and p.share_monthly_checkins
      and public.is_user_accountability_mentor(goal_monthly_checkins.user_id, auth.uid())
  )
);

drop trigger if exists update_goal_monthly_checkins_updated_at on public.goal_monthly_checkins;
create trigger update_goal_monthly_checkins_updated_at
before update on public.goal_monthly_checkins
for each row execute function public.update_updated_at_column();

create or replace function public.save_goal_monthly_checkin(
  p_month_start date,
  p_wins text default '',
  p_blockers text default '',
  p_adjustments text default '',
  p_next_month_focus text default ''
)
returns public.goal_monthly_checkins
language plpgsql
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_month_end date := (p_month_start + interval '1 month' - interval '1 day')::date;
  v_planned_tasks integer := 0;
  v_completed_tasks integer := 0;
  v_planned_minutes integer := 0;
  v_completed_minutes integer := 0;
  v_milestones_due integer := 0;
  v_milestones_completed integer := 0;
  v_per_goal jsonb := '[]'::jsonb;
  v_checkin public.goal_monthly_checkins;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if extract(day from p_month_start) <> 1 then
    raise exception 'Month start must be the first day of a month';
  end if;

  with relevant as (
    select t.*
    from public.goal_tasks t
    where t.user_id = v_user_id
      and t.scheduled_date between p_month_start and v_month_end
      and t.status <> 'skipped'
  )
  select
    count(*)::integer,
    count(*) filter (where status = 'completed')::integer,
    coalesce(sum(estimated_minutes), 0)::integer,
    coalesce(sum(estimated_minutes) filter (where status = 'completed'), 0)::integer
  into
    v_planned_tasks,
    v_completed_tasks,
    v_planned_minutes,
    v_completed_minutes
  from relevant;

  with due as (
    select m.*
    from public.goal_milestones m
    join public.goals g on g.id = m.goal_id
    where g.user_id = v_user_id
      and m.due_date between p_month_start and v_month_end
  )
  select
    count(*)::integer,
    count(*) filter (where status = 'completed')::integer
  into v_milestones_due, v_milestones_completed
  from due;

  with goal_task_stats as (
    select
      g.id as goal_id,
      g.title,
      count(t.*)::integer as planned_tasks,
      count(t.*) filter (where t.status = 'completed')::integer as completed_tasks,
      coalesce(sum(t.estimated_minutes), 0)::integer as planned_minutes,
      coalesce(sum(t.estimated_minutes) filter (where t.status = 'completed'), 0)::integer as completed_minutes
    from public.goals g
    left join public.goal_tasks t
      on t.goal_id = g.id
     and t.user_id = v_user_id
     and t.scheduled_date between p_month_start and v_month_end
     and t.status <> 'skipped'
    where g.user_id = v_user_id
      and g.status <> 'archived'
    group by g.id, g.title
  ),
  goal_milestone_stats as (
    select
      g.id as goal_id,
      count(m.*)::integer as milestones_due,
      count(m.*) filter (where m.status = 'completed')::integer as milestones_completed
    from public.goals g
    left join public.goal_milestones m
      on m.goal_id = g.id
     and m.due_date between p_month_start and v_month_end
    where g.user_id = v_user_id
      and g.status <> 'archived'
    group by g.id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'goalId', t.goal_id,
        'title', t.title,
        'plannedTasks', t.planned_tasks,
        'completedTasks', t.completed_tasks,
        'plannedMinutes', t.planned_minutes,
        'completedMinutes', t.completed_minutes,
        'milestonesDue', coalesce(m.milestones_due, 0),
        'milestonesCompleted', coalesce(m.milestones_completed, 0)
      )
      order by t.title
    ) filter (
      where t.planned_tasks > 0
         or coalesce(m.milestones_due, 0) > 0
    ),
    '[]'::jsonb
  )
  into v_per_goal
  from goal_task_stats t
  left join goal_milestone_stats m on m.goal_id = t.goal_id;

  insert into public.goal_monthly_checkins (
    user_id,
    month_start,
    planned_tasks,
    completed_tasks,
    planned_minutes,
    completed_minutes,
    milestones_due,
    milestones_completed,
    per_goal_summary,
    wins,
    blockers,
    adjustments,
    next_month_focus
  )
  values (
    v_user_id,
    p_month_start,
    v_planned_tasks,
    v_completed_tasks,
    v_planned_minutes,
    v_completed_minutes,
    v_milestones_due,
    v_milestones_completed,
    v_per_goal,
    left(coalesce(p_wins, ''), 6000),
    left(coalesce(p_blockers, ''), 6000),
    left(coalesce(p_adjustments, ''), 6000),
    left(coalesce(p_next_month_focus, ''), 6000)
  )
  on conflict (user_id, month_start)
  do update set
    planned_tasks = excluded.planned_tasks,
    completed_tasks = excluded.completed_tasks,
    planned_minutes = excluded.planned_minutes,
    completed_minutes = excluded.completed_minutes,
    milestones_due = excluded.milestones_due,
    milestones_completed = excluded.milestones_completed,
    per_goal_summary = excluded.per_goal_summary,
    wins = excluded.wins,
    blockers = excluded.blockers,
    adjustments = excluded.adjustments,
    next_month_focus = excluded.next_month_focus,
    updated_at = now()
  returning * into v_checkin;

  return v_checkin;
end;
$function$;

grant execute on function public.save_goal_monthly_checkin(date, text, text, text, text) to authenticated;

comment on table public.goal_monthly_checkins is
  'Monthly execution and milestone snapshot plus user reflection for accountability conversations.';
