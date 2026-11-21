-- Keep Accountability Lab membership and chat unavailable to new applicants until admitted.
-- Existing legacy enrollments without an admission row remain grandfathered by the helper.

create or replace function public.join_current_accountability_lab(
  p_availability text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_enrollment_id uuid;
  v_goal_areas text[];
  v_goal_count integer;
  v_group_id uuid;
  v_group_name text;
  v_allowed text[] := array[
    'weekday_evenings',
    'weekend_mornings',
    'weekend_afternoons',
    'flexible'
  ];
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_availability is null or cardinality(p_availability) = 0 then
    raise exception 'Choose at least one availability option';
  end if;

  if exists (
    select 1
    from unnest(p_availability) option_value
    where not (option_value = any(v_allowed))
  ) then
    raise exception 'Invalid availability option';
  end if;

  select e.id
  into v_enrollment_id
  from public.program_enrollments e
  join public.program_cohorts c on c.id = e.cohort_id
  where e.user_id = auth.uid()
    and c.program_key = 'goals'
    and c.is_current
    and e.status in ('active','completed')
  order by e.activated_at desc nulls last, e.registered_at desc
  limit 1;

  if v_enrollment_id is null then
    raise exception 'An active current GOALS enrollment is required';
  end if;

  if not public.program_application_access_allowed((
    select e.source_submission_id from public.program_enrollments e where e.id = v_enrollment_id
  )) then
    raise exception 'Admission must be confirmed before joining Accountability Lab';
  end if;

  select
    count(*)::integer,
    coalesce(array_agg(distinct nullif(trim(g.life_area), ''))
      filter (where nullif(trim(g.life_area), '') is not null), '{}')
  into v_goal_count, v_goal_areas
  from public.goals g
  where g.enrollment_id = v_enrollment_id
    and g.status <> 'archived';

  if v_goal_count = 0 then
    raise exception 'Create at least one GOALS goal before joining Accountability Lab';
  end if;

  insert into public.accountability_lab_preferences (
    enrollment_id,
    availability,
    goal_areas,
    commitment_accepted,
    joined_at,
    updated_at
  )
  values (
    v_enrollment_id,
    p_availability,
    v_goal_areas,
    true,
    now(),
    now()
  )
  on conflict (enrollment_id)
  do update set
    availability = excluded.availability,
    goal_areas = excluded.goal_areas,
    commitment_accepted = true,
    joined_at = coalesce(public.accountability_lab_preferences.joined_at, now()),
    updated_at = now();

  v_group_id := public.assign_enrollment_to_available_group(v_enrollment_id);

  select name
  into v_group_name
  from public.accountability_groups
  where id = v_group_id;

  return jsonb_build_object(
    'groupId', v_group_id,
    'groupName', v_group_name,
    'goalAreas', v_goal_areas
  );
end;
$function$;

create or replace function public.assign_current_user_to_accountability_group()
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_enrollment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select e.id
  into v_enrollment_id
  from public.program_enrollments e
  join public.program_cohorts c on c.id = e.cohort_id
  where e.user_id = auth.uid()
    and c.program_key = 'goals'
    and c.is_current
    and e.status in ('active','completed')
  order by e.activated_at desc nulls last, e.registered_at desc
  limit 1;

  if v_enrollment_id is null then
    raise exception 'An active current GOALS enrollment is required before joining accountability';
  end if;

  if not public.program_application_access_allowed((
    select e.source_submission_id from public.program_enrollments e where e.id = v_enrollment_id
  )) then
    raise exception 'Admission must be confirmed before joining accountability';
  end if;

  return public.assign_enrollment_to_available_group(v_enrollment_id);
end;
$function$;

create or replace function public.current_user_accountability_chat()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_enrollment_id uuid;
  v_group_id uuid;
  v_group_name text;
  v_chat_id uuid;
  v_coach_id uuid;
  v_coach_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select e.id
  into v_enrollment_id
  from public.program_enrollments e
  join public.program_cohorts c on c.id = e.cohort_id
  where e.user_id = v_user_id
    and c.program_key = 'goals'
    and c.is_current
    and e.status in ('active','completed')
  order by e.activated_at desc nulls last, e.registered_at desc
  limit 1;

  if v_enrollment_id is null then
    return jsonb_build_object('available', false, 'reason', 'no-current-enrollment');
  end if;

  if not public.program_application_access_allowed((
    select e.source_submission_id from public.program_enrollments e where e.id = v_enrollment_id
  )) then
    return jsonb_build_object('available', false, 'reason', 'admission-pending');
  end if;

  select m.group_id, ag.name, ag.mentor_id
  into v_group_id, v_group_name, v_coach_id
  from public.program_accountability_memberships m
  join public.accountability_groups ag on ag.id = m.group_id
  where m.enrollment_id = v_enrollment_id
    and m.status = 'active'
  limit 1;

  if v_group_id is null then
    return jsonb_build_object('available', false, 'reason', 'no-group');
  end if;

  select cg.id
  into v_chat_id
  from public.chat_groups cg
  where cg.accountability_group_id = v_group_id
  limit 1;

  if v_coach_id is not null then
    select trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))
    into v_coach_name
    from public.profiles p
    where p.id = v_coach_id;
  end if;

  return jsonb_build_object(
    'available', v_chat_id is not null,
    'groupId', v_group_id,
    'groupName', v_group_name,
    'chatId', v_chat_id,
    'coachId', v_coach_id,
    'coachName', nullif(v_coach_name,'')
  );
end;
$function$;

revoke all on function public.join_current_accountability_lab(text[]) from public, anon;
grant execute on function public.join_current_accountability_lab(text[]) to authenticated, service_role;
revoke all on function public.assign_current_user_to_accountability_group() from public, anon;
grant execute on function public.assign_current_user_to_accountability_group() to authenticated, service_role;
revoke all on function public.current_user_accountability_chat() from public, anon;
grant execute on function public.current_user_accountability_chat() to authenticated, service_role;
