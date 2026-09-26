-- Persistent execution history for goal tasks.
-- Captures task creation, completion, deferral, skipping and rescheduling
-- so future replanning can learn from actual execution patterns.

create table if not exists public.goal_task_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  goal_id uuid not null references public.goals(id) on delete cascade,
  task_id uuid references public.goal_tasks(id) on delete set null,
  event_type text not null
    check (event_type in ('created','completed','reopened','deferred','skipped','rescheduled','updated')),
  from_status text,
  to_status text,
  from_scheduled_date date,
  to_scheduled_date date,
  from_scheduled_time time,
  to_scheduled_time time,
  occurred_at timestamptz not null default now()
);

create index if not exists goal_task_events_user_time_idx
  on public.goal_task_events(user_id, occurred_at desc);

create index if not exists goal_task_events_goal_time_idx
  on public.goal_task_events(goal_id, occurred_at desc);

create index if not exists goal_task_events_task_time_idx
  on public.goal_task_events(task_id, occurred_at desc)
  where task_id is not null;

grant select on public.goal_task_events to authenticated;
grant all on public.goal_task_events to service_role;

alter table public.goal_task_events enable row level security;

drop policy if exists "Users can view own goal task events" on public.goal_task_events;
create policy "Users can view own goal task events"
on public.goal_task_events for select to authenticated
using (user_id = auth.uid());

create or replace function public.log_goal_task_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event_type text := 'updated';
begin
  if tg_op = 'INSERT' then
    insert into public.goal_task_events (
      user_id,
      goal_id,
      task_id,
      event_type,
      to_status,
      to_scheduled_date,
      to_scheduled_time
    )
    values (
      new.user_id,
      new.goal_id,
      new.id,
      'created',
      new.status,
      new.scheduled_date,
      new.scheduled_time
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    v_event_type :=
      case
        when new.status = 'completed' then 'completed'
        when old.status = 'completed' and new.status = 'planned' then 'reopened'
        when new.status = 'deferred' then 'deferred'
        when new.status = 'skipped' then 'skipped'
        else 'updated'
      end;
  elsif new.scheduled_date is distinct from old.scheduled_date
     or new.scheduled_time is distinct from old.scheduled_time then
    v_event_type := 'rescheduled';
  else
    return new;
  end if;

  insert into public.goal_task_events (
    user_id,
    goal_id,
    task_id,
    event_type,
    from_status,
    to_status,
    from_scheduled_date,
    to_scheduled_date,
    from_scheduled_time,
    to_scheduled_time
  )
  values (
    new.user_id,
    new.goal_id,
    new.id,
    v_event_type,
    old.status,
    new.status,
    old.scheduled_date,
    new.scheduled_date,
    old.scheduled_time,
    new.scheduled_time
  );

  return new;
end;
$function$;

drop trigger if exists log_goal_task_event_insert on public.goal_tasks;
create trigger log_goal_task_event_insert
after insert on public.goal_tasks
for each row execute function public.log_goal_task_event();

drop trigger if exists log_goal_task_event_update on public.goal_tasks;
create trigger log_goal_task_event_update
after update on public.goal_tasks
for each row execute function public.log_goal_task_event();

comment on table public.goal_task_events is
  'Append-only execution history for goal-linked tasks, used by future replanning and execution-pattern analysis.';
