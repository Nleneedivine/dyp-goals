-- Persistent weekly review snapshots for the execution loop.

create table if not exists public.goal_weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  week_start date not null,
  planned_tasks integer not null default 0 check (planned_tasks >= 0),
  completed_tasks integer not null default 0 check (completed_tasks >= 0),
  planned_minutes integer not null default 0 check (planned_minutes >= 0),
  completed_minutes integer not null default 0 check (completed_minutes >= 0),
  per_goal_summary jsonb not null default '[]'::jsonb,
  wins text not null default '' check (char_length(wins) <= 6000),
  blockers text not null default '' check (char_length(blockers) <= 6000),
  adjustments text not null default '' check (char_length(adjustments) <= 6000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_weekly_reviews_monday_start
    check (extract(isodow from week_start) = 1),
  constraint goal_weekly_reviews_completed_task_count_valid
    check (completed_tasks <= planned_tasks)
);

create unique index if not exists goal_weekly_reviews_user_week_uidx
  on public.goal_weekly_reviews(user_id, week_start);

grant select, insert, update, delete on public.goal_weekly_reviews to authenticated;
grant all on public.goal_weekly_reviews to service_role;

alter table public.goal_weekly_reviews enable row level security;

drop policy if exists "Users can view own weekly reviews" on public.goal_weekly_reviews;
create policy "Users can view own weekly reviews"
on public.goal_weekly_reviews for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own weekly reviews" on public.goal_weekly_reviews;
create policy "Users can create own weekly reviews"
on public.goal_weekly_reviews for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own weekly reviews" on public.goal_weekly_reviews;
create policy "Users can update own weekly reviews"
on public.goal_weekly_reviews for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own weekly reviews" on public.goal_weekly_reviews;
create policy "Users can delete own weekly reviews"
on public.goal_weekly_reviews for delete to authenticated
using (user_id = auth.uid());

drop trigger if exists update_goal_weekly_reviews_updated_at on public.goal_weekly_reviews;
create trigger update_goal_weekly_reviews_updated_at
before update on public.goal_weekly_reviews
for each row execute function public.update_updated_at_column();

create or replace function public.save_goal_weekly_review(
  p_week_start date,
  p_wins text default '',
  p_blockers text default '',
  p_adjustments text default ''
)
returns public.goal_weekly_reviews
language plpgsql
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_week_end date := p_week_start + 6;
  v_planned_tasks integer := 0;
  v_completed_tasks integer := 0;
  v_planned_minutes integer := 0;
  v_completed_minutes integer := 0;
  v_per_goal jsonb := '[]'::jsonb;
  v_review public.goal_weekly_reviews;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if extract(isodow from p_week_start) <> 1 then
    raise exception 'Week start must be a Monday';
  end if;

  with relevant as (
    select t.*
    from public.goal_tasks t
    where t.user_id = v_user_id
      and (
        (t.scheduled_date between p_week_start and v_week_end)
        or
        (t.deferred_from_date between p_week_start and v_week_end)
      )
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

  with relevant as (
    select t.*
    from public.goal_tasks t
    where t.user_id = v_user_id
      and (
        (t.scheduled_date between p_week_start and v_week_end)
        or
        (t.deferred_from_date between p_week_start and v_week_end)
      )
  ),
  grouped as (
    select
      g.id as goal_id,
      g.title,
      count(r.*)::integer as planned_tasks,
      count(r.*) filter (where r.status = 'completed')::integer as completed_tasks,
      coalesce(sum(r.estimated_minutes), 0)::integer as planned_minutes,
      coalesce(sum(r.estimated_minutes) filter (where r.status = 'completed'), 0)::integer as completed_minutes
    from relevant r
    join public.goals g
      on g.id = r.goal_id
     and g.user_id = v_user_id
    group by g.id, g.title
    order by g.title
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'goalId', goal_id,
        'title', title,
        'plannedTasks', planned_tasks,
        'completedTasks', completed_tasks,
        'plannedMinutes', planned_minutes,
        'completedMinutes', completed_minutes
      )
    ),
    '[]'::jsonb
  )
  into v_per_goal
  from grouped;

  insert into public.goal_weekly_reviews (
    user_id,
    week_start,
    planned_tasks,
    completed_tasks,
    planned_minutes,
    completed_minutes,
    per_goal_summary,
    wins,
    blockers,
    adjustments
  )
  values (
    v_user_id,
    p_week_start,
    v_planned_tasks,
    v_completed_tasks,
    v_planned_minutes,
    v_completed_minutes,
    v_per_goal,
    left(coalesce(p_wins, ''), 6000),
    left(coalesce(p_blockers, ''), 6000),
    left(coalesce(p_adjustments, ''), 6000)
  )
  on conflict (user_id, week_start)
  do update set
    planned_tasks = excluded.planned_tasks,
    completed_tasks = excluded.completed_tasks,
    planned_minutes = excluded.planned_minutes,
    completed_minutes = excluded.completed_minutes,
    per_goal_summary = excluded.per_goal_summary,
    wins = excluded.wins,
    blockers = excluded.blockers,
    adjustments = excluded.adjustments,
    updated_at = now()
  returning * into v_review;

  return v_review;
end;
$function$;

grant execute on function public.save_goal_weekly_review(date, text, text, text) to authenticated;

comment on table public.goal_weekly_reviews is
  'Weekly execution snapshots plus user reflection, used for future replanning and under-execution trend detection.';