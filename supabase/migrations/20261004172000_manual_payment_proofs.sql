-- Manual payment proof uploads and review metadata.

alter table public.program_payments
  add column if not exists proof_path text,
  add column if not exists proof_content_type text,
  add column if not exists proof_uploaded_at timestamptz,
  add column if not exists rejection_reason text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Admins can read payment proofs" on storage.objects;
create policy "Admins can read payment proofs"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-proofs'
  and public.has_role(auth.uid(), 'admin'::public.app_role)
);

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
  v_expected_prefix text;
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

  if p_proof_content_type not in ('image/jpeg','image/png','image/webp') then
    raise exception 'Upload a JPG, PNG or WebP payment proof image';
  end if;

  v_expected_prefix := v_submission.id::text || '/';

  if p_proof_path is null
     or position(v_expected_prefix in p_proof_path) <> 1 then
    raise exception 'Invalid payment proof path';
  end if;

  insert into public.program_payments (
    submission_id,
    form_id,
    method,
    status,
    amount_minor,
    currency,
    manual_reference,
    proof_path,
    proof_content_type,
    proof_uploaded_at,
    rejection_reason,
    updated_at
  )
  values (
    v_submission.id,
    v_submission.form_id,
    'manual',
    'pending',
    v_settings.amount_minor,
    v_settings.currency,
    trim(p_manual_reference),
    p_proof_path,
    p_proof_content_type,
    now(),
    null,
    now()
  )
  on conflict (submission_id)
  do update set
    method = 'manual',
    status = case when public.program_payments.status = 'paid' then 'paid' else 'pending' end,
    amount_minor = excluded.amount_minor,
    currency = excluded.currency,
    manual_reference = excluded.manual_reference,
    provider_reference = null,
    proof_path = excluded.proof_path,
    proof_content_type = excluded.proof_content_type,
    proof_uploaded_at = now(),
    rejection_reason = null,
    verified_at = case when public.program_payments.status = 'paid' then public.program_payments.verified_at else null end,
    verified_by = case when public.program_payments.status = 'paid' then public.program_payments.verified_by else null end,
    updated_at = now();

  return public.get_program_payment_state(p_session_token);
end;
$function$;

revoke all on function public.submit_manual_program_payment_with_proof(uuid,text,text,text) from public;
grant execute on function public.submit_manual_program_payment_with_proof(uuid,text,text,text)
  to anon, authenticated, service_role;

create or replace function public.admin_set_program_payment_status(
  p_submission_id uuid,
  p_status text,
  p_rejection_reason text default null
)
returns public.program_payments
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_payment public.program_payments;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('paid','rejected','pending') then
    raise exception 'Invalid payment status';
  end if;

  if p_status = 'rejected'
     and char_length(trim(coalesce(p_rejection_reason, ''))) < 3 then
    raise exception 'Add a short rejection reason';
  end if;

  update public.program_payments
  set
    status = p_status,
    paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
    verified_at = now(),
    verified_by = auth.uid(),
    rejection_reason = case
      when p_status = 'rejected' then trim(p_rejection_reason)
      else null
    end,
    updated_at = now()
  where submission_id = p_submission_id
  returning * into v_payment;

  if not found then
    raise exception 'Payment record not found';
  end if;

  return v_payment;
end;
$function$;

revoke all on function public.admin_set_program_payment_status(uuid,text,text) from public;
grant execute on function public.admin_set_program_payment_status(uuid,text,text)
  to authenticated, service_role;

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
begin
  select sub.*
  into v_submission
  from public.program_form_sessions s
  join public.program_form_submissions sub on sub.session_id = s.id
  where s.session_token = p_session_token
    and s.completed_at is not null
  limit 1;

  if not found then
    return jsonb_build_object('available', false);
  end if;

  select *
  into v_settings
  from public.program_payment_settings
  where form_id = v_submission.form_id;

  if not found then
    return jsonb_build_object('available', false);
  end if;

  select *
  into v_payment
  from public.program_payments
  where submission_id = v_submission.id;

  return jsonb_build_object(
    'available', true,
    'submissionId', v_submission.id,
    'amountMinor', v_settings.amount_minor,
    'currency', v_settings.currency,
    'manualEnabled', v_settings.manual_enabled,
    'paystackEnabled', v_settings.paystack_enabled,
    'bankName', case when v_settings.manual_enabled then v_settings.bank_name else '' end,
    'accountName', case when v_settings.manual_enabled then v_settings.account_name else '' end,
    'accountNumber', case when v_settings.manual_enabled then v_settings.account_number else '' end,
    'manualInstructions', case when v_settings.manual_enabled then v_settings.manual_instructions else '' end,
    'paymentStatus', coalesce(v_payment.status, 'unpaid'),
    'paymentMethod', v_payment.method,
    'paymentReference', coalesce(v_payment.provider_reference, v_payment.manual_reference),
    'proofUploaded', (v_payment.proof_path is not null),
    'rejectionReason', v_payment.rejection_reason,
    'whatsappGroupUrl', case
      when v_payment.status = 'paid' then v_settings.whatsapp_group_url
      else ''
    end
  );
end;
$function$;
