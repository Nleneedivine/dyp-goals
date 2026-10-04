-- Participant referral dashboard and Admin people-level funnel drilldown.

create or replace function public.get_current_user_referral_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_enrollment public.program_enrollments;
  v_submission_id uuid;
  v_form_id uuid;
  v_form_slug text;
  v_form_title text;
  v_code text;
  v_short_code text;
  v_payment public.program_payments;
  v_payment_settings public.program_payment_settings;
  v_reward_settings public.program_referral_reward_settings;
  v_total_clicks bigint := 0;
  v_unique_visitors bigint := 0;
  v_registration_starts bigint := 0;
  v_submitted bigint := 0;
  v_pending_payments bigint := 0;
  v_paid bigint := 0;
  v_activated bigint := 0;
  v_completed bigint := 0;
  v_certified bigint := 0;
  v_base_earned bigint := 0;
  v_final_rank_bonus bigint := 0;
  v_paid_out bigint := 0;
  v_current_rank integer;
  v_rank_qualifying_count integer := 0;
  v_rank_revenue_minor bigint := 0;
  v_projected_bonus_bps integer := 0;
  v_projected_rank_bonus bigint := 0;
  v_currency text := 'NGN';
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select e.*
  into v_enrollment
  from public.program_enrollments e
  join public.program_cohorts c on c.id = e.cohort_id
  where e.user_id = v_user_id
    and c.program_key = 'goals'
  order by c.is_current desc, e.registered_at desc
  limit 1;

  if not found or v_enrollment.source_submission_id is null then
    return jsonb_build_object('available', false);
  end if;

  v_submission_id := v_enrollment.source_submission_id;

  select sub.form_id, f.slug, f.title
  into v_form_id, v_form_slug, v_form_title
  from public.program_form_submissions sub
  join public.program_forms f on f.id = sub.form_id
  where sub.id = v_submission_id;

  select code
  into v_code
  from public.program_referral_codes
  where submission_id = v_submission_id;

  if v_code is null then
    v_code := public.ensure_program_referral_code(v_submission_id, v_form_id);
  end if;

  v_short_code := regexp_replace(v_code, '^DYPGL-', '');

  select *
  into v_payment
  from public.program_payments
  where submission_id = v_submission_id;

  select *
  into v_payment_settings
  from public.program_payment_settings
  where form_id = v_form_id;

  select *
  into v_reward_settings
  from public.program_referral_reward_settings
  where form_id = v_form_id;

  v_currency := coalesce(v_payment_settings.currency, v_payment.currency, 'NGN');

  select
    coalesce(sum(click_count),0),
    count(*),
    count(*) filter (where registration_session_id is not null)
  into v_total_clicks, v_unique_visitors, v_registration_starts
  from public.program_referral_visits
  where form_id = v_form_id
    and referral_code = v_code;

  select
    count(*),
    count(*) filter (where pay.status = 'pending'),
    count(*) filter (where pay.status = 'paid'),
    count(*) filter (where e.user_id is not null),
    count(*) filter (where ps.completion_status = 'completed'),
    count(*) filter (where ps.certificate_issued_at is not null)
  into
    v_submitted,
    v_pending_payments,
    v_paid,
    v_activated,
    v_completed,
    v_certified
  from public.program_submission_referrals r
  left join public.program_payments pay
    on pay.submission_id = r.referred_submission_id
  left join public.program_enrollments e
    on e.source_submission_id = r.referred_submission_id
  left join public.program_participant_status ps
    on ps.submission_id = r.referred_submission_id
  where r.form_id = v_form_id
    and r.referral_code = v_code;

  select
    coalesce(sum(amount_minor) filter (
      where earning_type = 'base_commission' and status <> 'reversed'
    ),0),
    coalesce(sum(amount_minor) filter (
      where earning_type = 'rank_bonus' and status <> 'reversed'
    ),0)
  into v_base_earned, v_final_rank_bonus
  from public.program_referral_earnings
  where form_id = v_form_id
    and referral_code = v_code;

  select coalesce(sum(amount_minor),0)
  into v_paid_out
  from public.program_referral_payouts
  where form_id = v_form_id
    and referral_code = v_code
    and status = 'paid';

  if v_reward_settings.form_id is not null then
    with ranked as (
      select
        r.referral_code,
        count(*) filter (
          where public.referral_stage_qualifies(
            v_reward_settings.rank_basis,
            pay.status,
            ps.completion_status,
            ps.certificate_issued_at
          )
        )::integer as qualifying_count,
        coalesce(sum(pay.amount_minor) filter (
          where public.referral_stage_qualifies(
            v_reward_settings.rank_basis,
            pay.status,
            ps.completion_status,
            ps.certificate_issued_at
          )
        ),0)::bigint as qualifying_revenue_minor
      from public.program_submission_referrals r
      left join public.program_payments pay
        on pay.submission_id = r.referred_submission_id
      left join public.program_participant_status ps
        on ps.submission_id = r.referred_submission_id
      where r.form_id = v_form_id
        and (v_reward_settings.reward_start_at is null or r.created_at >= v_reward_settings.reward_start_at)
        and (v_reward_settings.reward_end_at is null or r.created_at <= v_reward_settings.reward_end_at)
      group by r.referral_code
    ),
    positioned as (
      select
        referral_code,
        qualifying_count,
        qualifying_revenue_minor,
        row_number() over (
          order by qualifying_count desc, qualifying_revenue_minor desc, referral_code
        )::integer as rank_position
      from ranked
    )
    select rank_position, qualifying_count, qualifying_revenue_minor
    into v_current_rank, v_rank_qualifying_count, v_rank_revenue_minor
    from positioned
    where referral_code = v_code;

    if v_reward_settings.rank_bonus_enabled
       and v_reward_settings.rank_bonus_finalized_at is null
       and v_current_rank is not null
       and v_rank_qualifying_count >= v_reward_settings.minimum_rank_referrals
       and v_current_rank <= cardinality(v_reward_settings.rank_bonus_bps) then
      v_projected_bonus_bps := coalesce(v_reward_settings.rank_bonus_bps[v_current_rank],0);
      v_projected_rank_bonus :=
        round(v_rank_revenue_minor * v_projected_bonus_bps / 10000.0)::bigint;
    else
      v_projected_rank_bonus := v_final_rank_bonus;
    end if;
  end if;

  return jsonb_build_object(
    'available', true,
    'formId', v_form_id,
    'formSlug', v_form_slug,
    'formTitle', v_form_title,
    'enrollmentStatus', v_enrollment.status,
    'paymentStatus', coalesce(v_payment.status, 'unpaid'),
    'whatsappGroupUrl', case
      when v_payment.status = 'paid' then coalesce(v_payment_settings.whatsapp_group_url,'')
      else ''
    end,
    'referralCode', v_code,
    'shortCode', v_short_code,
    'currency', v_currency,
    'totalClicks', v_total_clicks,
    'uniqueVisitors', v_unique_visitors,
    'registrationStarts', v_registration_starts,
    'submittedRegistrations', v_submitted,
    'pendingRegistrations', greatest(v_registration_starts - v_submitted, 0),
    'pendingPayments', v_pending_payments,
    'paidReferrals', v_paid,
    'activatedAccounts', v_activated,
    'completedTraining', v_completed,
    'certifiedReferrals', v_certified,
    'currentRank', v_current_rank,
    'rankQualifyingCount', v_rank_qualifying_count,
    'baseCommissionBps', coalesce(v_reward_settings.base_commission_bps,0),
    'baseQualification', coalesce(v_reward_settings.base_qualification,'paid'),
    'rankBasis', coalesce(v_reward_settings.rank_basis,'certified'),
    'rankBonusFinalized', (v_reward_settings.rank_bonus_finalized_at is not null),
    'projectedRankBonusMinor', v_projected_rank_bonus,
    'baseEarningsMinor', v_base_earned,
    'finalizedRankBonusMinor', v_final_rank_bonus,
    'totalEarnedMinor', v_base_earned + v_final_rank_bonus,
    'paidOutMinor', v_paid_out,
    'outstandingMinor', greatest((v_base_earned + v_final_rank_bonus) - v_paid_out,0)
  );
