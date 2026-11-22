-- Enforce DYP GOALS programme scope at the database boundary.
-- The admin UI is filtered too, but these RPC checks prevent cross-programme
-- admission decisions or portal-token issuance through direct RPC calls.

create or replace function public.admin_set_program_application_admission(
  p_submission_id uuid,
  p_decision text,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_paid boolean := false;
  v_sponsorship_approved boolean := false;
  v_row public.program_application_admissions;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  if p_decision not in ('admitted','rejected') then
    raise exception 'Invalid admission decision';
  end if;

  if not exists (
    select 1
    from public.program_form_submissions s
    join public.program_forms f on f.id = s.form_id
    join public.program_cohorts c on c.id = f.cohort_id
    where s.id = p_submission_id
      and c.program_key = 'goals'
  ) then
    raise exception 'Admission decisions are only available for DYP GOALS applications';
  end if;

  select * into v_row
  from public.program_application_admissions
  where submission_id = p_submission_id
  for update;

  if not found then
    raise exception 'This application is not in the new admission workflow';
  end if;

  select exists (
    select 1 from public.program_payments p
    where p.submission_id = p_submission_id and p.status = 'paid'
  ) into v_payment_paid;

  select exists (
    select 1 from public.program_sponsorship_claims c
    where c.submission_id = p_submission_id and c.status = 'approved'
  ) into v_sponsorship_approved;

  if p_decision = 'admitted' and not (v_payment_paid or v_sponsorship_approved) then
    raise exception 'Funding must be verified before admission';
  end if;

  if p_decision = 'rejected' and char_length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'A reason is required when rejecting an application';
  end if;

  update public.program_application_admissions
  set status = p_decision,
      decision_reason = case when p_decision = 'rejected' then trim(p_reason) else '' end,
      decided_by = auth.uid(),
      decided_at = now(),
      updated_at = now()
  where submission_id = p_submission_id
  returning * into v_row;

  insert into public.program_applicant_portal_audit
    (submission_id, actor_id, action, details)
  values
    (p_submission_id, auth.uid(), 'admission_decision',
     jsonb_build_object('decision', p_decision, 'reason', coalesce(p_reason,'')));

  return jsonb_build_object(
    'submissionId', v_row.submission_id,
    'status', v_row.status,
    'decidedAt', v_row.decided_at
  );
end;
$$;

create or replace function public.admin_create_applicant_portal_token(
  p_submission_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.program_applicant_portal_tokens;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}
    raise exception 'Invalid portal token hash';
  end if;

  if not exists (
    select 1
    from public.program_form_submissions s
    join public.program_forms f on f.id = s.form_id
    join public.program_cohorts c on c.id = f.cohort_id
    where s.id = p_submission_id
      and c.program_key = 'goals'
  ) then
    raise exception 'Applicant portal links are only available for DYP GOALS applications';
  end if;

  update public.program_applicant_portal_tokens
  set revoked_at = now()
  where submission_id = p_submission_id and revoked_at is null;

  insert into public.program_applicant_portal_tokens
    (submission_id, token_hash, created_by)
  values (p_submission_id, lower(p_token_hash), auth.uid())
  returning * into v_token;

  insert into public.program_applicant_portal_audit
    (submission_id, token_id, actor_id, action)
  values (p_submission_id, v_token.id, auth.uid(), 'rotated');

  return jsonb_build_object(
    'tokenId', v_token.id,
    'expiresAt', v_token.expires_at
  );
end;
$$;

revoke all on function public.admin_set_program_application_admission(uuid,text,text) from public, anon;
grant execute on function public.admin_set_program_application_admission(uuid,text,text) to authenticated, service_role;
revoke all on function public.admin_create_applicant_portal_token(uuid,text) from public, anon;
grant execute on function public.admin_create_applicant_portal_token(uuid,text) to authenticated, service_role;
 then
    raise exception 'Invalid portal token hash';
  end if;

  if not exists (
    select 1
    from public.program_form_submissions s
    join public.program_forms f on f.id = s.form_id
    join public.program_cohorts c on c.id = f.cohort_id
    where s.id = p_submission_id
      and c.program_key = 'goals'
  ) then
    raise exception 'Applicant portal links are only available for DYP GOALS applications';
  end if;

  update public.program_applicant_portal_tokens
  set revoked_at = now()
  where submission_id = p_submission_id and revoked_at is null;

  insert into public.program_applicant_portal_tokens
    (submission_id, token_hash, created_by)
  values (p_submission_id, lower(p_token_hash), auth.uid())
  returning * into v_token;

  insert into public.program_applicant_portal_audit
    (submission_id, token_id, actor_id, action)
  values (p_submission_id, v_token.id, auth.uid(), 'rotated');

  return jsonb_build_object(
    'tokenId', v_token.id,
    'expiresAt', v_token.expires_at
  );
end;
$$;

revoke all on function public.admin_set_program_application_admission(uuid,text,text) from public, anon;
grant execute on function public.admin_set_program_application_admission(uuid,text,text) to authenticated, service_role;
revoke all on function public.admin_create_applicant_portal_token(uuid,text) from public, anon;
grant execute on function public.admin_create_applicant_portal_token(uuid,text) to authenticated, service_role;
