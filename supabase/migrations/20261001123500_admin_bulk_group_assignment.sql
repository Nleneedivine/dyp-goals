-- Atomically move a batch of users between accountability groups and matching chat groups.
-- Admin-only: replaces per-user frontend loops with one set-based transaction.

create or replace function public.admin_bulk_assign_accountability_group(
  p_user_ids uuid[],
  p_group_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_count integer;
  v_target_group_name text;
  v_target_chat_group_id uuid;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return 0;
  end if;

  if p_group_id is not null then
    select name into v_target_group_name
    from public.accountability_groups
    where id = p_group_id;

    if not found then
      raise exception 'Accountability group not found';
    end if;

    select id into v_target_chat_group_id
    from public.chat_groups
    where name = v_target_group_name
    limit 1;
  end if;

  -- Remove selected users from chat groups associated with their current accountability groups.
  delete from public.chat_group_members cgm
  using public.profiles p
  join public.accountability_groups ag on ag.id = p.group_id
  join public.chat_groups cg on cg.name = ag.name
  where p.id = any(p_user_ids)
    and cgm.user_id = p.id
    and cgm.group_id = cg.id;

  -- Update profile assignment in one statement.
  update public.profiles
  set group_id = p_group_id
  where id = any(p_user_ids);

  get diagnostics v_count = row_count;

  -- Add selected users to the target accountability chat if it exists.
  if p_group_id is not null and v_target_chat_group_id is not null then
    insert into public.chat_group_members (group_id, user_id, role)
    select v_target_chat_group_id, u.user_id, 'member'
    from unnest(p_user_ids) as u(user_id)
    on conflict (group_id, user_id)
    do update set role = excluded.role;
  end if;

  return v_count;
end;
$function$;

revoke all on function public.admin_bulk_assign_accountability_group(uuid[], uuid) from public;
revoke all on function public.admin_bulk_assign_accountability_group(uuid[], uuid) from anon;
grant execute on function public.admin_bulk_assign_accountability_group(uuid[], uuid) to authenticated;
grant execute on function public.admin_bulk_assign_accountability_group(uuid[], uuid) to service_role;

comment on function public.admin_bulk_assign_accountability_group(uuid[], uuid) is
  'Admin-only atomic bulk move between accountability groups and their matching chat groups.';
