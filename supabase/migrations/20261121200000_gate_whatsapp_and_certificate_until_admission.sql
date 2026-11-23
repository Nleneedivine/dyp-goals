-- Close two programme-entitlement gaps for applications in the new admission workflow.
-- Legacy submissions without an admission row remain grandfathered by
-- program_application_access_allowed(uuid).
-- Funding verification and payment submission remain available before admission.

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

create or replace function public.admin_set_program_participant_status(
  p_submission_id uuid,
  p_completion_status text,
  p_issue_certificate boolean default false
)
returns public.program_participant_status
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_status public.program_participant_status;
  v_code text;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  if p_completion_status not in ('registered','completed','ineligible') then
    raise exception 'Invalid completion status';
  end if;

  if p_issue_certificate and p_completion_status <> 'completed' then
    raise exception 'Certificate can only be issued for a completed participant';
  end if;

  -- Existing/legacy participants without an admission row remain eligible.
  -- New applications must be explicitly admitted before certificate issuance.
  if p_issue_certificate
     and not public.program_application_access_allowed(p_submission_id) then
    raise exception 'Applicant must be admitted before a certificate can be issued';
  end if;

  if p_issue_certificate then
    v_code := 'DYP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  end if;

  update public.program_participant_status
  set completion_status = p_completion_status,
      certificate_eligible = (p_completion_status = 'completed'),
      certificate_issued_at = case
        when p_issue_certificate then coalesce(certificate_issued_at, now())
        when p_completion_status <> 'completed' then null
        else certificate_issued_at
      end,
      certificate_code = case
        when p_issue_certificate then coalesce(certificate_code, v_code)
        when p_completion_status <> 'completed' then null
        else certificate_code
      end,
      updated_at = now(),
      updated_by = auth.uid()
  where submission_id = p_submission_id
  returning * into v_status;

  if not found then
    raise exception 'Participant submission not found';
  end if;

  return v_status;
end;
$function$;

comment on function public.get_program_payment_state(uuid) is
  'Returns funding state to the application session; programme WhatsApp access is withheld until admission for new applications.';
comment on function public.admin_set_program_participant_status(uuid,text,boolean) is
  'Admin participant completion/certificate workflow; new applications require admission before certificate issuance.';
