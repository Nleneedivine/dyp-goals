-- Synchronize all accountability groups with their matching chat groups in one
-- admin-only transaction. This replaces the browser-side per-group/per-member loop.

create or replace function public.admin_sync_accountability_chats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_created integer := 0;
  v_memberships integer := 0;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  with missing_groups as (
    select ag.id, ag.name
    from public.accountability_groups ag
    where not exists (
      select 1
      from public.chat_groups cg
      where cg.name = ag.name
    )
  ),
  inserted as (
    insert into public.chat_groups (
      name,
      description,
      created_by,
      is_channel
    )
    select
      mg.name,
      'Chat for accountability group: ' || mg.name,
      auth.uid(),
      false
    from missing_groups mg
    returning id
  )
  select count(*)::integer into v_created
  from inserted;

  -- Ensure the current admin, assigned mentor, and all group members are present.
  with desired_memberships as (
    select
      cg.id as chat_group_id,
      auth.uid() as user_id,
      'admin'::text as role
    from public.accountability_groups ag
    join public.chat_groups cg on cg.name = ag.name

    union

    select
      cg.id as chat_group_id,
      ag.mentor_id as user_id,
      'admin'::text as role
    from public.accountability_groups ag
    join public.chat_groups cg on cg.name = ag.name
    where ag.mentor_id is not null

    union

    select
      cg.id as chat_group_id,
      p.id as user_id,
      case when p.id = ag.mentor_id then 'admin' else 'member' end as role
    from public.accountability_groups ag
    join public.chat_groups cg on cg.name = ag.name
    join public.profiles p on p.group_id = ag.id
  ),
  upserted as (
    insert into public.chat_group_members (group_id, user_id, role)
    select chat_group_id, user_id, role
    from desired_memberships
    where user_id is not null
    on conflict (group_id, user_id)
    do update set role = case
      when excluded.role = 'admin' then 'admin'
      else public.chat_group_members.role
    end
    returning 1
  )
  select count(*)::integer into v_memberships
  from upserted;

  return jsonb_build_object(
    'createdChats', v_created,
    'membershipsSynced', v_memberships
  );
end;
$function$;

revoke all on function public.admin_sync_accountability_chats() from public;
revoke all on function public.admin_sync_accountability_chats() from anon;
grant execute on function public.admin_sync_accountability_chats() to authenticated;
grant execute on function public.admin_sync_accountability_chats() to service_role;

comment on function public.admin_sync_accountability_chats() is
  'Admin-only set-based synchronization of accountability groups, mentors, members and matching chat groups.';
