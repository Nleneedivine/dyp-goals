-- Reconcile legacy accountability members who had a historical group assignment
-- but no goal activity from which to derive a GOALS 2025 enrollment.

with legacy_cohort as (
  select id
  from public.program_cohorts
  where slug = 'goals-2025'
  limit 1
)
insert into public.program_enrollments (
  cohort_id,
  user_id,
  email,
  first_name,
  last_name,
  status,
  registered_at
)
select
  lc.id,
  p.id,
  p.email,
  p.first_name,
  p.last_name,
  'legacy',
  coalesce(ag.created_at, p.created_at)
from public.profiles p
join public.accountability_groups ag on ag.id = p.group_id
cross join legacy_cohort lc
where p.group_id is not null
  and ag.cohort_id = lc.id
  and not exists (
    select 1
    from public.program_enrollments e
    where e.cohort_id = lc.id
      and e.user_id = p.id
  );

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
  and not exists (
    select 1
    from public.program_accountability_memberships m
    where m.enrollment_id = e.id
      and m.status = 'active'
  );
