-- Release applicant referral codes only when an application is admitted.
-- Existing/legacy submissions without an admission row remain grandfathered.
-- Independent promoter codes and promoter earnings/payouts are not modified.

-- Preserve the shared form-answer trigger for other programmes and legacy
-- submissions. Suppress code creation only for new GOALS applications that
-- have an admission row and have not yet been admitted.
create or replace function public.initialize_program_referral_code_from_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_form_id uuid;
  v_program_key text;
begin
  select s.form_id, c.program_key
  into v_form_id, v_program_key
  from public.program_form_submissions s
  left join public.program_forms f on f.id = s.form_id
  left join public.program_cohorts c on c.id = f.cohort_id
  where s.id = new.submission_id;

  if v_form_id is not null
     and not (
       v_program_key = 'goals'
       and exists (
         select 1
         from public.program_application_admissions a
         where a.submission_id = new.submission_id
           and a.status <> 'admitted'
       )
     ) then
    perform public.ensure_program_referral_code(new.submission_id, v_form_id);
  end if;

  return new;
end;
$function$;

-- Create the applicant's code at the admission transition.
create or replace function public.issue_program_referral_code_on_admission()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_form_id uuid;
begin
  if new.status = 'admitted' then
    if tg_op = 'INSERT' then
      select form_id into v_form_id
      from public.program_form_submissions
      where id = new.submission_id;
    elsif tg_op = 'UPDATE' then
      if old.status is not distinct from 'admitted' then
        return new;
      end if;
      select form_id into v_form_id
      from public.program_form_submissions
      where id = new.submission_id;
    end if;

    if v_form_id is not null then
      perform public.ensure_program_referral_code(new.submission_id, v_form_id);
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_issue_program_referral_code_on_admission
on public.program_application_admissions;
create trigger trg_issue_program_referral_code_on_admission
after insert or update of status on public.program_application_admissions
for each row
execute function public.issue_program_referral_code_on_admission();

revoke all on function public.issue_program_referral_code_on_admission() from public, anon, authenticated;

-- The bearer session RPC must not reveal an applicant code before admission.
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
  with candidates as (
    select
      rc.code,
      coalesce(name_answer.raw_name, '') as raw_name
    from public.program_referral_codes rc
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
      order by
        case
          when position('first name' in lower(f.label)) > 0 then 0
          when position('full name' in lower(f.label)) > 0 then 1
          else 2
        end,
        f.display_order
      limit 1
    ) name_answer on true
    where rc.form_id = p_form_id
      and not exists (
        select 1 from public.program_application_admissions aa
        where aa.submission_id = rc.submission_id
          and aa.status <> 'admitted'
      )
      and exists (
        select 1
        from public.program_forms pf
        where pf.id = rc.form_id
          and pf.status = 'published'
          and (pf.opens_at is null or pf.opens_at <= now())
          and (pf.closes_at is null or pf.closes_at > now())
          and (pf.submission_deadline is null or pf.submission_deadline > now())
      )
  )
  select
    c.code as referral_code,
    case
      when c.raw_name = '' then 'Participant'
      when array_length(regexp_split_to_array(c.raw_name, '\s+'), 1) > 1
        then split_part(c.raw_name, ' ', 1) || ' ' ||
             left(split_part(c.raw_name, ' ', 2), 1) || '.'
      else c.raw_name
    end as display_name
  from candidates c
  where char_length(trim(coalesce(p_query, ''))) >= 2
    and (
      c.code ilike '%' || trim(p_query) || '%'
      or c.raw_name ilike '%' || trim(p_query) || '%'
    )
  order by
    case when upper(c.code) = upper(trim(p_query)) then 0 else 1 end,
    c.raw_name,
    c.code
  limit 8;
$function$;

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

  -- Applicant referral benefits begin only after admission.
  -- Legacy submissions without an admission row remain grandfathered.
  if exists (
    select 1 from public.program_application_admissions aa
    where aa.submission_id = v_submission_id
      and aa.status <> 'admitted'
  ) then
    return jsonb_build_object(
      'available', true,
      'referralAvailable', false,
      'admissionPending', true
    );
  end if;

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
    return jsonb_build_object(
      'available', true,
      'formId', v_form_id,
      'formSlug', v_form_slug,
      'formTitle', v_form_title,
      'referralAvailable', false
    );
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

revoke all on function public.get_program_referral_code(uuid) from public;
grant execute on function public.get_program_referral_code(uuid) to anon, authenticated, service_role;

revoke all on function public.search_program_referrers(uuid,text) from public;
grant execute on function public.search_program_referrers(uuid,text) to anon, authenticated, service_role;

revoke all on function public.get_current_user_referral_dashboard() from public, anon;
grant execute on function public.get_current_user_referral_dashboard() to authenticated, service_role;
