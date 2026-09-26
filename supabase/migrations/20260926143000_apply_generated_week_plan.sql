-- Atomic application of a reviewed generated week plan.

create or replace function public.apply_generated_week_plan(
  p_week_start date,
  p_actions jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_week_end date := p_week_start + 6;
  v_action jsonb;
  v_task jsonb;
  v_goal_id uuid;
  v_milestone_id uuid;
  v_action_id uuid;
  v_task_date date;
  v_action_count integer := 0;
  v_task_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if extract(isodow from p_week_start) <> 1 then
    raise exception 'Week start must be a Monday';
  end if;

  if jsonb_typeof(p_actions) <> 'array' then
    raise exception 'Actions must be a JSON array';
  end if;

  if jsonb_array_length(p_actions) > 40 then
    raise exception 'A generated week plan cannot contain more than 40 weekly actions';
  end if;

  for v_action in select value from jsonb_array_elements(p_actions)
  loop
    v_goal_id := nullif(v_action->>'goalId', '')::uuid;
    v_milestone_id := nullif(v_action->>'milestoneId', '')::uuid;

    if not exists (
      select 1
      from public.goals g
      where g.id = v_goal_id
        and g.user_id = v_user_id
        and g.status in ('draft','active')
        and g.effort_source in ('user_confirmed','ai_estimate_confirmed')
    ) then
      raise exception 'Generated action references an unavailable or unconfirmed goal';
    end if;

    if v_milestone_id is not null and not exists (
      select 1
      from public.goal_milestones m
      where m.id = v_milestone_id
        and m.goal_id = v_goal_id
    ) then
      raise exception 'Generated action milestone does not belong to its goal';
    end if;

    if char_length(trim(coalesce(v_action->>'title', ''))) < 1
       or char_length(trim(coalesce(v_action->>'title', ''))) > 240 then
      raise exception 'Generated action title is invalid';
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
      greatest(0, least(10080, coalesce((v_action->>'estimatedMinutes')::integer, 0))),
      left(coalesce(v_action->>'notes', ''), 4000),
      v_action_count
    )
    returning id into v_action_id;

    v_action_count := v_action_count + 1;

    if jsonb_typeof(coalesce(v_action->'tasks', '[]'::jsonb)) <> 'array' then
      raise exception 'Generated action tasks must be a JSON array';
    end if;

    if jsonb_array_length(coalesce(v_action->'tasks', '[]'::jsonb)) > 30 then
      raise exception 'A generated weekly action cannot contain more than 30 tasks';
    end if;

    for v_task in
      select value
      from jsonb_array_elements(coalesce(v_action->'tasks', '[]'::jsonb))
    loop
      v_task_date := nullif(v_task->>'scheduledDate', '')::date;

      if v_task_date is null
         or v_task_date < p_week_start
         or v_task_date > v_week_end then
        raise exception 'Generated task date must fall inside the selected week';
      end if;

      if char_length(trim(coalesce(v_task->>'title', ''))) < 1
         or char_length(trim(coalesce(v_task->>'title', ''))) > 240 then
        raise exception 'Generated task title is invalid';
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
        null,
        greatest(0, least(1440, coalesce((v_task->>'estimatedMinutes')::integer, 0))),
        left(coalesce(v_task->>'notes', ''), 4000),
        v_task_count
      );

      v_task_count := v_task_count + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'actionsCreated', v_action_count,
    'tasksCreated', v_task_count
  );
end;
$function$;

grant execute on function public.apply_generated_week_plan(date, jsonb) to authenticated;

comment on function public.apply_generated_week_plan(date, jsonb) is
  'Atomically saves a user-reviewed generated week plan while validating goal and milestone ownership.';
