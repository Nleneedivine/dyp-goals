-- Atomic application of an AI/manual weekly execution plan.

create or replace function public.apply_goal_week_plan(
  p_week_start date,
  p_actions jsonb
)
returns table(actions_created integer, tasks_created integer)
language plpgsql
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_week_end date := p_week_start + 6;
  v_action jsonb;
  v_task jsonb;
  v_action_id uuid;
  v_goal_id uuid;
  v_milestone_id uuid;
  v_actions_created integer := 0;
  v_tasks_created integer := 0;
  v_action_index integer := 0;
  v_task_index integer := 0;
  v_task_date date;
  v_task_time time;
  v_estimated_minutes integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if extract(isodow from p_week_start) <> 1 then
    raise exception 'Week start must be a Monday';
  end if;

  if p_actions is null or jsonb_typeof(p_actions) <> 'array' then
    raise exception 'Actions must be a JSON array';
  end if;

  if jsonb_array_length(p_actions) > 50 then
    raise exception 'A weekly plan may contain at most 50 actions';
  end if;

  for v_action in select value from jsonb_array_elements(p_actions)
  loop
    v_action_index := v_action_index + 1;

    if coalesce(length(trim(v_action->>'title')), 0) = 0 then
      raise exception 'Every weekly action needs a title';
    end if;

    v_goal_id := nullif(v_action->>'goalId', '')::uuid;
    if v_goal_id is null then
      raise exception 'Every weekly action must reference a goal';
    end if;

    if not exists (
      select 1
      from public.goals g
      where g.id = v_goal_id
        and g.user_id = v_user_id
    ) then
      raise exception 'Weekly action references a goal that does not belong to the user';
    end if;

    v_milestone_id := nullif(v_action->>'milestoneId', '')::uuid;
    if v_milestone_id is not null and not exists (
      select 1
      from public.goal_milestones m
      where m.id = v_milestone_id
        and m.goal_id = v_goal_id
    ) then
      raise exception 'Weekly action milestone does not belong to the selected goal';
    end if;

    v_estimated_minutes := coalesce((v_action->>'estimatedMinutes')::integer, 0);
    if v_estimated_minutes < 0 or v_estimated_minutes > 10080 then
      raise exception 'Weekly action effort is out of range';
    end if;

    insert into public.goal_weekly_actions (
      user_id,
      goal_id,
      milestone_id,
      title,
      week_start,
      estimated_minutes,
      notes,
      display_order
    )
    values (
      v_user_id,
      v_goal_id,
      v_milestone_id,
      trim(v_action->>'title'),
      p_week_start,
      v_estimated_minutes,
      left(coalesce(v_action->>'notes', ''), 4000),
      v_action_index - 1
    )
    returning id into v_action_id;

    v_actions_created := v_actions_created + 1;

    if jsonb_typeof(coalesce(v_action->'tasks', '[]'::jsonb)) <> 'array' then
      raise exception 'Weekly action tasks must be a JSON array';
    end if;

    if jsonb_array_length(coalesce(v_action->'tasks', '[]'::jsonb)) > 50 then
      raise exception 'A weekly action may contain at most 50 tasks';
    end if;

    v_task_index := 0;
    for v_task in
      select value from jsonb_array_elements(coalesce(v_action->'tasks', '[]'::jsonb))
    loop
      v_task_index := v_task_index + 1;

      if coalesce(length(trim(v_task->>'title')), 0) = 0 then
        raise exception 'Every task needs a title';
      end if;

      v_task_date := nullif(v_task->>'scheduledDate', '')::date;
      if v_task_date is null or v_task_date < p_week_start or v_task_date > v_week_end then
        raise exception 'Every task date must fall inside the selected week';
      end if;

      v_task_time := nullif(v_task->>'scheduledTime', '')::time;
      v_estimated_minutes := coalesce((v_task->>'estimatedMinutes')::integer, 0);

      if v_estimated_minutes < 0 or v_estimated_minutes > 1440 then
        raise exception 'Task duration is out of range';
      end if;

      insert into public.goal_tasks (
        user_id,
        goal_id,
        milestone_id,
        weekly_action_id,
        title,
        scheduled_date,
        scheduled_time,
        estimated_minutes,
        notes,
        display_order
      )
      values (
        v_user_id,
        v_goal_id,
        v_milestone_id,
        v_action_id,
        trim(v_task->>'title'),
        v_task_date,
        v_task_time,
        v_estimated_minutes,
        left(coalesce(v_task->>'notes', ''), 4000),
        v_task_index - 1
      );

      v_tasks_created := v_tasks_created + 1;
    end loop;
  end loop;

  return query
  select v_actions_created, v_tasks_created;
end;
$function$;

grant execute on function public.apply_goal_week_plan(date, jsonb) to authenticated;

comment on function public.apply_goal_week_plan(date, jsonb) is
  'Atomically saves a reviewed weekly plan and all linked tasks for the authenticated user.';
