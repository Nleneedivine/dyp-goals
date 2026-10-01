-- Payment configuration, payment/access state, and admin-created referral promoters.

create table if not exists public.program_payment_settings (
  form_id uuid primary key references public.program_forms(id) on delete cascade,
  amount_minor integer not null default 500000 check (amount_minor > 0),
  currency text not null default 'NGN',
  manual_enabled boolean not null default true,
  paystack_enabled boolean not null default false,
  bank_name text not null default '',
  account_name text not null default '',
  account_number text not null default '',
  manual_instructions text not null default '',
  whatsapp_group_url text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.program_payments (
  submission_id uuid primary key references public.program_form_submissions(id) on delete cascade,
  form_id uuid not null references public.program_forms(id) on delete cascade,
  method text not null check (method in ('manual','paystack')),
  status text not null default 'pending' check (status in ('pending','paid','rejected')),
  amount_minor integer not null,
  currency text not null default 'NGN',
  provider_reference text unique,
  manual_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references auth.users(id)
);

create index if not exists program_payments_form_status_idx
  on public.program_payments(form_id, status);

alter table public.program_payment_settings enable row level security;
alter table public.program_payments enable row level security;

drop policy if exists "Admins manage program payment settings" on public.program_payment_settings;
create policy "Admins manage program payment settings"
on public.program_payment_settings
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Admins view program payments" on public.program_payments;
create policy "Admins view program payments"
on public.program_payments
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select, insert, update, delete on public.program_payment_settings to authenticated;
grant select on public.program_payments to authenticated;
grant all on public.program_payment_settings to service_role;
grant all on public.program_payments to service_role;

insert into public.program_payment_settings (
  form_id, amount_minor, currency, manual_enabled, paystack_enabled
)
select f.id, 500000, 'NGN', true, false
from public.program_forms f
where f.slug = 'goals-masterclass-2026'
on conflict (form_id) do nothing;

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
    'whatsappGroupUrl', case
      when v_payment.status = 'paid' then v_settings.whatsapp_group_url
      else ''
    end
  );
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

