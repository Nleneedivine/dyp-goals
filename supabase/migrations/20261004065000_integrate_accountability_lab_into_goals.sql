-- Integrate Accountability Lab directly into the GOALS journey.

create table if not exists public.accountability_lab_preferences (
  enrollment_id uuid primary key references public.program_enrollments(id) on delete cascade,
  availability text[] not null default '{}',
  goal_areas text[] not null default '{}',
  commitment_accepted boolean not null default false,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accountability_lab_preferences enable row level security;

drop policy if exists "Users read own accountability preferences"
on public.accountability_lab_preferences;
create policy "Users read own accountability preferences"
on public.accountability_lab_preferences
for select
to authenticated
using (
  exists (
    select 1
    from public.program_enrollments e
    where e.id = enrollment_id
      and e.user_id = auth.uid()
  )
  or public.has_role(auth.uid(), 'admin'::public.app_role)
);

drop policy if exists "Admins manage accountability preferences"
on public.accountability_lab_preferences;
create policy "Admins manage accountability preferences"
on public.accountability_lab_preferences
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select on public.accountability_lab_preferences to authenticated;
grant all on public.accountability_lab_preferences to service_role;

-- Improve group selection: prefer mentor-supported groups whose existing
-- participants share availability and goal areas with the joining participant.
create or replace function public.assign_enrollment_to_available_group(
  p_enrollment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_enrollment public.program_enrollments;
  v_group_id uuid;
  v_group_name text;
  v_chat_id uuid;
  v_availability text[] := '{}';
  v_goal_areas text[] := '{}';
begin
  select *
  into v_enrollment
  from public.program_enrollments
  where id = p_enrollment_id;

  if not found then
    raise exception 'Enrollment not found';
  end if;

  select m.group_id
  into v_group_id
  from public.program_accountability_memberships m
  where m.enrollment_id = p_enrollment_id
    and m.status = 'active'
  limit 1;

  if v_group_id is not null then
    return v_group_id;
  end if;

  select
    coalesce(p.availability, '{}'),
    coalesce(p.goal_areas, '{}')
  into v_availability, v_goal_areas
  from public.accountability_lab_preferences p
  where p.enrollment_id = p_enrollment_id;

  select ag.id
  into v_group_id
  from public.accountability_groups ag
  left join public.program_accountability_memberships m
    on m.group_id = ag.id
   and m.status = 'active'
  left join public.accountability_lab_preferences member_pref
    on member_pref.enrollment_id = m.enrollment_id
  where ag.cohort_id = v_enrollment.cohort_id
  group by ag.id, ag.mentor_id, ag.created_at
  having count(m.id) < 5
  order by
    case when ag.mentor_id is not null then 0 else 1 end,
    count(*) filter (
      where coalesce(member_pref.availability, '{}') && coalesce(v_availability, '{}')
    ) desc,
    count(*) filter (
      where coalesce(member_pref.goal_areas, '{}') && coalesce(v_goal_areas, '{}')
    ) desc,
    count(m.id),
    ag.created_at
  limit 1;

  if v_group_id is null then
    v_group_name := public.get_next_group_name_for_cohort(v_enrollment.cohort_id);

    insert into public.accountability_groups (name, cohort_id)
    values (v_group_name, v_enrollment.cohort_id)
    returning id into v_group_id;
  end if;

  insert into public.program_accountability_memberships (
    enrollment_id,
    group_id,
    status,
    joined_at,
    left_at,
    updated_at
  )
  values (
    p_enrollment_id,
    v_group_id,
    'active',
    now(),
    null,
    now()
  );

  v_chat_id := public.ensure_accountability_chat(v_group_id);

  if v_enrollment.user_id is not null then
    insert into public.chat_group_members (group_id, user_id, role)
    values (v_chat_id, v_enrollment.user_id, 'member')
    on conflict (group_id, user_id) do nothing;
  end if;

  return v_group_id;
end;
$function$;

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

revoke all on function public.join_current_accountability_lab(text[]) from public;
revoke all on function public.join_current_accountability_lab(text[]) from anon;
grant execute on function public.join_current_accountability_lab(text[]) to authenticated, service_role;
