-- Classify pre-cohort activity as historical GOALS 2025 data.
-- The old system continued to receive activity into early/mid 2026, so calendar-year
-- boundaries are not reliable. Any activity that existed before explicit cohort
-- scoping and is still unscoped is treated as legacy history.

with legacy_cohort as (
  select id
  from public.program_cohorts
  where slug = 'goals-2025'
  limit 1
),
activity as (
  select user_id, min(created_at) as first_activity_at
  from (
    select user_id, created_at
    from public.goal_analyses
    where user_id is not null
      and enrollment_id is null

    union all

    select user_id, created_at
    from public.goals
    where enrollment_id is null
  ) x
  group by user_id
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
  a.first_activity_at
from activity a
join public.profiles p on p.id = a.user_id
cross join legacy_cohort lc
on conflict (cohort_id, user_id) where user_id is not null
do update set
  email = excluded.email,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  registered_at = least(public.program_enrollments.registered_at, excluded.registered_at),
  updated_at = now();

update public.goal_analyses ga
set enrollment_id = e.id
from public.program_enrollments e
join public.program_cohorts c on c.id = e.cohort_id
where ga.enrollment_id is null
  and ga.user_id = e.user_id
  and c.slug = 'goals-2025';

-- Prefer the source analysis enrollment when available.
update public.goals g
set enrollment_id = ga.enrollment_id
from public.goal_analyses ga
where g.enrollment_id is null
  and g.source_analysis_id = ga.id
  and ga.enrollment_id is not null;

-- Any remaining pre-cohort structured goals inherit the user's legacy enrollment.
update public.goals g
set enrollment_id = e.id
from public.program_enrollments e
join public.program_cohorts c on c.id = e.cohort_id
where g.enrollment_id is null
  and g.user_id = e.user_id
  and c.slug = 'goals-2025';
