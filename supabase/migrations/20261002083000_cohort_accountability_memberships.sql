-- Make accountability and mentorship cohort-aware.
-- Existing profile.group_id values are preserved as legacy compatibility only.

alter table public.accountability_groups
  add column if not exists cohort_id uuid references public.program_cohorts(id) on delete restrict;

update public.accountability_groups ag
set cohort_id = c.id
from public.program_cohorts c
where ag.cohort_id is null
  and c.slug = 'goals-2025';

alter table public.accountability_groups
  alter column cohort_id set not null;

alter table public.accountability_groups
  drop constraint if exists accountability_groups_name_key;

create unique index if not exists accountability_groups_cohort_name_idx
  on public.accountability_groups(cohort_id, name);

create index if not exists accountability_groups_cohort_idx
  on public.accountability_groups(cohort_id);

create table if not exists public.program_accountability_memberships (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.program_enrollments(id) on delete cascade,
  group_id uuid not null references public.accountability_groups(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active','left','removed')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id)
);

create index if not exists program_accountability_memberships_group_status_idx
  on public.program_accountability_memberships(group_id, status);

alter table public.program_accountability_memberships enable row level security;

drop policy if exists "Users read own accountability memberships"
on public.program_accountability_memberships;
create policy "Users read own accountability memberships"
on public.program_accountability_memberships
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

drop policy if exists "Admins manage accountability memberships"
on public.program_accountability_memberships;
create policy "Admins manage accountability memberships"
on public.program_accountability_memberships
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select on public.program_accountability_memberships to authenticated;
grant insert, update, delete on public.program_accountability_memberships to authenticated;
grant all on public.program_accountability_memberships to service_role;

-- Preserve old group membership as GOALS 2025 history.
insert into public.program_accountability_memberships (
  enrollment_id,
  group_id,
  status,
  joined_at
)
select
  e.id,
  p.group_id,
  'active',
  greatest(e.registered_at, ag.created_at)
from public.profiles p
join public.accountability_groups ag on ag.id = p.group_id
join public.program_enrollments e on e.user_id = p.id
join public.program_cohorts c on c.id = e.cohort_id
where p.group_id is not null
  and c.slug = 'goals-2025'
  and ag.cohort_id = c.id
on conflict (enrollment_id) do nothing;

-- Make chat linkage explicit so group names can repeat across cohorts safely.
alter table public.chat_groups
  add column if not exists accountability_group_id uuid
    references public.accountability_groups(id) on delete cascade;

create unique index if not exists chat_groups_accountability_group_id_idx
  on public.chat_groups(accountability_group_id)
  where accountability_group_id is not null;

update public.chat_groups cg
set accountability_group_id = ag.id
from public.accountability_groups ag
where cg.accountability_group_id is null
  and cg.name = ag.name;

-- Mentorship requests also belong to one cohort enrollment.
alter table public.mentorship_requests
  add column if not exists enrollment_id uuid
    references public.program_enrollments(id) on delete set null;

create index if not exists mentorship_requests_enrollment_id_idx
  on public.mentorship_requests(enrollment_id);

update public.mentorship_requests mr
set enrollment_id = e.id
from public.program_enrollments e
join public.program_cohorts c on c.id = e.cohort_id
where mr.enrollment_id is null
  and mr.user_id = e.user_id
  and c.slug = 'goals-2025';

create or replace function public.get_next_group_name_for_cohort(
  p_cohort_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  group_count integer;
  alphabet text[] := array[
    'ALPHA','BETA','GAMMA','DELTA','EPSILON','ZETA','ETA','THETA',
    'IOTA','KAPPA','LAMBDA','MU','NU','XI','OMICRON','PI','RHO',
    'SIGMA','TAU','UPSILON','PHI','CHI','PSI','OMEGA'
  ];
begin
  select count(*)
  into group_count
  from public.accountability_groups
  where cohort_id = p_cohort_id;

  if group_count < array_length(alphabet, 1) then
    return alphabet[group_count + 1];
  end if;

  return 'GROUP-' || (group_count + 1)::text;
end;
$function$;

revoke all on function public.get_next_group_name_for_cohort(uuid) from public;
revoke all on function public.get_next_group_name_for_cohort(uuid) from anon;
revoke all on function public.get_next_group_name_for_cohort(uuid) from authenticated;
grant execute on function public.get_next_group_name_for_cohort(uuid) to service_role;

create or replace function public.ensure_accountability_chat(
  p_group_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_chat_id uuid;
  v_group public.accountability_groups;
begin
  select *
  into v_group
  from public.accountability_groups
  where id = p_group_id;

  if not found then
    raise exception 'Accountability group not found';
  end if;

  select id
  into v_chat_id
  from public.chat_groups
  where accountability_group_id = p_group_id
  limit 1;

  if v_chat_id is null then
    if auth.uid() is null then
      raise exception 'Authentication required to create accountability chat';
    end if;

    insert into public.chat_groups (
      name,
      description,
      created_by,
      is_channel,
      accountability_group_id
    )
    values (
      v_group.name,
      'Chat for accountability group: ' || v_group.name,
      auth.uid(),
      false,
      p_group_id
    )
    returning id into v_chat_id;
  end if;

  return v_chat_id;
end;
$function$;

revoke all on function public.ensure_accountability_chat(uuid) from public;
revoke all on function public.ensure_accountability_chat(uuid) from anon;
revoke all on function public.ensure_accountability_chat(uuid) from authenticated;
grant execute on function public.ensure_accountability_chat(uuid) to service_role;

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

  select ag.id
  into v_group_id
  from public.accountability_groups ag
  left join public.program_accountability_memberships m
    on m.group_id = ag.id
   and m.status = 'active'
  where ag.cohort_id = v_enrollment.cohort_id
  group by ag.id, ag.mentor_id, ag.created_at
  having count(m.id) < 5
  order by
    case when ag.mentor_id is not null then 0 else 1 end,
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
  )
  on conflict (enrollment_id)
  do update set
    group_id = excluded.group_id,
    status = 'active',
    joined_at = now(),
    left_at = null,
    updated_at = now();

  v_chat_id := public.ensure_accountability_chat(v_group_id);

  if v_enrollment.user_id is not null then
    insert into public.chat_group_members (group_id, user_id, role)
    values (v_chat_id, v_enrollment.user_id, 'member')
    on conflict (group_id, user_id) do nothing;
  end if;

  return v_group_id;
end;
$function$;

revoke all on function public.assign_enrollment_to_available_group(uuid) from public;
revoke all on function public.assign_enrollment_to_available_group(uuid) from anon;
revoke all on function public.assign_enrollment_to_available_group(uuid) from authenticated;
grant execute on function public.assign_enrollment_to_available_group(uuid) to service_role;

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

  return public.assign_enrollment_to_available_group(v_enrollment_id);
end;
$function$;

revoke all on function public.assign_current_user_to_accountability_group() from public;
revoke all on function public.assign_current_user_to_accountability_group() from anon;
grant execute on function public.assign_current_user_to_accountability_group()
  to authenticated, service_role;

-- Compatibility wrapper for older callers. It is cohort-aware and no longer
-- writes profiles.group_id.
create or replace function public.assign_user_to_group(_user_id uuid)
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

  if _user_id <> auth.uid()
     and not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Not authorized to assign this user';
  end if;

  select e.id
  into v_enrollment_id
  from public.program_enrollments e
  join public.program_cohorts c on c.id = e.cohort_id
  where e.user_id = _user_id
    and c.program_key = 'goals'
    and c.is_current
    and e.status in ('active','completed')
  order by e.activated_at desc nulls last, e.registered_at desc
  limit 1;

  if v_enrollment_id is null then
    raise exception 'An active current GOALS enrollment is required before joining accountability';
  end if;

  return public.assign_enrollment_to_available_group(v_enrollment_id);
end;
$function$;

revoke all on function public.assign_user_to_group(uuid) from public;
revoke all on function public.assign_user_to_group(uuid) from anon;
grant execute on function public.assign_user_to_group(uuid) to authenticated, service_role;

create or replace function public.admin_bulk_assign_enrollments_to_group(
  p_enrollment_ids uuid[],
  p_group_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_target_cohort_id uuid;
  v_updated_count integer := 0;
  v_chat_id uuid;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  if p_enrollment_ids is null or cardinality(p_enrollment_ids) = 0 then
    raise exception 'At least one enrollment is required';
  end if;

  if cardinality(p_enrollment_ids) > 1000 then
    raise exception 'Bulk assignment is limited to 1000 enrollments at a time';
  end if;

  if p_group_id is not null then
    select cohort_id
    into v_target_cohort_id
    from public.accountability_groups
    where id = p_group_id;

    if not found then
      raise exception 'Accountability group not found';
    end if;

    if exists (
      select 1
      from public.program_enrollments e
      where e.id = any(p_enrollment_ids)
        and e.cohort_id <> v_target_cohort_id
    ) then
      raise exception 'All selected enrollments must belong to the same cohort as the target group';
    end if;
  end if;

  -- Remove linked users from chats for their previous cohort memberships.
  delete from public.chat_group_members cgm
  using public.program_accountability_memberships m,
        public.program_enrollments e,
        public.chat_groups cg
  where m.enrollment_id = any(p_enrollment_ids)
    and e.id = m.enrollment_id
    and e.user_id is not null
    and cg.accountability_group_id = m.group_id
    and cgm.group_id = cg.id
    and cgm.user_id = e.user_id
    and (p_group_id is null or m.group_id is distinct from p_group_id);

  if p_group_id is null then
    update public.program_accountability_memberships
    set status = 'removed',
        left_at = now(),
        updated_at = now()
    where enrollment_id = any(p_enrollment_ids)
      and status = 'active';

    get diagnostics v_updated_count = row_count;

    return jsonb_build_object(
      'updatedCount', v_updated_count,
      'groupId', null,
      'chatSynced', true
    );
  end if;

  insert into public.program_accountability_memberships (
    enrollment_id,
    group_id,
    status,
    joined_at,
    left_at,
    updated_at
  )
  select
    e.id,
    p_group_id,
    'active',
    now(),
    null,
    now()
  from public.program_enrollments e
  where e.id = any(p_enrollment_ids)
  on conflict (enrollment_id)
  do update set
    group_id = excluded.group_id,
    status = 'active',
    joined_at = now(),
    left_at = null,
    updated_at = now();

  get diagnostics v_updated_count = row_count;

  v_chat_id := public.ensure_accountability_chat(p_group_id);

  insert into public.chat_group_members (group_id, user_id, role)
  select
    v_chat_id,
    e.user_id,
    case when ag.mentor_id = e.user_id then 'admin' else 'member' end
  from public.program_enrollments e
  cross join public.accountability_groups ag
  where e.id = any(p_enrollment_ids)
    and e.user_id is not null
    and ag.id = p_group_id
  on conflict (group_id, user_id)
  do update set role = excluded.role;

  return jsonb_build_object(
    'updatedCount', v_updated_count,
    'groupId', p_group_id,
    'chatSynced', true
  );
end;
$function$;

revoke all on function public.admin_bulk_assign_enrollments_to_group(uuid[], uuid) from public;
revoke all on function public.admin_bulk_assign_enrollments_to_group(uuid[], uuid) from anon;
grant execute on function public.admin_bulk_assign_enrollments_to_group(uuid[], uuid)
  to authenticated, service_role;

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
      where cg.accountability_group_id = ag.id
    )
  ),
  inserted as (
    insert into public.chat_groups (
      name,
      description,
      created_by,
      is_channel,
      accountability_group_id
    )
    select
      mg.name,
      'Chat for accountability group: ' || mg.name,
      auth.uid(),
      false,
      mg.id
    from missing_groups mg
    returning id
  )
  select count(*)::integer
  into v_created
  from inserted;

  with desired_memberships as (
    select
      cg.id as chat_group_id,
      auth.uid() as user_id,
      'admin'::text as role
    from public.accountability_groups ag
    join public.chat_groups cg on cg.accountability_group_id = ag.id

    union

    select
      cg.id,
      ag.mentor_id,
      'admin'::text
    from public.accountability_groups ag
    join public.chat_groups cg on cg.accountability_group_id = ag.id
    where ag.mentor_id is not null

    union

    select
      cg.id,
      e.user_id,
      case when e.user_id = ag.mentor_id then 'admin' else 'member' end
    from public.program_accountability_memberships m
    join public.program_enrollments e on e.id = m.enrollment_id
    join public.accountability_groups ag on ag.id = m.group_id
    join public.chat_groups cg on cg.accountability_group_id = ag.id
    where m.status = 'active'
      and e.user_id is not null
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
  select count(*)::integer
  into v_memberships
  from upserted;

  return jsonb_build_object(
    'createdChats', v_created,
    'membershipsSynced', v_memberships
  );
end;
$function$;

comment on table public.program_accountability_memberships is
  'Cohort-specific accountability membership. profiles.group_id is retained only for legacy compatibility.';
comment on column public.accountability_groups.cohort_id is
  'The program cohort this accountability group belongs to.';
comment on column public.chat_groups.accountability_group_id is
  'Explicit accountability-group linkage used instead of matching chats by group name.';
