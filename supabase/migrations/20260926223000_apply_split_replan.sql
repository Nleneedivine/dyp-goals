-- Atomically replace one missed/deferred task with smaller user-approved split tasks.

create or replace function public.apply_split_replan(
  p_task_id uuid,
  p_splits jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_original public.goal_tasks;
  v_goal public.goals;
  v_item jsonb;
  v_title text;
  v_minutes integer;
  v_date date;
  v_total_minutes integer := 0;
  v_created_ids uuid[] := '{}';
  v_new_id uuid;
  v_week_start date;
  v_week_end date;
  v_capacity_hours numeric;
  v_goal_hours numeric;
  v_existing_week_minutes integer;
  v_existing_goal_week_minutes integer;
  v_incoming_week_minutes integer;
  v_incoming_goal_week_minutes integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_splits) <> 'array' then
    raise exception 'Split tasks must be a JSON array';
  end if;

  if jsonb_array_length(p_splits) < 2 or jsonb_array_length(p_splits) > 6 then
    raise exception 'Split replan must contain between 2 and 6 tasks';
  end if;

  select *
  into v_original
  from public.goal_tasks
  where id = p_task_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Task not found';
  end if;

  if v_original.status not in ('planned','deferred') then
    raise exception 'Only planned or deferred tasks can be split';
  end if;

  select *
  into v_goal
  from public.goals
  where id = v_original.goal_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Goal not found';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_splits)
  loop
    v_title := trim(coalesce(v_item->>'title', ''));
    v_minutes := coalesce((v_item->>'estimatedMinutes')::integer, 0);
    v_date := nullif(v_item->>'suggestedDate', '')::date;

    if char_length(v_title) < 1 or char_length(v_title) > 240 then
      raise exception 'Split task title is invalid';
    end if;

    if v_minutes < 5 or v_minutes > 1440 then
      raise exception 'Split task duration is invalid';
    end if;

    if v_date is null or v_date < current_date then
      raise exception 'Split task date must be today or later';
    end if;

    if v_goal.start_date is not null and v_date < v_goal.start_date then
      raise exception 'Split task date cannot be before the goal start date';
    end if;

    if v_goal.end_date is not null and v_date > v_goal.end_date then
      raise exception 'Split task date cannot be after the goal deadline';
    end if;

    v_total_minutes := v_total_minutes + v_minutes;
  end loop;

  if v_original.estimated_minutes > 0
     and abs(v_total_minutes - v_original.estimated_minutes) > 30 then
    raise exception 'Split tasks must preserve the original task workload within 30 minutes';
  end if;

  -- Validate each destination week against user capacity and the goal's confirmed weekly workload.
  for v_week_start in
    select distinct date_trunc('week', (value->>'suggestedDate')::date)::date
    from jsonb_array_elements(p_splits)
  loop
    v_week_end := v_week_start + 6;

    select coalesce(
      (
        select cp.hours_per_week
        from public.goal_capacity_periods cp
        where cp.user_id = v_user_id
          and cp.start_date <= v_week_end
          and cp.end_date >= v_week_start
        order by cp.start_date
        limit 1
      ),
      (
        select cs.default_hours_per_week
        from public.goal_capacity_settings cs
        where cs.user_id = v_user_id
      )
    )
    into v_capacity_hours;

    select coalesce(sum(t.estimated_minutes), 0)::integer
    into v_existing_week_minutes
    from public.goal_tasks t
    where t.user_id = v_user_id
      and t.id <> v_original.id
      and t.scheduled_date between v_week_start and v_week_end
      and t.status in ('planned','completed');

    select coalesce(sum((value->>'estimatedMinutes')::integer), 0)::integer
    into v_incoming_week_minutes
    from jsonb_array_elements(p_splits)
    where (value->>'suggestedDate')::date between v_week_start and v_week_end;

    if v_capacity_hours is not null
       and v_existing_week_minutes + v_incoming_week_minutes > round(v_capacity_hours * 60) then
      raise exception 'Split replan would exceed confirmed weekly capacity';
    end if;

    select coalesce(
      (
        select ep.hours_per_week
        from public.goal_effort_periods ep
        where ep.goal_id = v_goal.id
          and ep.start_date <= v_week_end
          and ep.end_date >= v_week_start
        order by ep.start_date
        limit 1
      ),
      v_goal.estimated_hours_per_week
    )
    into v_goal_hours;

    select coalesce(sum(t.estimated_minutes), 0)::integer
    into v_existing_goal_week_minutes
    from public.goal_tasks t
    where t.user_id = v_user_id
      and t.goal_id = v_goal.id
      and t.id <> v_original.id
      and t.scheduled_date between v_week_start and v_week_end
      and t.status in ('planned','completed');

    select coalesce(sum((value->>'estimatedMinutes')::integer), 0)::integer
    into v_incoming_goal_week_minutes
    from jsonb_array_elements(p_splits)
    where (value->>'suggestedDate')::date between v_week_start and v_week_end;

    if v_goal.effort_source in ('user_confirmed','ai_estimate_confirmed')
       and v_existing_goal_week_minutes + v_incoming_goal_week_minutes > round(v_goal_hours * 60) then
      raise exception 'Split replan would exceed the goal''s confirmed weekly commitment';
    end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_splits)
  loop
    insert into public.goal_tasks (
      user_id,
      goal_id,
      milestone_id,
      weekly_action_id,
      title,
      scheduled_date,
      scheduled_time,
      estimated_minutes,
      status,
      deferred_from_date,
      notes,
      display_order
    )
    values (
      v_user_id,
      v_original.goal_id,
      v_original.milestone_id,
      v_original.weekly_action_id,
      trim(v_item->>'title'),
      (v_item->>'suggestedDate')::date,
      null,
      (v_item->>'estimatedMinutes')::integer,
      'planned',
      coalesce(v_original.deferred_from_date, v_original.scheduled_date),
      left(
        case
          when coalesce(v_original.notes, '') = '' then 'Split from: ' || v_original.title
          else v_original.notes || E'\n\nSplit from: ' || v_original.title
        end,
        4000
      ),
      v_original.display_order
    )
    returning id into v_new_id;

    v_created_ids := array_append(v_created_ids, v_new_id);
  end loop;

  update public.goal_tasks
  set
    status = 'skipped',
    completed_at = null,
    notes = left(
      case
        when coalesce(notes, '') = '' then 'Replaced by a user-approved split replan.'
        else notes || E'\n\nReplaced by a user-approved split replan.'
      end,
      4000
    )
  where id = v_original.id;

  return jsonb_build_object(
    'originalTaskId', v_original.id,
    'createdTaskIds', to_jsonb(v_created_ids),
    'createdCount', cardinality(v_created_ids)
  );
end;
$function$;

grant execute on function public.apply_split_replan(uuid, jsonb) to authenticated;

comment on function public.apply_split_replan(uuid, jsonb) is
  'Atomically replaces one planned/deferred task with smaller user-approved tasks while preserving lineage and enforcing goal/capacity limits.';
