-- Harden accountability group assignment so authenticated users can only assign
-- themselves unless the caller is an administrator.

create or replace function public.assign_user_to_group(_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  available_group_id uuid;
  new_group_id uuid;
  new_group_name text;
  is_mentor boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if _user_id <> auth.uid()
     and not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Not authorized to assign this user';
  end if;

  -- Check if user already has a group.
  select group_id into available_group_id
  from public.profiles
  where id = _user_id;

  if available_group_id is not null then
    return available_group_id;
  end if;

  -- Check if target user is a mentor.
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = 'mentor'
  )
  into is_mentor;

  if is_mentor then
    -- Find a group without a mentor.
    select id into available_group_id
    from public.accountability_groups
    where mentor_id is null
    limit 1;

    -- If none exists, create one and assign this mentor.
    if available_group_id is null then
      new_group_name := public.get_next_group_name();

      insert into public.accountability_groups (name, mentor_id)
      values (new_group_name, _user_id)
      returning id into new_group_id;

      available_group_id := new_group_id;
    else
      update public.accountability_groups
      set mentor_id = _user_id
      where id = available_group_id;
    end if;
  else
    -- Regular member: find a mentor-led group with fewer than five members.
    select ag.id into available_group_id
    from public.accountability_groups ag
    left join public.profiles p
      on p.group_id = ag.id
     and p.id <> ag.mentor_id
    where ag.mentor_id is not null
    group by ag.id
    having count(p.id) < 5
    limit 1;

    -- If none is available, create a new group awaiting a mentor.
    if available_group_id is null then
      new_group_name := public.get_next_group_name();

      insert into public.accountability_groups (name)
      values (new_group_name)
      returning id into new_group_id;

      available_group_id := new_group_id;
    end if;
  end if;

  update public.profiles
  set group_id = available_group_id
  where id = _user_id;

  return available_group_id;
end;
$function$;

revoke all on function public.assign_user_to_group(uuid) from public;
revoke all on function public.assign_user_to_group(uuid) from anon;
grant execute on function public.assign_user_to_group(uuid) to authenticated;
grant execute on function public.assign_user_to_group(uuid) to service_role;

comment on function public.assign_user_to_group(uuid) is
  'Assigns the current authenticated user to an accountability group. Admins may assign another user explicitly.';
