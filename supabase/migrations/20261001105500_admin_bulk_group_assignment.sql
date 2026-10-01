-- Set-based, atomic admin bulk assignment for accountability groups and their chat membership.
create or replace function public.admin_bulk_assign_users_to_group(
  p_user_ids uuid[],
  p_group_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_target_group_name text;
  v_target_chat_group_id uuid;
  v_updated_count integer := 0;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    raise exception 'At least one user is required';
  end if;

  if cardinality(p_user_ids) > 1000 then
    raise exception 'Bulk assignment is limited to 1000 users at a time';
  end if;

  if p_group_id is not null then
    select name
    into v_target_group_name
    from public.accountability_groups
    where id = p_group_id;

    if not found then
      raise exception 'Accountability group not found';
    end if;

    select id
    into v_target_chat_group_id
    from public.chat_groups
    where name = v_target_group_name
    limit 1;
  end if;

  -- Remove selected users from the chat corresponding to their current
  -- accountability group before changing profile.group_id.
  delete from public.chat_group_members cgm
  using public.chat_groups cg,
        public.accountability_groups ag,
        public.profiles p
  where p.id = any(p_user_ids)
    and p.group_id = ag.id
    and cg.name = ag.name
    and cgm.group_id = cg.id
    and cgm.user_id = p.id
    and p.group_id is distinct from p_group_id;

  update public.profiles
  set group_id = p_group_id
  where id = any(p_user_ids);

  get diagnostics v_updated_count = row_count;

  -- Mirror membership into the target chat when that chat already exists.
  -- Existing chat roles are preserved by DO NOTHING.
  if p_group_id is not null and v_target_chat_group_id is not null then
    insert into public.chat_group_members (group_id, user_id, role)
    select
      v_target_chat_group_id,
      selected.user_id,
      case
        when target_group.mentor_id = selected.user_id then 'admin'
        else 'member'
      end
    from unnest(p_user_ids) as selected(user_id)
    cross join public.accountability_groups target_group
    where target_group.id = p_group_id
    on conflict (group_id, user_id) do nothing;
  end if;

  return jsonb_build_object(
    'updatedCount', v_updated_count,
    'groupId', p_group_id,
    'chatSynced', v_target_chat_group_id is not null
  );
end;
$function$;

revoke all on function public.admin_bulk_assign_users_to_group(uuid[], uuid) from public;
revoke all on function public.admin_bulk_assign_users_to_group(uuid[], uuid) from anon;
grant execute on function public.admin_bulk_assign_users_to_group(uuid[], uuid) to authenticated;
grant execute on function public.admin_bulk_assign_users_to_group(uuid[], uuid) to service_role;

comment on function public.admin_bulk_assign_users_to_group(uuid[], uuid) is
  'Admin-only atomic bulk accountability-group assignment with matching chat membership synchronization.';