end;
$function$;

revoke all on function public.get_current_user_referral_dashboard() from public;
revoke all on function public.get_current_user_referral_dashboard() from anon;
grant execute on function public.get_current_user_referral_dashboard()
  to authenticated, service_role;

create or replace function public.get_program_referral_people_admin(
  p_form_id uuid,
  p_referral_code text default null
)
returns table (
  referral_code text,
  referred_submission_id uuid,
  display_name text,
  email text,
  submitted_at timestamptz,
  payment_status text,
  account_activated boolean,
  completion_status text,
  certificate_issued_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    r.referral_code,
    r.referred_submission_id,
    coalesce(
      nullif(trim(first_name.answer #>> '{}'), ''),
      nullif(trim(full_name.answer #>> '{}'), ''),
      'Participant'
    ) as display_name,
    coalesce(nullif(trim(email_answer.answer #>> '{}'), ''), '') as email,
    sub.submitted_at,
    coalesce(pay.status,'unpaid') as payment_status,
    (e.user_id is not null) as account_activated,
    coalesce(ps.completion_status,'registered') as completion_status,
    ps.certificate_issued_at
  from public.program_submission_referrals r
  join public.program_form_submissions sub
    on sub.id = r.referred_submission_id
  left join lateral (
    select a.answer
    from public.program_form_answers a
    join public.program_form_fields f on f.id = a.field_id
    where a.submission_id = r.referred_submission_id
      and f.field_type = 'text'
      and position('first name' in lower(f.label)) > 0
    order by f.display_order
    limit 1
  ) first_name on true
  left join lateral (
    select a.answer
    from public.program_form_answers a
    join public.program_form_fields f on f.id = a.field_id
    where a.submission_id = r.referred_submission_id
      and f.field_type = 'text'
      and (
        position('full name' in lower(f.label)) > 0
        or lower(trim(f.label)) = 'name'
      )
    order by f.display_order
    limit 1
  ) full_name on true
  left join lateral (
    select a.answer
    from public.program_form_answers a
    join public.program_form_fields f on f.id = a.field_id
    where a.submission_id = r.referred_submission_id
      and f.field_type = 'email'
    order by f.display_order
    limit 1
  ) email_answer on true
  left join public.program_payments pay
    on pay.submission_id = r.referred_submission_id
  left join public.program_enrollments e
    on e.source_submission_id = r.referred_submission_id
  left join public.program_participant_status ps
    on ps.submission_id = r.referred_submission_id
  where r.form_id = p_form_id
    and (p_referral_code is null or r.referral_code = public.normalize_program_referral_code(p_referral_code))
    and auth.uid() is not null
    and public.has_role(auth.uid(), 'admin'::public.app_role)
  order by sub.submitted_at desc;
$function$;

revoke all on function public.get_program_referral_people_admin(uuid,text) from public;
grant execute on function public.get_program_referral_people_admin(uuid,text)
  to authenticated, service_role;


-- Prevent Admin from recording payouts beyond confirmed earnings.
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
  v_total_earned integer := 0;
  v_committed_payouts integer := 0;
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

  select coalesce(sum(amount_minor),0)::integer
  into v_total_earned
  from public.program_referral_earnings
  where form_id = p_form_id
    and referral_code = v_code
    and status <> 'reversed';

  select coalesce(sum(amount_minor),0)::integer
  into v_committed_payouts
  from public.program_referral_payouts
  where form_id = p_form_id
    and referral_code = v_code
    and status in ('pending','approved','paid');

  if p_status <> 'cancelled'
     and v_committed_payouts + p_amount_minor > v_total_earned then
    raise exception 'Payout exceeds available referral earnings';
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
