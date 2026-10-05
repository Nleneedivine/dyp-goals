-- Separate accountability coaching from optional mentorship and add safe role management.

alter type public.app_role add value if not exists 'accountability_coach';

-- Existing "mentor" roles attached to accountability groups were operationally
-- accountability coaches. Preserve true optional mentors that are not assigned
-- to an accountability group.
insert into public.user_roles (user_id, role)
select distinct ag.mentor_id, 'accountability_coach'::public.app_role
from public.accountability_groups ag
where ag.mentor_id is not null
on conflict (user_id, role) do nothing;

delete from public.user_roles ur
where ur.role = 'mentor'::public.app_role
  and exists (
    select 1
    from public.accountability_groups ag
    where ag.mentor_id = ur.user_id
  );

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role public.app_role,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_current_user uuid := auth.uid();
begin
  if v_current_user is null
     or not public.has_role(v_current_user, 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  if p_user_id = v_current_user
     and p_role = 'admin'::public.app_role
     and not p_enabled then
    raise exception 'You cannot remove your own admin role';
  end if;

  if p_enabled then
    insert into public.user_roles (user_id, role)
    values (p_user_id, p_role)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles
    where user_id = p_user_id and role = p_role;
  end if;

  return jsonb_build_object(
    'userId', p_user_id,
    'role', p_role,
    'enabled', p_enabled
  );
end;
$function$;

revoke all on function public.admin_set_user_role(uuid,public.app_role,boolean) from public;
grant execute on function public.admin_set_user_role(uuid,public.app_role,boolean)
to authenticated, service_role;

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

revoke all on function public.current_user_accountability_chat() from public;
revoke all on function public.current_user_accountability_chat() from anon;
grant execute on function public.current_user_accountability_chat()
to authenticated, service_role;
