-- Session UUIDs are still used by legacy/other programme forms. For new DYP GOALS
-- applications, they must not bypass portal-token revocation or admission gating.
-- Edge Functions call these functions with service_role after resolving the portal token.

create or replace function public.get_program_payment_state(p_session_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_submission public.program_form_submissions;
  v_settings public.program_payment_settings;
  v_payment public.program_payments;
  v_claim public.program_sponsorship_claims;
  v_campaign public.program_sponsorship_campaigns;
begin
  select sub.* into v_submission
  from public.program_form_sessions s
  join public.program_form_submissions sub on sub.session_id = s.id
  where s.session_token = p_session_token
    and s.completed_at is not null
  limit 1;

  if not found then
    return jsonb_build_object('available', false);
  end if;

  -- New GOALS applicants must use the revocable portal bearer token.
  -- Legacy and other-programme form sessions retain their existing flow.
  if coalesce(auth.role(), '') <> 'service_role'
     and exists (
       select 1 from public.program_application_admissions a
       where a.submission_id = v_submission.id
     ) then
    return jsonb_build_object('available', false);
  end if;

  select * into v_settings
  from public.program_payment_settings
  where form_id = v_submission.form_id;

  if not found then
    return jsonb_build_object('available', false);
  end if;

  select * into v_payment
  from public.program_payments
  where submission_id = v_submission.id;

  select * into v_claim
  from public.program_sponsorship_claims
  where submission_id = v_submission.id
  order by created_at desc
  limit 1;

  if v_claim.id is not null then
    select * into v_campaign
    from public.program_sponsorship_campaigns
    where id = v_claim.campaign_id;
  end if;

  return jsonb_build_object(
    'available', true,
    'submissionId', v_submission.id,
    'amountMinor', case
      when v_claim.status in ('pending','approved') then v_claim.participant_amount_minor
      else v_settings.amount_minor
    end,
    'currency', coalesce(v_claim.currency, v_settings.currency),
    'manualEnabled', case
      when v_claim.status in ('pending','approved') then false
      else v_settings.manual_enabled
    end,
    'paystackEnabled', case
      when v_claim.status in ('pending','approved') then false
      else v_settings.paystack_enabled
    end,
    'bankName', case when v_settings.manual_enabled then v_settings.bank_name else '' end,
    'accountName', case when v_settings.manual_enabled then v_settings.account_name else '' end,
    'accountNumber', case when v_settings.manual_enabled then v_settings.account_number else '' end,
    'manualInstructions', case when v_settings.manual_enabled then v_settings.manual_instructions else '' end,
    'paymentStatus', coalesce(v_payment.status, 'unpaid'),
    'paymentMethod', v_payment.method,
    'paymentReference', coalesce(v_payment.provider_reference, v_payment.manual_reference),
    'proofUploaded', (v_payment.proof_path is not null),
    'rejectionReason', v_payment.rejection_reason,
    'fundingType', case when v_claim.id is not null then 'sponsored' else 'self_paid' end,
    'sponsorshipStatus', v_claim.status,
    'sponsorName', v_campaign.sponsor_name,
    'sponsorshipCampaignName', v_campaign.name,
    'sponsoredSeatValueMinor', v_claim.covered_amount_minor,
    'sponsorshipRejectionReason', v_claim.rejection_reason,
    'financiallySatisfied', (
      v_payment.status = 'paid' or v_claim.status = 'approved'
    ),
    -- Payment/sponsorship can satisfy funding before admission, but must not
    -- reveal the programme WhatsApp destination until admitted.
    'whatsappGroupUrl', case
      when (v_payment.status = 'paid' or v_claim.status = 'approved')
       and public.program_application_access_allowed(v_submission.id)
      then coalesce(v_settings.whatsapp_group_url, '')
      else ''
    end
  );
end;
$function$;

create or replace function public.submit_manual_program_payment_with_proof(
  p_session_token uuid,
  p_manual_reference text,
  p_proof_path text,
  p_proof_content_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_submission public.program_form_submissions;
  v_settings public.program_payment_settings;
  v_existing public.program_payments;
  v_expected_prefix text;
begin
  select sub.* into v_submission
  from public.program_form_sessions s
  join public.program_form_submissions sub on sub.session_id = s.id
  where s.session_token = p_session_token
    and s.completed_at is not null
  limit 1;

  if not found then
    raise exception 'Completed registration not found';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and exists (
       select 1 from public.program_application_admissions a
       where a.submission_id = v_submission.id
     ) then
    raise exception 'Use your applicant portal link to submit payment proof';
  end if;

  -- Serialize proof replacement against payment verification for this submission.
  select * into v_existing
  from public.program_payments
  where submission_id = v_submission.id
  for update;

  if found and v_existing.status = 'paid' then
    raise exception 'This payment has already been verified; proof cannot be replaced';
  end if;

  select * into v_settings
  from public.program_payment_settings
  where form_id = v_submission.form_id and manual_enabled;

  if not found then
    raise exception 'Manual payment is not available';
  end if;

  if char_length(trim(coalesce(p_manual_reference, ''))) < 3 then
    raise exception 'Enter your transfer reference or payment note';
  end if;

  if p_proof_content_type is null
     or p_proof_content_type not in ('image/jpeg','image/png','image/webp') then
    raise exception 'Upload a JPG, PNG or WebP payment proof image';
  end if;

  v_expected_prefix := v_submission.id::text || '/';
  if p_proof_path is null or position(v_expected_prefix in p_proof_path) <> 1 then
    raise exception 'Invalid payment proof path';
  end if;

  insert into public.program_payments (
    submission_id, form_id, method, status, amount_minor, currency,
    manual_reference, proof_path, proof_content_type, proof_uploaded_at,
    rejection_reason, updated_at
  )
  values (
    v_submission.id, v_submission.form_id, 'manual', 'pending',
    v_settings.amount_minor, v_settings.currency, trim(p_manual_reference),
    p_proof_path, p_proof_content_type, now(), null, now()
  )
  on conflict (submission_id) do update set
    method = 'manual',
    status = 'pending',
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    manual_reference = excluded.manual_reference,
    provider_reference = null,
    proof_path = excluded.proof_path,
    proof_content_type = excluded.proof_content_type,
    proof_uploaded_at = now(),
    rejection_reason = null,
    verified_at = null,
    verified_by = null,
    updated_at = now();

  return public.get_program_payment_state(p_session_token);
end;
$function$;

create or replace function public.submit_manual_program_payment(
  p_session_token uuid,
  p_manual_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_submission public.program_form_submissions;
  v_settings public.program_payment_settings;
begin
  select sub.*
  into v_submission
  from public.program_form_sessions s
  join public.program_form_submissions sub on sub.session_id = s.id
  where s.session_token = p_session_token
    and s.completed_at is not null
  limit 1;

  if not found then
    raise exception 'Completed registration not found';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and exists (
       select 1 from public.program_application_admissions a
       where a.submission_id = v_submission.id
     ) then
    raise exception 'Use your applicant portal link to complete funding verification';
  end if;

  select *
  into v_settings
  from public.program_payment_settings
  where form_id = v_submission.form_id
    and manual_enabled;

  if not found then
    raise exception 'Manual payment is not available';
  end if;

  if char_length(trim(coalesce(p_manual_reference, ''))) < 3 then
    raise exception 'Enter your transfer reference or payment note';
  end if;

  insert into public.program_payments (
    submission_id, form_id, method, status, amount_minor, currency, manual_reference, updated_at
  )
  values (
    v_submission.id, v_submission.form_id, 'manual', 'pending',
    v_settings.amount_minor, v_settings.currency, trim(p_manual_reference), now()
  )
  on conflict (submission_id)
  do update set
    method = 'manual',
    status = case when public.program_payments.status = 'paid' then 'paid' else 'pending' end,
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    manual_reference = excluded.manual_reference,
    provider_reference = null,
    updated_at = now();

  return public.get_program_payment_state(p_session_token);
end;
$function$;

create or replace function public.get_program_referral_code(p_session_token uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_code text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and exists (
       select 1
       from public.program_form_sessions s
       join public.program_form_submissions sub on sub.session_id = s.id
       join public.program_application_admissions a on a.submission_id = sub.id
       where s.session_token = p_session_token
         and s.completed_at is not null
     ) then
    raise exception 'Use your applicant portal link to access referral details';
  end if;

  select rc.code into v_code
  from public.program_form_sessions s
  join public.program_form_submissions sub on sub.session_id = s.id
  join public.program_referral_codes rc on rc.submission_id = sub.id
  left join public.program_application_admissions aa on aa.submission_id = sub.id
  where s.session_token = p_session_token
    and s.completed_at is not null
    and (aa.submission_id is null or aa.status = 'admitted')
  limit 1;
  return v_code;
end;
$function$;

comment on function public.get_program_payment_state(uuid) is
  'For new GOALS admissions, public callers must use the revocable applicant portal token; service-role Edge Functions retain server-side access.';
comment on function public.submit_manual_program_payment_with_proof(uuid,text,text,text) is
  'For new GOALS admissions, payment proof submission is restricted to the portal-token Edge Function; legacy programme sessions retain existing behavior.';
comment on function public.submit_manual_program_payment(uuid,text) is
  'For new GOALS admissions, payment submission is restricted to the portal-token Edge Function; legacy programme sessions retain existing behavior.';
comment on function public.get_program_referral_code(uuid) is
  'For new GOALS admissions, referral-code lookup is restricted to the portal-token Edge Function; legacy programme sessions retain existing behavior.';
