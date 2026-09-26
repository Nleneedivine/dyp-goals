-- Make AI goal refinement atomic and prevent ambiguous overlapping effort phases.

create or replace function public.prevent_overlapping_goal_effort_periods()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if exists (
    select 1
    from public.goal_effort_periods p
    where p.goal_id = new.goal_id
      and p.id <> new.id
      and p.start_date <= new.end_date
      and p.end_date >= new.start_date
  ) then
    raise exception 'Goal effort periods cannot overlap';
  end if;

  return new;
end;
$function$;

drop trigger if exists prevent_goal_effort_period_overlap
on public.goal_effort_periods;

create trigger prevent_goal_effort_period_overlap
before insert or update on public.goal_effort_periods
for each row
execute function public.prevent_overlapping_goal_effort_periods();

create or replace function public.apply_goal_ai_refinement(
  p_goal_id uuid,
  p_goal_patch jsonb,
  p_milestones jsonb default '[]'::jsonb,
  p_effort_periods jsonb default '[]'::jsonb,
  p_replace_effort_periods boolean default false
)
returns public.goals
language plpgsql
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_existing public.goals;
  v_updated public.goals;
  v_start_date date;
  v_end_date date;
  v_title text;
  v_description text;
  v_life_area text;
  v_priority text;
  v_hours numeric;
  v_effort_source text;
  v_success_definition text;
  v_coaching_context jsonb;
  v_item jsonb;
  v_item_title text;
  v_item_due date;
  v_period_label text;
  v_period_start date;
  v_period_end date;
  v_period_hours numeric;
  v_display_order integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_existing
  from public.goals
  where id = p_goal_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Goal not found or not owned by the current user';
  end if;

  if jsonb_typeof(p_goal_patch) <> 'object' then
    raise exception 'Goal patch must be a JSON object';
  end if;

  if jsonb_typeof(coalesce(p_milestones, '[]'::jsonb)) <> 'array' then
    raise exception 'Milestones must be a JSON array';
  end if;

  if jsonb_typeof(coalesce(p_effort_periods, '[]'::jsonb)) <> 'array' then
    raise exception 'Effort periods must be a JSON array';
  end if;

  v_title := trim(coalesce(p_goal_patch->>'title', v_existing.title));
  v_description := trim(coalesce(p_goal_patch->>'description', v_existing.description));
  v_life_area := trim(coalesce(p_goal_patch->>'lifeArea', v_existing.life_area));
  v_priority := coalesce(p_goal_patch->>'priority', v_existing.priority);
  v_hours := coalesce(
    nullif(p_goal_patch->>'estimatedHoursPerWeek', '')::numeric,
    v_existing.estimated_hours_per_week
  );
  v_effort_source := coalesce(p_goal_patch->>'effortSource', v_existing.effort_source);
  v_success_definition := trim(
    coalesce(p_goal_patch->>'successDefinition', v_existing.success_definition)
  );
  v_coaching_context := coalesce(
    p_goal_patch->'coachingContext',
    v_existing.coaching_context
  );

  if p_goal_patch ? 'startDate' then
    v_start_date := nullif(p_goal_patch->>'startDate', '')::date;
  else
    v_start_date := v_existing.start_date;
  end if;

  if p_goal_patch ? 'endDate' then
    v_end_date := nullif(p_goal_patch->>'endDate', '')::date;
  else
    v_end_date := v_existing.end_date;
  end if;

  if char_length(v_title) < 1 or char_length(v_title) > 240 then
    raise exception 'Goal title is invalid';
  end if;

  if char_length(v_description) > 8000 then
    raise exception 'Goal description is too long';
  end if;

  if char_length(v_life_area) < 1 or char_length(v_life_area) > 80 then
    raise exception 'Goal life area is invalid';
  end if;

  if v_priority not in ('primary', 'maintenance', 'later') then
    raise exception 'Goal priority is invalid';
  end if;

  if v_hours < 0 or v_hours > 168 then
    raise exception 'Goal weekly effort must be between 0 and 168 hours';
  end if;

  if v_effort_source not in ('user_confirmed', 'ai_estimate_confirmed') then
    raise exception 'Goal effort source must be confirmed before applying AI refinement';
  end if;

  if v_start_date is not null
     and v_end_date is not null
     and v_end_date < v_start_date then
    raise exception 'Goal end date cannot be before start date';
  end if;

  if jsonb_array_length(coalesce(p_milestones, '[]'::jsonb)) > 40 then
    raise exception 'Too many suggested milestones';
  end if;

  if jsonb_array_length(coalesce(p_effort_periods, '[]'::jsonb)) > 52 then
    raise exception 'Too many effort periods';
  end if;

  if p_replace_effort_periods then
    if exists (
      with periods as (
        select
          ordinal,
          nullif(value->>'startDate', '')::date as start_date,
          nullif(value->>'endDate', '')::date as end_date,
          nullif(value->>'hoursPerWeek', '')::numeric as hours_per_week
        from jsonb_array_elements(coalesce(p_effort_periods, '[]'::jsonb))
          with ordinality as e(value, ordinal)
      )
      select 1
      from periods a
      join periods b
        on a.ordinal < b.ordinal
       and a.start_date <= b.end_date
       and a.end_date >= b.start_date
    ) then
      raise exception 'Suggested goal effort periods overlap';
    end if;

    for v_item in
      select value
      from jsonb_array_elements(coalesce(p_effort_periods, '[]'::jsonb))
    loop
      v_period_label := left(trim(coalesce(v_item->>'label', '')), 120);
      v_period_start := nullif(v_item->>'startDate', '')::date;
      v_period_end := nullif(v_item->>'endDate', '')::date;
      v_period_hours := nullif(v_item->>'hoursPerWeek', '')::numeric;

      if v_period_start is null or v_period_end is null then
        raise exception 'Effort period dates are required';
      end if;

      if v_period_end < v_period_start then
        raise exception 'Effort period end date cannot be before start date';
      end if;

      if v_period_hours is null or v_period_hours < 0 or v_period_hours > 168 then
        raise exception 'Effort period weekly hours are invalid';
      end if;

      if v_start_date is not null and v_period_start < v_start_date then
        raise exception 'Effort period starts before the goal';
      end if;

      if v_end_date is not null and v_period_end > v_end_date then
        raise exception 'Effort period ends after the goal';
      end if;
    end loop;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_milestones, '[]'::jsonb))
  loop
    v_item_title := trim(coalesce(v_item->>'title', ''));
    v_item_due := nullif(v_item->>'dueDate', '')::date;

    if char_length(v_item_title) < 1 or char_length(v_item_title) > 240 then
      raise exception 'Suggested milestone title is invalid';
    end if;

    if v_item_due is not null and v_start_date is not null and v_item_due < v_start_date then
      raise exception 'Suggested milestone is before the goal start date';
    end if;

    if v_item_due is not null and v_end_date is not null and v_item_due > v_end_date then
      raise exception 'Suggested milestone is after the goal end date';
    end if;
  end loop;

  update public.goals
  set
    title = v_title,
    description = v_description,
    life_area = v_life_area,
    start_date = v_start_date,
    end_date = v_end_date,
    priority = v_priority,
    estimated_hours_per_week = v_hours,
    effort_source = v_effort_source,
    coaching_context = v_coaching_context,
    success_definition = v_success_definition
  where id = p_goal_id
    and user_id = v_user_id
  returning * into v_updated;

  select coalesce(max(display_order), -1) + 1
  into v_display_order
  from public.goal_milestones
  where goal_id = p_goal_id;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_milestones, '[]'::jsonb))
  loop
    v_item_title := trim(v_item->>'title');
    v_item_due := nullif(v_item->>'dueDate', '')::date;

    if not exists (
      select 1
      from public.goal_milestones m
      where m.goal_id = p_goal_id
        and lower(trim(m.title)) = lower(v_item_title)
        and m.due_date is not distinct from v_item_due
    ) then
      insert into public.goal_milestones (
        goal_id,
        title,
        due_date,
        display_order
      )
      values (
        p_goal_id,
        v_item_title,
        v_item_due,
        v_display_order
      );

      v_display_order := v_display_order + 1;
    end if;
  end loop;

  if p_replace_effort_periods then
    delete from public.goal_effort_periods
    where goal_id = p_goal_id;

    for v_item in
      select value
      from jsonb_array_elements(coalesce(p_effort_periods, '[]'::jsonb))
    loop
      insert into public.goal_effort_periods (
        goal_id,
        label,
        start_date,
        end_date,
        hours_per_week
      )
      values (
        p_goal_id,
        left(trim(coalesce(v_item->>'label', '')), 120),
        (v_item->>'startDate')::date,
        (v_item->>'endDate')::date,
        (v_item->>'hoursPerWeek')::numeric
      );
    end loop;
  end if;

  return v_updated;
end;
$function$;

grant execute on function public.apply_goal_ai_refinement(uuid, jsonb, jsonb, jsonb, boolean)
to authenticated;

comment on function public.apply_goal_ai_refinement(uuid, jsonb, jsonb, jsonb, boolean) is
  'Atomically applies a reviewed AI refinement to one owned goal, adds non-duplicate milestones and safely replaces non-overlapping effort periods.';
