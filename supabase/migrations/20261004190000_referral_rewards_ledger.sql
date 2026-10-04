-- Configurable referral commissions, rank bonuses, earnings ledger and payouts.

create table if not exists public.program_referral_reward_settings (
  form_id uuid primary key references public.program_forms(id) on delete cascade,
  base_commission_bps integer not null default 1000
    check (base_commission_bps between 0 and 10000),
  base_qualification text not null default 'paid'
    check (base_qualification in ('paid','completed','certified')),
  rank_bonus_enabled boolean not null default true,
  rank_basis text not null default 'certified'
    check (rank_basis in ('paid','completed','certified')),
  rank_bonus_bps integer[] not null default array[500,300,200],
  minimum_rank_referrals integer not null default 1
    check (minimum_rank_referrals >= 0),
  reward_start_at timestamptz,
  reward_end_at timestamptz,
  rank_bonus_finalized_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  check (reward_end_at is null or reward_start_at is null or reward_end_at >= reward_start_at)
);

create table if not exists public.program_referral_earnings (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.program_forms(id) on delete cascade,
  referrer_submission_id uuid references public.program_form_submissions(id) on delete set null,
  promoter_id uuid references public.program_referral_promoters(id) on delete set null,
  referral_code text not null,
  referred_submission_id uuid references public.program_form_submissions(id) on delete set null,
  earning_type text not null
    check (earning_type in ('base_commission','rank_bonus','adjustment')),
  source_key text not null unique,
  amount_minor integer not null check (amount_minor <> 0),
  currency text not null default 'NGN',
  status text not null default 'pending'
    check (status in ('pending','approved','paid','reversed')),
  rank_position integer,
  description text not null default '',
  approved_at timestamptz,
  paid_at timestamptz,
  payout_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (referrer_submission_id is not null and promoter_id is null)
    or (referrer_submission_id is null and promoter_id is not null)
  )
);

create index if not exists program_referral_earnings_form_code_idx
  on public.program_referral_earnings(form_id, referral_code);
create index if not exists program_referral_earnings_status_idx
  on public.program_referral_earnings(form_id, status);

create table if not exists public.program_referral_payouts (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.program_forms(id) on delete cascade,
  referrer_submission_id uuid references public.program_form_submissions(id) on delete set null,
  promoter_id uuid references public.program_referral_promoters(id) on delete set null,
  referral_code text not null,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'NGN',
  status text not null default 'pending'
    check (status in ('pending','approved','paid','cancelled')),
  reference text,
  note text not null default '',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  created_by uuid references auth.users(id),
  check (
    (referrer_submission_id is not null and promoter_id is null)
    or (referrer_submission_id is null and promoter_id is not null)
  )
);

alter table public.program_referral_reward_settings enable row level security;
alter table public.program_referral_earnings enable row level security;
alter table public.program_referral_payouts enable row level security;

drop policy if exists "Admins manage referral reward settings" on public.program_referral_reward_settings;
create policy "Admins manage referral reward settings"
on public.program_referral_reward_settings
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Admins view referral earnings" on public.program_referral_earnings;
create policy "Admins view referral earnings"
on public.program_referral_earnings
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Admins manage referral payouts" on public.program_referral_payouts;
create policy "Admins manage referral payouts"
on public.program_referral_payouts
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select,insert,update,delete on public.program_referral_reward_settings to authenticated;
grant select on public.program_referral_earnings to authenticated;
grant select,insert,update,delete on public.program_referral_payouts to authenticated;
grant all on public.program_referral_reward_settings to service_role;
grant all on public.program_referral_earnings to service_role;
grant all on public.program_referral_payouts to service_role;

insert into public.program_referral_reward_settings (
  form_id,
  base_commission_bps,
  base_qualification,
  rank_bonus_enabled,
  rank_basis,
  rank_bonus_bps,
  minimum_rank_referrals
)
select
  f.id,
  1000,
  'paid',
  true,
  'certified',
  array[500,300,200],
  1
from public.program_forms f
where f.slug = 'goals-masterclass-2026'
on conflict (form_id) do nothing;

create or replace function public.referral_stage_qualifies(
  p_stage text,
  p_payment_status text,
  p_completion_status text,
  p_certificate_issued_at timestamptz
)
returns boolean
language sql
immutable
set search_path = public
as $function$
  select case p_stage
    when 'paid' then p_payment_status = 'paid'
    when 'completed' then p_payment_status = 'paid' and p_completion_status = 'completed'
    when 'certified' then p_payment_status = 'paid' and p_certificate_issued_at is not null
    else false
  end;
$function$;

