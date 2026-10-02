-- Cohort-aware participation model.
-- Keeps a permanent user/profile separate from participation in a specific DYP program cohort.

create table if not exists public.program_cohorts (
  id uuid primary key default gen_random_uuid(),
  program_key text not null,
  slug text not null unique,
  name text not null,
  cohort_year integer not null check (cohort_year between 2000 and 2100),
  program_event_id uuid references public.program_events(id) on delete set null,
  starts_on date,
  ends_on date,
  status text not null default 'planned'
    check (status in ('planned','current','historical','closed')),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_key, cohort_year),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create unique index if not exists program_cohorts_one_current_per_program_idx
  on public.program_cohorts(program_key)
  where is_current;

create table if not exists public.program_enrollments (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.program_cohorts(id) on delete restrict,
  user_id uuid references public.profiles(id) on delete set null,
  source_submission_id uuid unique references public.program_form_submissions(id) on delete set null,
  email text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  status text not null default 'registered'
    check (status in ('registered','payment_pending','active','completed','withdrawn','inactive','legacy')),
  registered_at timestamptz not null default now(),
  activated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists program_enrollments_cohort_user_idx
  on public.program_enrollments(cohort_id, user_id)
  where user_id is not null;

create index if not exists program_enrollments_cohort_status_idx
  on public.program_enrollments(cohort_id, status);

create index if not exists program_enrollments_email_idx
  on public.program_enrollments(cohort_id, lower(email));

alter table public.program_forms
  add column if not exists cohort_id uuid references public.program_cohorts(id) on delete set null;

alter table public.goals
  add column if not exists enrollment_id uuid references public.program_enrollments(id) on delete set null;

alter table public.goal_analyses
  add column if not exists enrollment_id uuid references public.program_enrollments(id) on delete set null;

create index if not exists goals_enrollment_id_idx on public.goals(enrollment_id);
create index if not exists goal_analyses_enrollment_id_idx on public.goal_analyses(enrollment_id);

alter table public.program_cohorts enable row level security;
alter table public.program_enrollments enable row level security;

drop policy if exists "Authenticated users can read cohorts" on public.program_cohorts;
create policy "Authenticated users can read cohorts"
on public.program_cohorts
for select
to authenticated
using (true);

drop policy if exists "Admins manage cohorts" on public.program_cohorts;
create policy "Admins manage cohorts"
on public.program_cohorts
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Users read own enrollments" on public.program_enrollments;
create policy "Users read own enrollments"
on public.program_enrollments
for select
to authenticated
using (
  user_id = auth.uid()
  or public.has_role(auth.uid(), 'admin'::public.app_role)
);

drop policy if exists "Admins manage enrollments" on public.program_enrollments;
create policy "Admins manage enrollments"
on public.program_enrollments
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select on public.program_cohorts to authenticated;
grant select on public.program_enrollments to authenticated;
grant insert, update, delete on public.program_cohorts to authenticated;
grant insert, update, delete on public.program_enrollments to authenticated;
grant all on public.program_cohorts to service_role;
grant all on public.program_enrollments to service_role;

-- Seed GOALS cohorts without inventing historical dates.
insert into public.program_cohorts (
  program_key, slug, name, cohort_year, status, is_current
)
values (
  'goals', 'goals-2025', 'DYP GOALS 2025', 2025, 'historical', false
)
on conflict (slug) do update
set name = excluded.name,
    cohort_year = excluded.cohort_year,
    status = excluded.status,
    is_current = false,
    updated_at = now();

insert into public.program_cohorts (
  program_key,
  slug,
  name,
  cohort_year,
  program_event_id,
  starts_on,
  ends_on,
  status,
  is_current
)
select
  'goals',
  'goals-2026',
  'DYP GOALS 2026',
  2026,
  pe.id,
  pe.starts_at::date,
  pe.ends_at::date,
  'current',
  true
from public.program_events pe
where pe.slug = 'goals-masterclass-2026'
on conflict (slug) do update
set program_event_id = excluded.program_event_id,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    status = 'current',
    is_current = true,
    updated_at = now();

-- Link the current registration form to GOALS 2026.
update public.program_forms f
set cohort_id = c.id
from public.program_cohorts c
where f.slug = 'goals-masterclass-2026'
  and c.slug = 'goals-2026';

-- Backfill only people with actual 2025 GOALS activity, not every old profile.
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
  c.id,
  p.id,
  p.email,
  p.first_name,
  p.last_name,
  'legacy',
  min(ga.created_at)
from public.goal_analyses ga
join public.profiles p on p.id = ga.user_id
join public.program_cohorts c on c.slug = 'goals-2025'
where ga.created_at >= timestamptz '2025-01-01 00:00:00+00'
  and ga.created_at < timestamptz '2026-01-01 00:00:00+00'
group by c.id, p.id, p.email, p.first_name, p.last_name
on conflict (cohort_id, user_id) where user_id is not null
do update set
  email = excluded.email,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  updated_at = now();

update public.goal_analyses ga
set enrollment_id = e.id
from public.program_enrollments e
join public.program_cohorts c on c.id = e.cohort_id
where c.slug = 'goals-2025'
  and e.user_id = ga.user_id
  and ga.created_at >= timestamptz '2025-01-01 00:00:00+00'
  and ga.created_at < timestamptz '2026-01-01 00:00:00+00'
  and ga.enrollment_id is null;

-- If a structured goal came from a cohort-tagged analysis, inherit that enrollment.
update public.goals g
set enrollment_id = ga.enrollment_id
from public.goal_analyses ga
where g.source_analysis_id = ga.id
  and ga.enrollment_id is not null
  and g.enrollment_id is null;

create or replace function public.ensure_program_enrollment_from_submission(
  p_submission_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_form_id uuid;
  v_cohort_id uuid;
  v_email text := '';
  v_first_name text := '';
  v_last_name text := '';
  v_user_id uuid;
  v_status text := 'registered';
  v_registered_at timestamptz := now();
  v_paid_at timestamptz;
  v_certificate_issued_at timestamptz;
  v_payment_options boolean := false;
  v_enrollment_id uuid;
begin
  select s.form_id, s.submitted_at, f.cohort_id
  into v_form_id, v_registered_at, v_cohort_id
  from public.program_form_submissions s
  join public.program_forms f on f.id = s.form_id
  where s.id = p_submission_id;

  if v_cohort_id is null then
    return null;
  end if;

  select coalesce(nullif(trim(a.answer #>> '{}'), ''), '')
  into v_email
  from public.program_form_answers a
  join public.program_form_fields pf on pf.id = a.field_id
  where a.submission_id = p_submission_id
    and pf.field_type = 'email'
  order by pf.display_order
  limit 1;

  select coalesce(nullif(trim(a.answer #>> '{}'), ''), '')
  into v_first_name
  from public.program_form_answers a
  join public.program_form_fields pf on pf.id = a.field_id
  where a.submission_id = p_submission_id
    and pf.field_type = 'text'
    and position('first name' in lower(pf.label)) > 0
  order by pf.display_order
  limit 1;

  select coalesce(nullif(trim(a.answer #>> '{}'), ''), '')
  into v_last_name
  from public.program_form_answers a
  join public.program_form_fields pf on pf.id = a.field_id
  where a.submission_id = p_submission_id
    and pf.field_type = 'text'
    and position('last name' in lower(pf.label)) > 0
  order by pf.display_order
  limit 1;

  v_email := coalesce(v_email, '');
  v_first_name := coalesce(v_first_name, '');
  v_last_name := coalesce(v_last_name, '');

  if v_email <> '' then
    select p.id
    into v_user_id
    from public.profiles p
    where lower(p.email) = lower(v_email)
    order by p.created_at
    limit 1;
  end if;

  select pp.paid_at
  into v_paid_at
  from public.program_payments pp
  where pp.submission_id = p_submission_id
    and pp.status = 'paid'
  limit 1;

  select ps.certificate_issued_at
  into v_certificate_issued_at
  from public.program_participant_status ps
  where ps.submission_id = p_submission_id
  limit 1;

  select exists (
    select 1
    from public.program_payment_settings s
    where s.form_id = v_form_id
      and (s.manual_enabled or s.paystack_enabled)
  )
  into v_payment_options;

  if v_certificate_issued_at is not null then
    v_status := 'completed';
  elsif v_paid_at is not null then
    v_status := 'active';
  elsif v_payment_options then
    v_status := 'payment_pending';
  else
    v_status := 'registered';
  end if;

  select e.id
  into v_enrollment_id
  from public.program_enrollments e
  where e.source_submission_id = p_submission_id
  limit 1;

  if v_enrollment_id is null and v_user_id is not null then
    select e.id
    into v_enrollment_id
    from public.program_enrollments e
    where e.cohort_id = v_cohort_id
      and e.user_id = v_user_id
    limit 1;
  end if;

  if v_enrollment_id is null then
    insert into public.program_enrollments (
      cohort_id,
      user_id,
      source_submission_id,
      email,
      first_name,
      last_name,
      status,
      registered_at,
      activated_at,
      completed_at
    )
    values (
      v_cohort_id,
      v_user_id,
      p_submission_id,
      v_email,
      v_first_name,
      v_last_name,
      v_status,
      coalesce(v_registered_at, now()),
      case when v_status in ('active','completed') then coalesce(v_paid_at, now()) else null end,
      case when v_status = 'completed' then v_certificate_issued_at else null end
    )
    returning id into v_enrollment_id;
  else
    update public.program_enrollments
    set
      user_id = coalesce(v_user_id, user_id),
      source_submission_id = coalesce(source_submission_id, p_submission_id),
      email = case when v_email <> '' then v_email else email end,
      first_name = case when v_first_name <> '' then v_first_name else first_name end,
      last_name = case when v_last_name <> '' then v_last_name else last_name end,
      status = case
        when status = 'completed' then 'completed'
        else v_status
      end,
      activated_at = case
        when activated_at is not null then activated_at
        when v_status in ('active','completed') then coalesce(v_paid_at, now())
        else null
      end,
      completed_at = case
        when completed_at is not null then completed_at
        when v_status = 'completed' then v_certificate_issued_at
        else null
      end,
      updated_at = now()
    where id = v_enrollment_id;
  end if;

  return v_enrollment_id;
end;
$function$;

revoke all on function public.ensure_program_enrollment_from_submission(uuid) from public;
revoke all on function public.ensure_program_enrollment_from_submission(uuid) from anon;
revoke all on function public.ensure_program_enrollment_from_submission(uuid) from authenticated;
grant execute on function public.ensure_program_enrollment_from_submission(uuid) to service_role;

create or replace function public.sync_program_enrollment_from_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.ensure_program_enrollment_from_submission(new.submission_id);
  return new;
end;
$function$;

create or replace function public.sync_program_enrollment_from_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.ensure_program_enrollment_from_submission(new.submission_id);
  return new;
end;
$function$;

create or replace function public.sync_program_enrollment_from_participant_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.ensure_program_enrollment_from_submission(new.submission_id);
  return new;
end;
$function$;

drop trigger if exists trg_sync_program_enrollment_from_answer
on public.program_form_answers;
create trigger trg_sync_program_enrollment_from_answer
after insert or update of answer on public.program_form_answers
for each row
execute function public.sync_program_enrollment_from_answer();

drop trigger if exists trg_sync_program_enrollment_from_payment
on public.program_payments;
create trigger trg_sync_program_enrollment_from_payment
after insert or update of status, paid_at on public.program_payments
for each row
execute function public.sync_program_enrollment_from_payment();

drop trigger if exists trg_sync_program_enrollment_from_participant_status
on public.program_participant_status;
create trigger trg_sync_program_enrollment_from_participant_status
after insert or update of completion_status, certificate_issued_at on public.program_participant_status
for each row
execute function public.sync_program_enrollment_from_participant_status();

-- Backfill any registrations that already exist.
select public.ensure_program_enrollment_from_submission(s.id)
from public.program_form_submissions s
join public.program_forms f on f.id = s.form_id
where f.cohort_id is not null;

-- Future top-level goal records inherit the user's active current cohort automatically.
create or replace function public.assign_current_enrollment_to_goal_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.enrollment_id is null and new.user_id is not null then
    select e.id
    into new.enrollment_id
    from public.program_enrollments e
    join public.program_cohorts c on c.id = e.cohort_id
    where e.user_id = new.user_id
      and c.is_current
      and e.status in ('active','completed')
    order by
      case when e.status = 'active' then 0 else 1 end,
      e.activated_at desc nulls last,
      e.registered_at desc
    limit 1;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_assign_current_enrollment_to_goal
on public.goals;
create trigger trg_assign_current_enrollment_to_goal
before insert or update of user_id, enrollment_id on public.goals
for each row
execute function public.assign_current_enrollment_to_goal_record();

drop trigger if exists trg_assign_current_enrollment_to_goal_analysis
on public.goal_analyses;
create trigger trg_assign_current_enrollment_to_goal_analysis
before insert or update of user_id, enrollment_id on public.goal_analyses
for each row
execute function public.assign_current_enrollment_to_goal_record();

comment on table public.program_cohorts is
  'Program/cohort definitions such as GOALS 2025 and GOALS 2026.';
comment on table public.program_enrollments is
  'A person or registration participating in one program cohort, with lifecycle status.';
comment on column public.goals.enrollment_id is
  'The cohort enrollment this goal belongs to. Child goal activity inherits cohort context through the goal.';
comment on column public.goal_analyses.enrollment_id is
  'The cohort enrollment associated with this legacy goal-analysis submission.';