create or replace function public.admin_set_program_payment_status(
  p_submission_id uuid,
  p_status text
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

  update public.program_payments
  set
    status = p_status,
    paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
    verified_at = now(),
    verified_by = auth.uid(),
    updated_at = now()
  where submission_id = p_submission_id
  returning * into v_payment;

  if not found then
    raise exception 'Payment record not found';
  end if;

  return v_payment;
end;
$function$;

revoke all on function public.get_program_payment_state(uuid) from public;
revoke all on function public.submit_manual_program_payment(uuid, text) from public;
revoke all on function public.admin_set_program_payment_status(uuid, text) from public;
grant execute on function public.get_program_payment_state(uuid) to anon, authenticated, service_role;
grant execute on function public.submit_manual_program_payment(uuid, text) to anon, authenticated, service_role;
grant execute on function public.admin_set_program_payment_status(uuid, text) to authenticated, service_role;

-- Admin-created promoters can receive a campaign referral code without registering.
create table if not exists public.program_referral_promoters (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.program_forms(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 160),
  phone text not null,
  code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table public.program_referral_promoters enable row level security;

drop policy if exists "Admins manage referral promoters" on public.program_referral_promoters;
create policy "Admins manage referral promoters"
on public.program_referral_promoters
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select, insert, update, delete on public.program_referral_promoters to authenticated;
grant all on public.program_referral_promoters to service_role;

alter table public.program_submission_referrals
  alter column referrer_submission_id drop not null,
  add column if not exists promoter_id uuid references public.program_referral_promoters(id) on delete set null;

alter table public.program_submission_referrals
  drop constraint if exists program_submission_referrals_one_referrer_check;

alter table public.program_submission_referrals
  add constraint program_submission_referrals_one_referrer_check
  check (
    (referrer_submission_id is not null and promoter_id is null)
    or (referrer_submission_id is null and promoter_id is not null)
  );

create or replace function public.admin_create_referral_promoter(
  p_form_id uuid,
  p_display_name text,
  p_phone text
)
returns public.program_referral_promoters
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_first_name text;
  v_digits text;
  v_base text;
  v_code text;
  v_suffix integer := 2;
  v_result public.program_referral_promoters;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  v_first_name := split_part(regexp_replace(trim(p_display_name), '\s+', ' ', 'g'), ' ', 1);
  v_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  if char_length(v_first_name) < 1 or char_length(v_digits) < 4 then
    raise exception 'Promoter name and a valid phone number are required';
  end if;

  v_base := 'DYPGL-' || upper(left(v_first_name, 1) || right(v_first_name, 1)) || right(v_digits, 4);
  v_code := v_base;

  while exists (
    select 1 from public.program_referral_codes where code = v_code
    union all
    select 1 from public.program_referral_promoters where code = v_code
  ) loop
    v_code := v_base || '-' || v_suffix::text;
    v_suffix := v_suffix + 1;
  end loop;

  insert into public.program_referral_promoters (
    form_id, display_name, phone, code, created_by
  )
  values (p_form_id, trim(p_display_name), p_phone, v_code, auth.uid())
  returning * into v_result;

  return v_result;
end;
$function$;

revoke all on function public.admin_create_referral_promoter(uuid, text, text) from public;
grant execute on function public.admin_create_referral_promoter(uuid, text, text) to authenticated, service_role;

create or replace function public.record_program_referral(
  p_session_token uuid,
  p_referral_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_referred_submission_id uuid;
  v_form_id uuid;
  v_referrer_submission_id uuid;
  v_promoter_id uuid;
  v_normalized_code text := upper(trim(coalesce(p_referral_code, '')));
begin
  if v_normalized_code = '' then
    return false;
  end if;

  select sub.id, sub.form_id
  into v_referred_submission_id, v_form_id
  from public.program_form_sessions s
  join public.program_form_submissions sub on sub.session_id = s.id
  where s.session_token = p_session_token
    and s.completed_at is not null
  limit 1;

  if v_referred_submission_id is null then
    return false;
  end if;

  select submission_id
  into v_referrer_submission_id
  from public.program_referral_codes
  where code = v_normalized_code
    and form_id = v_form_id
  limit 1;

  if v_referrer_submission_id = v_referred_submission_id then
    return false;
  end if;

  if v_referrer_submission_id is null then
    select id
    into v_promoter_id
    from public.program_referral_promoters
    where code = v_normalized_code
      and form_id = v_form_id
      and active
    limit 1;
  end if;

  if v_referrer_submission_id is null and v_promoter_id is null then
    return false;
  end if;

  insert into public.program_submission_referrals (
    referred_submission_id, referrer_submission_id, promoter_id, form_id, referral_code
  )
  values (
    v_referred_submission_id, v_referrer_submission_id, v_promoter_id, v_form_id, v_normalized_code
  )
  on conflict (referred_submission_id) do nothing;

  return found;
end;
$function$;

create or replace function public.search_program_referrers(
  p_form_id uuid,
  p_query text
)
returns table (
  referral_code text,
  display_name text
)
language sql
stable
security definer
set search_path = public
as $function$
  with available_form as (
    select id
    from public.program_forms
    where id = p_form_id
      and status = 'published'
      and (opens_at is null or opens_at <= now())
      and (closes_at is null or closes_at > now())
      and (submission_deadline is null or submission_deadline > now())
  ),
  participant_candidates as (
    select
      rc.code,
      coalesce(name_answer.raw_name, 'Participant') as raw_name
    from public.program_referral_codes rc
    join available_form af on af.id = rc.form_id
    left join lateral (
      select nullif(trim(a.answer #>> '{}'), '') as raw_name
      from public.program_form_answers a
      join public.program_form_fields f on f.id = a.field_id
      where a.submission_id = rc.submission_id
        and f.field_type = 'text'
        and (
          position('first name' in lower(f.label)) > 0
          or position('full name' in lower(f.label)) > 0
          or lower(trim(f.label)) = 'name'
        )
      order by f.display_order
      limit 1
    ) name_answer on true
  ),
  promoter_candidates as (
    select p.code, p.display_name as raw_name
    from public.program_referral_promoters p
    join available_form af on af.id = p.form_id
    where p.active
  ),
  candidates as (
    select * from participant_candidates
    union all
    select * from promoter_candidates
  )
  select
    c.code,
    case
      when array_length(regexp_split_to_array(c.raw_name, '\s+'), 1) > 1
        then split_part(c.raw_name, ' ', 1) || ' ' || left(split_part(c.raw_name, ' ', 2), 1) || '.'
      else c.raw_name
    end
  from candidates c
  where char_length(trim(coalesce(p_query, ''))) >= 2
    and (c.code ilike '%' || trim(p_query) || '%' or c.raw_name ilike '%' || trim(p_query) || '%')
  order by case when upper(c.code) = upper(trim(p_query)) then 0 else 1 end, c.raw_name
  limit 8;
$function$;

create or replace function public.get_program_referral_leaderboard_v2(p_form_id uuid)
returns table (
  referrer_submission_id uuid,
  promoter_id uuid,
  referral_code text,
  display_name text,
  total_referrals bigint,
  completed_referrals bigint
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    r.referrer_submission_id,
    r.promoter_id,
    r.referral_code,
    coalesce(
      p.display_name,
      name_answer.raw_name,
      r.referral_code
    ) as display_name,
    count(*)::bigint as total_referrals,
    count(*) filter (where ps.certificate_issued_at is not null)::bigint as completed_referrals
  from public.program_submission_referrals r
  left join public.program_referral_promoters p on p.id = r.promoter_id
  left join lateral (
    select nullif(trim(a.answer #>> '{}'), '') as raw_name
    from public.program_form_answers a
    join public.program_form_fields f on f.id = a.field_id
    where a.submission_id = r.referrer_submission_id
      and f.field_type = 'text'
      and (
        position('first name' in lower(f.label)) > 0
        or position('full name' in lower(f.label)) > 0
        or lower(trim(f.label)) = 'name'
      )
    order by f.display_order
    limit 1
  ) name_answer on true
  left join public.program_participant_status ps on ps.submission_id = r.referred_submission_id
  where r.form_id = p_form_id
    and auth.uid() is not null
    and public.has_role(auth.uid(), 'admin'::public.app_role)
  group by r.referrer_submission_id, r.promoter_id, r.referral_code, p.display_name, name_answer.raw_name
  order by completed_referrals desc, total_referrals desc, referral_code;
$function$;

revoke all on function public.get_program_referral_leaderboard_v2(uuid) from public;
grant execute on function public.get_program_referral_leaderboard_v2(uuid) to authenticated, service_role;
