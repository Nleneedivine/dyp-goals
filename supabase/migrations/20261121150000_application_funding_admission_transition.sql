-- Funding-to-admission transition for new applications.
-- Additive only: existing enrolments and historical applications remain untouched.

create or replace function public.sync_program_application_funding_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission_id uuid;
  v_payment_paid boolean := false;
  v_sponsorship_approved boolean := false;
begin
  if tg_table_name = 'program_payments' then
    v_submission_id := coalesce(new.submission_id, old.submission_id);
  elsif tg_table_name = 'program_sponsorship_claims' then
    v_submission_id := coalesce(new.submission_id, old.submission_id);
  end if;

  if v_submission_id is null then
    return new;
  end if;

  select exists (
    select 1 from public.program_payments p
    where p.submission_id = v_submission_id and p.status = 'paid'
  ) into v_payment_paid;

  select exists (
    select 1 from public.program_sponsorship_claims c
    where c.submission_id = v_submission_id and c.status = 'approved'
  ) into v_sponsorship_approved;

  if v_payment_paid or v_sponsorship_approved then
    update public.program_application_admissions
    set status = case
          when status = 'awaiting_funding' then 'awaiting_admission'
          else status
        end,
        updated_at = now()
    where submission_id = v_submission_id
      and status = 'awaiting_funding';
  end if;

  return new;
end;
$$;

drop trigger if exists sync_program_application_after_payment on public.program_payments;
create trigger sync_program_application_after_payment
after insert or update of status on public.program_payments
for each row execute function public.sync_program_application_funding_stage();

drop trigger if exists sync_program_application_after_sponsorship on public.program_sponsorship_claims;
create trigger sync_program_application_after_sponsorship
after insert or update of status on public.program_sponsorship_claims
for each row execute function public.sync_program_application_funding_stage();

-- Recreate the decision RPC against the verified schema and lock the application row.
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

-- Existing active/completed/legacy participants have no admission row and remain
-- grandfathered. New applications require an explicit admitted decision before
-- programme-specific access is granted by application-aware access checks.
create or replace function public.program_application_access_allowed(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from public.program_application_admissions a
      where a.submission_id = p_submission_id
    ) then true
    else exists (
      select 1 from public.program_application_admissions a
      where a.submission_id = p_submission_id and a.status = 'admitted'
    )
  end;
$$;

revoke all on function public.program_application_access_allowed(uuid) from public, anon;
grant execute on function public.program_application_access_allowed(uuid) to authenticated, service_role;

-- Correct the portal resolver: only the matching applicant's existing session
-- token is returned, because legacy payment/sponsorship RPCs are scoped to it.
-- The opaque portal token itself is never returned or logged.
create or replace function public.get_applicant_portal_state(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.program_applicant_portal_tokens;
  v_submission public.program_form_submissions;
  v_payment public.program_payments;
  v_claim public.program_sponsorship_claims;
  v_admission public.program_application_admissions;
  v_session_token uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('valid', false);
  end if;

  select * into v_token
  from public.program_applicant_portal_tokens
  where token_hash = lower(p_token_hash)
    and revoked_at is null
    and expires_at > now();

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  select s, fs.session_token
  into v_submission, v_session_token
  from public.program_form_submissions s
  join public.program_form_sessions fs on fs.id = s.session_id
  where s.id = v_token.submission_id;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  select * into v_payment
  from public.program_payments
  where submission_id = v_submission.id;

  select * into v_claim
  from public.program_sponsorship_claims
  where submission_id = v_submission.id
  order by created_at desc
  limit 1;

  select * into v_admission
  from public.program_application_admissions
  where submission_id = v_submission.id;

  update public.program_applicant_portal_tokens
  set last_used_at = now()
  where id = v_token.id;

  return jsonb_build_object(
    'valid', true,
    'submissionId', v_submission.id,
    'sessionToken', v_session_token,
    'submittedAt', v_submission.submitted_at,
    'paymentStatus', coalesce(v_payment.status, 'unpaid'),
    'fundingType', case when v_claim.id is not null then 'sponsored' else 'self_paid' end,
    'sponsorshipStatus', v_claim.status,
    'admissionStatus', v_admission.status,
    'admissionReason', v_admission.decision_reason
  );
end;
$$;

revoke all on function public.get_applicant_portal_state(text) from public, anon, authenticated;
grant execute on function public.get_applicant_portal_state(text) to service_role;
