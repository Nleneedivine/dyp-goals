-- Correct funding classification: only an approved sponsorship claim
-- qualifies as sponsored. Pending/rejected claims remain self-funded until approved.
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

  select * into v_payment from public.program_payments where submission_id = v_submission.id;
  select * into v_claim from public.program_sponsorship_claims
    where submission_id = v_submission.id order by updated_at desc limit 1;
  select * into v_admission from public.program_application_admissions
    where submission_id = v_submission.id;

  update public.program_applicant_portal_tokens
  set last_used_at = now() where id = v_token.id;
  insert into public.program_applicant_portal_audit (submission_id, token_id, action)
  values (v_submission.id, v_token.id, 'opened');

  return jsonb_build_object(
    'valid', true,
    'submissionId', v_submission.id,
    'sessionToken', v_session_token,
    'submittedAt', v_submission.submitted_at,
    'paymentStatus', coalesce(v_payment.status, 'unpaid'),
    'fundingType', case when v_claim.status = 'approved' then 'sponsored' else 'self_paid' end,
    'sponsorshipStatus', v_claim.status,
    'admissionStatus', v_admission.status,
    'admissionReason', v_admission.decision_reason
  );
end;
$$;

revoke all on function public.get_applicant_portal_state(text) from public, anon, authenticated;
grant execute on function public.get_applicant_portal_state(text) to service_role;
