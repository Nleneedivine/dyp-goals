-- Apply the hardened enrollment sync function to databases where the cohort
-- foundation migration has already run. This allows answer-by-answer form saves
-- before all identity fields are present.

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


