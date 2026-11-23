-- Prevent an applicant from replacing proof/reference data after payment is verified.
-- The row lock also closes the race with an admin marking the payment paid.
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

comment on function public.submit_manual_program_payment_with_proof(uuid,text,text,text) is
  'Allows proof submission/replacement only before payment is verified; locks the payment row to prevent replacing verified payment evidence.';