create or replace function public.sync_program_referral_base_earning(
  p_referred_submission_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_referral public.program_submission_referrals;
  v_settings public.program_referral_reward_settings;
  v_payment public.program_payments;
  v_status public.program_participant_status;
  v_qualifies boolean := false;
  v_amount integer;
  v_source_key text;
begin
  select *
  into v_referral
  from public.program_submission_referrals
  where referred_submission_id = p_referred_submission_id;

  if not found then
    return;
  end if;

  select *
  into v_settings
  from public.program_referral_reward_settings
  where form_id = v_referral.form_id;

  if not found then
    return;
  end if;

  select *
  into v_payment
  from public.program_payments
  where submission_id = p_referred_submission_id;

  if not found then
    return;
  end if;

  select *
  into v_status
  from public.program_participant_status
  where submission_id = p_referred_submission_id;

  v_qualifies := public.referral_stage_qualifies(
    v_settings.base_qualification,
    v_payment.status,
    v_status.completion_status,
    v_status.certificate_issued_at
  );

  v_source_key := 'base:' || v_referral.form_id::text || ':' || p_referred_submission_id::text;
  v_amount := greatest(
    0,
    round(v_payment.amount_minor * v_settings.base_commission_bps / 10000.0)::integer
  );

  if v_qualifies and v_amount > 0 then
    insert into public.program_referral_earnings (
      form_id,
      referrer_submission_id,
      promoter_id,
      referral_code,
      referred_submission_id,
      earning_type,
      source_key,
      amount_minor,
      currency,
      status,
      description
    )
    values (
      v_referral.form_id,
      v_referral.referrer_submission_id,
      v_referral.promoter_id,
      v_referral.referral_code,
      p_referred_submission_id,
      'base_commission',
      v_source_key,
      v_amount,
      v_payment.currency,
      'pending',
      'Base referral commission'
    )
    on conflict (source_key)
    do update set
      amount_minor = case
        when public.program_referral_earnings.status = 'paid'
          then public.program_referral_earnings.amount_minor
        else excluded.amount_minor
      end,
      currency = excluded.currency,
      status = case
        when public.program_referral_earnings.status in ('paid','approved')
          then public.program_referral_earnings.status
        else 'pending'
      end,
      updated_at = now();
  else
    update public.program_referral_earnings
    set
      status = case when status = 'paid' then status else 'reversed' end,
      updated_at = now()
    where source_key = v_source_key;
  end if;
end;
$function$;

create or replace function public.trigger_sync_program_referral_base_earning()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.sync_program_referral_base_earning(new.submission_id);
  return new;
end;
$function$;

drop trigger if exists trg_sync_referral_earning_from_payment on public.program_payments;
create trigger trg_sync_referral_earning_from_payment
after insert or update of status, amount_minor
on public.program_payments
for each row execute function public.trigger_sync_program_referral_base_earning();

drop trigger if exists trg_sync_referral_earning_from_completion on public.program_participant_status;
create trigger trg_sync_referral_earning_from_completion
after insert or update of completion_status, certificate_issued_at
on public.program_participant_status
for each row execute function public.trigger_sync_program_referral_base_earning();

create or replace function public.admin_recalculate_program_referral_rewards(p_form_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_submission_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  for v_submission_id in
    select referred_submission_id
    from public.program_submission_referrals
    where form_id = p_form_id
  loop
    perform public.sync_program_referral_base_earning(v_submission_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.admin_recalculate_program_referral_rewards(uuid) from public;
grant execute on function public.admin_recalculate_program_referral_rewards(uuid)
  to authenticated, service_role;

create or replace function public.admin_finalize_program_referral_rank_bonuses(p_form_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_settings public.program_referral_reward_settings;
  v_row record;
  v_bonus_bps integer;
  v_bonus_amount integer;
  v_count integer := 0;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  select *
  into v_settings
  from public.program_referral_reward_settings
  where form_id = p_form_id
  for update;

  if not found then
    raise exception 'Referral reward settings not found';
  end if;

  if not v_settings.rank_bonus_enabled then
    raise exception 'Rank bonuses are disabled';
  end if;

  if v_settings.rank_bonus_finalized_at is not null then
    raise exception 'Rank bonuses have already been finalized';
  end if;

  for v_row in
    with ranked as (
      select
        r.referral_code,
        r.referrer_submission_id,
        r.promoter_id,
        count(*) filter (
          where public.referral_stage_qualifies(
            v_settings.rank_basis,
            pay.status,
            ps.completion_status,
            ps.certificate_issued_at
          )
        )::integer as qualifying_count,
        coalesce(sum(pay.amount_minor) filter (
          where public.referral_stage_qualifies(
            v_settings.rank_basis,
            pay.status,
            ps.completion_status,
            ps.certificate_issued_at
          )
        ),0)::integer as qualifying_revenue_minor
      from public.program_submission_referrals r
      left join public.program_payments pay
        on pay.submission_id = r.referred_submission_id
      left join public.program_participant_status ps
        on ps.submission_id = r.referred_submission_id
      where r.form_id = p_form_id
      group by r.referral_code, r.referrer_submission_id, r.promoter_id
    )
    select *,
      row_number() over (
        order by qualifying_count desc, qualifying_revenue_minor desc, referral_code
      )::integer as rank_position
    from ranked
    where qualifying_count >= v_settings.minimum_rank_referrals
    order by rank_position
    limit cardinality(v_settings.rank_bonus_bps)
  loop
    v_bonus_bps := coalesce(v_settings.rank_bonus_bps[v_row.rank_position], 0);
    v_bonus_amount := round(v_row.qualifying_revenue_minor * v_bonus_bps / 10000.0)::integer;

    if v_bonus_amount > 0 then
      insert into public.program_referral_earnings (
        form_id,
        referrer_submission_id,
        promoter_id,
        referral_code,
        earning_type,
        source_key,
        amount_minor,
        currency,
        status,
        rank_position,
        description
      )
      select
        p_form_id,
        v_row.referrer_submission_id,
        v_row.promoter_id,
        v_row.referral_code,
        'rank_bonus',
        'rank:' || p_form_id::text || ':' || v_row.referral_code || ':' || v_row.rank_position::text,
        v_bonus_amount,
        coalesce(ps.currency, 'NGN'),
        'pending',
        v_row.rank_position,
        'Final leaderboard rank bonus'
      from public.program_payment_settings ps
      where ps.form_id = p_form_id
      on conflict (source_key) do nothing;

      v_count := v_count + 1;
    end if;
  end loop;

  update public.program_referral_reward_settings
  set
    rank_bonus_finalized_at = now(),
    updated_at = now(),
    updated_by = auth.uid()
  where form_id = p_form_id;

  return jsonb_build_object(
    'finalized', true,
    'bonusEntriesCreated', v_count
  );
end;
$function$;

revoke all on function public.admin_finalize_program_referral_rank_bonuses(uuid) from public;
grant execute on function public.admin_finalize_program_referral_rank_bonuses(uuid)
  to authenticated, service_role;

create or replace function public.admin_record_referral_payout(
  p_form_id uuid,
  p_referral_code text,
  p_amount_minor integer,
  p_status text default 'paid',
  p_reference text default null,
  p_note text default ''
)
returns public.program_referral_payouts
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_code text := public.normalize_program_referral_code(p_referral_code);
  v_referrer_submission_id uuid;
  v_promoter_id uuid;
  v_currency text := 'NGN';
  v_result public.program_referral_payouts;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  if p_amount_minor <= 0 then
    raise exception 'Payout amount must be greater than zero';
  end if;

  if p_status not in ('pending','approved','paid','cancelled') then
    raise exception 'Invalid payout status';
  end if;

  select submission_id
  into v_referrer_submission_id
  from public.program_referral_codes
  where form_id = p_form_id and code = v_code
  limit 1;

  if v_referrer_submission_id is null then
    select id
    into v_promoter_id
    from public.program_referral_promoters
    where form_id = p_form_id and code = v_code
    limit 1;
  end if;

  if v_referrer_submission_id is null and v_promoter_id is null then
    raise exception 'Referral source not found';
  end if;

  select currency
  into v_currency
  from public.program_payment_settings
  where form_id = p_form_id;

  insert into public.program_referral_payouts (
    form_id,
    referrer_submission_id,
    promoter_id,
    referral_code,
    amount_minor,
    currency,
    status,
    reference,
    note,
    created_by,
    approved_at,
    paid_at
  )
  values (
    p_form_id,
    v_referrer_submission_id,
    v_promoter_id,
    v_code,
    p_amount_minor,
    coalesce(v_currency,'NGN'),
    p_status,
    p_reference,
    coalesce(p_note,''),
    auth.uid(),
    case when p_status in ('approved','paid') then now() else null end,
    case when p_status = 'paid' then now() else null end
  )
  returning * into v_result;

  return v_result;
end;
$function$;

revoke all on function public.admin_record_referral_payout(uuid,text,integer,text,text,text) from public;
grant execute on function public.admin_record_referral_payout(uuid,text,integer,text,text,text)
  to authenticated, service_role;

-- Backfill existing qualifying base commissions.
select public.sync_program_referral_base_earning(r.referred_submission_id)
from public.program_submission_referrals r;
