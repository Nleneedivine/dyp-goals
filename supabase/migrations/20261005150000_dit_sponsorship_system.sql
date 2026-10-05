-- DIT-sponsored program seats, configurable campaign questions and verification workflow.

create table if not exists public.program_sponsorship_campaigns (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.program_forms(id) on delete cascade,
  sponsor_name text not null default 'DIT',
  name text not null,
  code text not null,
  active boolean not null default true,
  questions_enabled boolean not null default true,
  approval_required boolean not null default true,
  seat_limit integer check (seat_limit is null or seat_limit >= 0),
  seat_value_minor integer not null default 0 check (seat_value_minor >= 0),
  participant_amount_minor integer not null default 0 check (participant_amount_minor >= 0),
  currency text not null default 'NGN',
  starts_at timestamptz,
  ends_at timestamptz,
  referral_commission_mode text not null default 'none'
    check (referral_commission_mode in ('none','participant_amount','seat_value')),
  count_for_referral_leaderboard boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(form_id, code),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table if not exists public.program_sponsorship_questions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.program_sponsorship_campaigns(id) on delete cascade,
  label text not null,
  helper_text text not null default '',
  field_type text not null default 'text'
    check (field_type in ('text','textarea','dropdown','radio','multi_select','checkbox','number')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  display_order integer not null default 0,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sponsorship_questions_campaign_order_idx
  on public.program_sponsorship_questions(campaign_id, display_order);

create table if not exists public.program_sponsorship_claims (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.program_sponsorship_campaigns(id) on delete restrict,
  form_id uuid not null references public.program_forms(id) on delete cascade,
  submission_id uuid not null unique references public.program_form_submissions(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','revoked')),
  answers jsonb not null default '{}'::jsonb,
  covered_amount_minor integer not null default 0 check (covered_amount_minor >= 0),
  participant_amount_minor integer not null default 0 check (participant_amount_minor >= 0),
  currency text not null default 'NGN',
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  rejection_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sponsorship_claims_campaign_status_idx
  on public.program_sponsorship_claims(campaign_id, status, requested_at desc);

alter table public.program_sponsorship_campaigns enable row level security;
alter table public.program_sponsorship_questions enable row level security;
alter table public.program_sponsorship_claims enable row level security;

drop policy if exists "Admins manage sponsorship campaigns" on public.program_sponsorship_campaigns;
create policy "Admins manage sponsorship campaigns"
on public.program_sponsorship_campaigns
for all to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Admins manage sponsorship questions" on public.program_sponsorship_questions;
create policy "Admins manage sponsorship questions"
on public.program_sponsorship_questions
for all to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Admins view sponsorship claims" on public.program_sponsorship_claims;
create policy "Admins view sponsorship claims"
on public.program_sponsorship_claims
for select to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select,insert,update,delete on public.program_sponsorship_campaigns to authenticated;
grant select,insert,update,delete on public.program_sponsorship_questions to authenticated;
grant select on public.program_sponsorship_claims to authenticated;
grant all on public.program_sponsorship_campaigns to service_role;
grant all on public.program_sponsorship_questions to service_role;
grant all on public.program_sponsorship_claims to service_role;

create or replace function public.normalize_sponsorship_code(p_code text)
returns text
language sql
immutable
set search_path = public
as $function$
  select upper(regexp_replace(trim(coalesce(p_code,'')), '[^A-Z0-9_-]', '', 'g'));
$function$;

create or replace function public.get_public_sponsorship_campaign(
  p_form_id uuid,
  p_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_campaign public.program_sponsorship_campaigns;
  v_claimed integer := 0;
  v_questions jsonb := '[]'::jsonb;
begin
  select *
  into v_campaign
  from public.program_sponsorship_campaigns
  where form_id = p_form_id
    and code = public.normalize_sponsorship_code(p_code)
    and active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  limit 1;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  select count(*)::integer
  into v_claimed
  from public.program_sponsorship_claims
  where campaign_id = v_campaign.id
    and status in ('pending','approved');

  if v_campaign.seat_limit is not null and v_claimed >= v_campaign.seat_limit then
    return jsonb_build_object(
      'valid', false,
      'reason', 'full',
      'message', 'All sponsored seats in this campaign have already been claimed.'
    );
  end if;

  if v_campaign.questions_enabled then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'label', q.label,
          'helperText', q.helper_text,
          'fieldType', q.field_type,
          'options', q.options,
          'required', q.required,
          'displayOrder', q.display_order
        )
        order by q.display_order
      ),
      '[]'::jsonb
    )
    into v_questions
    from public.program_sponsorship_questions q
    where q.campaign_id = v_campaign.id
      and q.active
      and q.archived_at is null;
  end if;

  return jsonb_build_object(
    'valid', true,
    'campaignId', v_campaign.id,
    'name', v_campaign.name,
    'sponsorName', v_campaign.sponsor_name,
    'code', v_campaign.code,
    'seatValueMinor', v_campaign.seat_value_minor,
    'participantAmountMinor', v_campaign.participant_amount_minor,
    'currency', v_campaign.currency,
    'approvalRequired', v_campaign.approval_required,
    'questionsEnabled', v_campaign.questions_enabled,
    'questions', v_questions,
    'seatsRemaining', case
      when v_campaign.seat_limit is null then null
      else greatest(v_campaign.seat_limit - v_claimed, 0)
    end
  );
end;
$function$;

revoke all on function public.get_public_sponsorship_campaign(uuid,text) from public;
grant execute on function public.get_public_sponsorship_campaign(uuid,text)
to anon, authenticated, service_role;

create or replace function public.submit_program_sponsorship_claim(
  p_session_token uuid,
  p_code text,
  p_answers jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_submission_id uuid;
  v_form_id uuid;
  v_campaign public.program_sponsorship_campaigns;
  v_claimed integer := 0;
  v_question record;
  v_answer jsonb;
  v_status text;
  v_claim_id uuid;
begin
  select sub.id, sub.form_id
  into v_submission_id, v_form_id
  from public.program_form_sessions s
  join public.program_form_submissions sub on sub.session_id = s.id
  where s.session_token = p_session_token
    and s.completed_at is not null
  limit 1;

  if v_submission_id is null then
    raise exception 'Completed registration not found';
  end if;

  select *
  into v_campaign
  from public.program_sponsorship_campaigns
  where form_id = v_form_id
    and code = public.normalize_sponsorship_code(p_code)
    and active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  limit 1;

  if not found then
    raise exception 'Sponsorship code is invalid or inactive';
  end if;

  select count(*)::integer
  into v_claimed
  from public.program_sponsorship_claims
  where campaign_id = v_campaign.id
    and status in ('pending','approved')
    and submission_id <> v_submission_id;

  if v_campaign.seat_limit is not null and v_claimed >= v_campaign.seat_limit then
    raise exception 'All sponsored seats in this campaign have already been claimed';
  end if;

  if v_campaign.questions_enabled then
    for v_question in
      select *
      from public.program_sponsorship_questions
      where campaign_id = v_campaign.id
        and active
        and archived_at is null
        and required
    loop
      v_answer := p_answers -> v_question.id::text;
      if v_answer is null
         or v_answer = 'null'::jsonb
         or v_answer = '""'::jsonb
         or v_answer = '[]'::jsonb
         or v_answer = 'false'::jsonb then
        raise exception 'Please complete the required sponsorship question: %', v_question.label;
      end if;
    end loop;
  end if;

  v_status := case when v_campaign.approval_required then 'pending' else 'approved' end;

  insert into public.program_sponsorship_claims (
    campaign_id,
    form_id,
    submission_id,
    status,
    answers,
    covered_amount_minor,
    participant_amount_minor,
    currency,
    reviewed_at
  )
  values (
    v_campaign.id,
    v_form_id,
    v_submission_id,
    v_status,
    coalesce(p_answers,'{}'::jsonb),
    v_campaign.seat_value_minor,
    v_campaign.participant_amount_minor,
    v_campaign.currency,
    case when v_status = 'approved' then now() else null end
  )
  on conflict (submission_id)
  do update set
    campaign_id = excluded.campaign_id,
    status = excluded.status,
    answers = excluded.answers,
    covered_amount_minor = excluded.covered_amount_minor,
    participant_amount_minor = excluded.participant_amount_minor,
    currency = excluded.currency,
    rejection_reason = '',
    reviewed_at = excluded.reviewed_at,
    reviewed_by = null,
    updated_at = now()
  returning id into v_claim_id;

  if v_status = 'approved' then
    update public.program_enrollments
    set status = 'active',
        activated_at = coalesce(activated_at, now()),
        updated_at = now()
    where source_submission_id = v_submission_id
      and status not in ('completed','withdrawn');
  end if;

  return jsonb_build_object(
    'claimId', v_claim_id,
    'status', v_status,
    'sponsorName', v_campaign.sponsor_name,
    'campaignName', v_campaign.name,
    'participantAmountMinor', v_campaign.participant_amount_minor,
    'seatValueMinor', v_campaign.seat_value_minor,
    'currency', v_campaign.currency
  );
end;
$function$;

revoke all on function public.submit_program_sponsorship_claim(uuid,text,jsonb) from public;
grant execute on function public.submit_program_sponsorship_claim(uuid,text,jsonb)
to anon, authenticated, service_role;

create or replace function public.admin_review_sponsorship_claim(
  p_claim_id uuid,
  p_approve boolean,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_claim public.program_sponsorship_claims;
  v_campaign public.program_sponsorship_campaigns;
  v_enrollment public.program_enrollments;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  select * into v_claim
  from public.program_sponsorship_claims
  where id = p_claim_id
  for update;

  if not found then raise exception 'Sponsorship claim not found'; end if;

  select * into v_campaign
  from public.program_sponsorship_campaigns
  where id = v_claim.campaign_id;

  update public.program_sponsorship_claims
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      rejection_reason = case when p_approve then '' else trim(coalesce(p_reason,'')) end,
      updated_at = now()
  where id = p_claim_id;

  select * into v_enrollment
  from public.program_enrollments
  where source_submission_id = v_claim.submission_id;

  if p_approve and v_enrollment.id is not null then
    update public.program_enrollments
    set status = 'active',
        activated_at = coalesce(activated_at, now()),
        updated_at = now()
    where id = v_enrollment.id
      and status not in ('completed','withdrawn');

    if v_enrollment.user_id is not null then
      perform public.queue_user_notification(
        v_enrollment.user_id,
        'sponsorship_approved',
        'Your DIT-sponsored GOALS seat is approved',
        'Your GOALS seat has been sponsored by ' || v_campaign.sponsor_name || '. You do not need to make a participant payment.',
        'Open Program Access',
        '/profile',
        jsonb_build_object('claimId', p_claim_id, 'campaignId', v_campaign.id),
        true
      );
    end if;
  elsif not p_approve and v_enrollment.id is not null then
    update public.program_enrollments
    set status = case when status = 'active' and activated_at is not null then status else 'payment_pending' end,
        updated_at = now()
    where id = v_enrollment.id
      and status not in ('completed','withdrawn');

    if v_enrollment.user_id is not null then
      perform public.queue_user_notification(
        v_enrollment.user_id,
        'sponsorship_rejected',
        'Your DIT sponsorship request needs attention',
        case when trim(coalesce(p_reason,'')) <> ''
          then trim(p_reason)
          else 'Your sponsorship request was not approved. You can continue with the regular payment option.'
        end,
        'Open Program Access',
        '/profile',
        jsonb_build_object('claimId', p_claim_id),
        true
      );
    end if;
  end if;

  return jsonb_build_object(
    'claimId', p_claim_id,
    'status', case when p_approve then 'approved' else 'rejected' end
  );
end;
$function$;

revoke all on function public.admin_review_sponsorship_claim(uuid,boolean,text) from public;
grant execute on function public.admin_review_sponsorship_claim(uuid,boolean,text)
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
  v_claim public.program_sponsorship_claims;
  v_campaign public.program_sponsorship_campaigns;
begin
  select sub.*
  into v_submission
  from public.program_form_sessions s
  join public.program_form_submissions sub on sub.session_id = s.id
  where s.session_token = p_session_token
    and s.completed_at is not null
  limit 1;

  if not found then return jsonb_build_object('available', false); end if;

  select * into v_settings
  from public.program_payment_settings
  where form_id = v_submission.form_id;

  if not found then return jsonb_build_object('available', false); end if;

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
    'manualEnabled', case when v_claim.status in ('pending','approved') then false else v_settings.manual_enabled end,
    'paystackEnabled', case when v_claim.status in ('pending','approved') then false else v_settings.paystack_enabled end,
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
      v_payment.status = 'paid'
      or v_claim.status = 'approved'
    ),
    'whatsappGroupUrl', case
      when v_payment.status = 'paid' or v_claim.status = 'approved'
        then v_settings.whatsapp_group_url
      else ''
    end
  );
end;
$function$;

-- Keep Program Access visible even with zero referrals and expose funding state.
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
  v_claim public.program_sponsorship_claims;
  v_campaign public.program_sponsorship_campaigns;
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
  v_projected_rank_bonus bigint := 0;
  v_currency text := 'NGN';
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select e.* into v_enrollment
  from public.program_enrollments e
  join public.program_cohorts c on c.id = e.cohort_id
  where e.user_id = v_user_id and c.program_key = 'goals'
  order by c.is_current desc, e.registered_at desc
  limit 1;

  if not found or v_enrollment.source_submission_id is null then
    return jsonb_build_object(
      'available', false,
      'reason', 'no-linked-enrollment',
      'message', 'No current GOALS registration is linked to this account.'
    );
  end if;

  v_submission_id := v_enrollment.source_submission_id;

  select sub.form_id, f.slug, f.title
  into v_form_id, v_form_slug, v_form_title
  from public.program_form_submissions sub
  join public.program_forms f on f.id = sub.form_id
  where sub.id = v_submission_id;

  select code into v_code
  from public.program_referral_codes
  where submission_id = v_submission_id;

  v_short_code := case when v_code is null then null else regexp_replace(v_code, '^DYPGL-', '') end;

  select * into v_payment from public.program_payments where submission_id = v_submission_id;
  select * into v_payment_settings from public.program_payment_settings where form_id = v_form_id;
  select * into v_claim from public.program_sponsorship_claims where submission_id = v_submission_id order by created_at desc limit 1;
  if v_claim.id is not null then
    select * into v_campaign from public.program_sponsorship_campaigns where id = v_claim.campaign_id;
  end if;
  select * into v_reward_settings from public.program_referral_reward_settings where form_id = v_form_id;

  v_currency := coalesce(v_claim.currency, v_payment_settings.currency, v_payment.currency, 'NGN');

  if v_code is not null then
    select coalesce(sum(click_count),0), count(*), count(*) filter (where registration_session_id is not null)
    into v_total_clicks, v_unique_visitors, v_registration_starts
    from public.program_referral_visits
    where form_id = v_form_id and referral_code = v_code;

    select
      count(*),
      count(*) filter (where pay.status = 'pending'),
      count(*) filter (where pay.status = 'paid'),
      count(*) filter (where e.user_id is not null),
      count(*) filter (where ps.completion_status = 'completed'),
      count(*) filter (where ps.certificate_issued_at is not null)
    into v_submitted, v_pending_payments, v_paid, v_activated, v_completed, v_certified
    from public.program_submission_referrals r
    left join public.program_payments pay on pay.submission_id = r.referred_submission_id
    left join public.program_enrollments e on e.source_submission_id = r.referred_submission_id
    left join public.program_participant_status ps on ps.submission_id = r.referred_submission_id
    where r.form_id = v_form_id and r.referral_code = v_code;

    select
      coalesce(sum(amount_minor) filter (where earning_type='base_commission' and status <> 'reversed'),0),
      coalesce(sum(amount_minor) filter (where earning_type='rank_bonus' and status <> 'reversed'),0)
    into v_base_earned, v_final_rank_bonus
    from public.program_referral_earnings
    where form_id=v_form_id and referral_code=v_code;

    select coalesce(sum(amount_minor),0) into v_paid_out
    from public.program_referral_payouts
    where form_id=v_form_id and referral_code=v_code and status='paid';
  end if;

  return jsonb_build_object(
    'available', true,
    'formId', v_form_id,
    'formSlug', v_form_slug,
    'formTitle', v_form_title,
    'enrollmentStatus', v_enrollment.status,
    'fundingType', case when v_claim.id is not null then 'sponsored' else 'self_paid' end,
    'paymentStatus', coalesce(v_payment.status, 'unpaid'),
    'financiallySatisfied', (v_payment.status='paid' or v_claim.status='approved'),
    'sponsorshipStatus', v_claim.status,
    'sponsorName', v_campaign.sponsor_name,
    'sponsorshipCampaignName', v_campaign.name,
    'participantAmountMinor', coalesce(v_claim.participant_amount_minor, v_payment_settings.amount_minor, 0),
    'sponsoredSeatValueMinor', coalesce(v_claim.covered_amount_minor,0),
    'sponsorshipRejectionReason', v_claim.rejection_reason,
    'whatsappGroupUrl', case
      when v_payment.status='paid' or v_claim.status='approved'
        then coalesce(v_payment_settings.whatsapp_group_url,'')
      else ''
    end,
    'referralAvailable', (v_code is not null),
    'referralCode', v_code,
    'shortCode', v_short_code,
    'currency', v_currency,
    'totalClicks', v_total_clicks,
    'uniqueVisitors', v_unique_visitors,
    'registrationStarts', v_registration_starts,
    'submittedRegistrations', v_submitted,
    'pendingRegistrations', greatest(v_registration_starts-v_submitted,0),
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
    'totalEarnedMinor', v_base_earned+v_final_rank_bonus,
    'paidOutMinor', v_paid_out,
    'outstandingMinor', greatest((v_base_earned+v_final_rank_bonus)-v_paid_out,0)
  );
end;
$function$;

-- Seed a DIT campaign for GOALS26 with the two requested questions.
insert into public.program_sponsorship_campaigns (
  form_id, sponsor_name, name, code, active, questions_enabled, approval_required,
  seat_value_minor, participant_amount_minor, currency,
  referral_commission_mode, count_for_referral_leaderboard
)
select
  f.id, 'DIT', 'DIT Sponsored Members · GOALS26', 'DITGOALS26', true, true, true,
  coalesce(ps.amount_minor,500000), 0, coalesce(ps.currency,'NGN'),
  'none', false
from public.program_forms f
left join public.program_payment_settings ps on ps.form_id=f.id
where f.slug='goals-masterclass-2026'
on conflict (form_id,code) do nothing;

insert into public.program_sponsorship_questions (
  campaign_id,label,helper_text,field_type,options,required,display_order
)
select c.id, q.label, q.helper_text, q.field_type, q.options::jsonb, true, q.display_order
from public.program_sponsorship_campaigns c
cross join (
  values
    ('Which faction/arm of DIT do you belong to?','Choose the DIT faction, arm, directorate or unit you currently belong to.','text','[]',10),
    ('What is your current role in DIT?','Tell us your current responsibility or position within DIT.','text','[]',20)
) as q(label,helper_text,field_type,options,display_order)
where c.code='DITGOALS26'
  and not exists (
    select 1 from public.program_sponsorship_questions existing
    where existing.campaign_id=c.id and existing.label=q.label
  );


create or replace function public.resolve_sponsorship_link(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_campaign public.program_sponsorship_campaigns;
  v_slug text;
begin
  select c.*, f.slug
  into v_campaign, v_slug
  from public.program_sponsorship_campaigns c
  join public.program_forms f on f.id = c.form_id
  where c.code = public.normalize_sponsorship_code(p_code)
    and c.active
    and f.status = 'published'
    and (c.starts_at is null or c.starts_at <= now())
    and (c.ends_at is null or c.ends_at > now())
  order by c.created_at desc
  limit 1;

  if v_campaign.id is null then
    return jsonb_build_object('valid', false);
  end if;

  return jsonb_build_object(
    'valid', true,
    'formId', v_campaign.form_id,
    'formSlug', v_slug,
    'code', v_campaign.code,
    'campaignName', v_campaign.name,
    'sponsorName', v_campaign.sponsor_name
  );
end;
$function$;

revoke all on function public.resolve_sponsorship_link(text) from public;
grant execute on function public.resolve_sponsorship_link(text)
to anon, authenticated, service_role;


create or replace function public.get_sponsorship_claims_admin(p_campaign_id uuid)
returns table (
  claim_id uuid,
  submission_id uuid,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  rejection_reason text,
  covered_amount_minor integer,
  participant_amount_minor integer,
  currency text,
  participant_name text,
  participant_email text,
  answers jsonb
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    c.id,
    c.submission_id,
    c.status,
    c.requested_at,
    c.reviewed_at,
    c.rejection_reason,
    c.covered_amount_minor,
    c.participant_amount_minor,
    c.currency,
    coalesce(
      nullif(trim(first_name.answer #>> '{}'),''),
      nullif(trim(full_name.answer #>> '{}'),''),
      'Participant'
    ),
    coalesce(nullif(trim(email_answer.answer #>> '{}'),''),''),
    c.answers
  from public.program_sponsorship_claims c
  left join lateral (
    select a.answer
    from public.program_form_answers a
    join public.program_form_fields f on f.id=a.field_id
    where a.submission_id=c.submission_id
      and position('first name' in lower(f.label)) > 0
    order by f.display_order
    limit 1
  ) first_name on true
  left join lateral (
    select a.answer
    from public.program_form_answers a
    join public.program_form_fields f on f.id=a.field_id
    where a.submission_id=c.submission_id
      and (position('full name' in lower(f.label)) > 0 or lower(trim(f.label))='name')
    order by f.display_order
    limit 1
  ) full_name on true
  left join lateral (
    select a.answer
    from public.program_form_answers a
    join public.program_form_fields f on f.id=a.field_id
    where a.submission_id=c.submission_id
      and f.field_type='email'
    order by f.display_order
    limit 1
  ) email_answer on true
  where c.campaign_id=p_campaign_id
    and auth.uid() is not null
    and public.has_role(auth.uid(),'admin'::public.app_role)
  order by
    case c.status when 'pending' then 0 when 'approved' then 1 when 'rejected' then 2 else 3 end,
    c.requested_at desc;
$function$;

grant execute on function public.get_sponsorship_claims_admin(uuid)
to authenticated, service_role;

create or replace function public.get_sponsorship_analytics_admin(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_campaign public.program_sponsorship_campaigns;
  v_pending integer := 0;
  v_approved integer := 0;
  v_rejected integer := 0;
  v_revoked integer := 0;
  v_completed integer := 0;
  v_certified integer := 0;
  v_accounts integer := 0;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(),'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  select * into v_campaign
  from public.program_sponsorship_campaigns
  where id=p_campaign_id;

  if not found then raise exception 'Campaign not found'; end if;

  select
    count(*) filter (where c.status='pending'),
    count(*) filter (where c.status='approved'),
    count(*) filter (where c.status='rejected'),
    count(*) filter (where c.status='revoked'),
    count(*) filter (where ps.completion_status='completed'),
    count(*) filter (where ps.certificate_issued_at is not null),
    count(*) filter (where e.user_id is not null)
  into
    v_pending,v_approved,v_rejected,v_revoked,v_completed,v_certified,v_accounts
  from public.program_sponsorship_claims c
  left join public.program_participant_status ps on ps.submission_id=c.submission_id
  left join public.program_enrollments e on e.source_submission_id=c.submission_id
  where c.campaign_id=p_campaign_id;

  return jsonb_build_object(
    'seatLimit', v_campaign.seat_limit,
    'pending', v_pending,
    'approved', v_approved,
    'rejected', v_rejected,
    'revoked', v_revoked,
    'claimed', v_pending+v_approved,
    'remaining', case when v_campaign.seat_limit is null then null else greatest(v_campaign.seat_limit-(v_pending+v_approved),0) end,
    'approvedSeatValueMinor', v_approved*v_campaign.seat_value_minor,
    'potentialSeatValueMinor', (v_pending+v_approved)*v_campaign.seat_value_minor,
    'accountsActivated', v_accounts,
    'trainingCompleted', v_completed,
    'certified', v_certified,
    'currency', v_campaign.currency
  );
end;
$function$;

grant execute on function public.get_sponsorship_analytics_admin(uuid)
to authenticated, service_role;


create or replace function public.admin_create_sponsorship_campaign(
  p_form_id uuid,
  p_name text,
  p_sponsor_name text default 'DIT',
  p_seat_limit integer default null
)
returns public.program_sponsorship_campaigns
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_code text;
  v_suffix text;
  v_settings public.program_payment_settings;
  v_result public.program_sponsorship_campaigns;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(),'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  if char_length(trim(coalesce(p_name,''))) < 3 then
    raise exception 'Campaign name is required';
  end if;

  select * into v_settings
  from public.program_payment_settings
  where form_id=p_form_id;

  loop
    v_suffix := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    v_code := 'DIT-' || v_suffix;
    exit when not exists (
      select 1 from public.program_sponsorship_campaigns
      where form_id=p_form_id and code=v_code
    );
  end loop;

  insert into public.program_sponsorship_campaigns (
    form_id,sponsor_name,name,code,active,questions_enabled,approval_required,
    seat_limit,seat_value_minor,participant_amount_minor,currency,
    referral_commission_mode,count_for_referral_leaderboard,created_by
  )
  values (
    p_form_id,
    coalesce(nullif(trim(p_sponsor_name),''),'DIT'),
    trim(p_name),
    v_code,
    true,true,true,
    p_seat_limit,
    coalesce(v_settings.amount_minor,0),
    0,
    coalesce(v_settings.currency,'NGN'),
    'none',
    false,
    auth.uid()
  )
  returning * into v_result;

  return v_result;
end;
$function$;

revoke all on function public.admin_create_sponsorship_campaign(uuid,text,text,integer) from public;
grant execute on function public.admin_create_sponsorship_campaign(uuid,text,text,integer)
to authenticated, service_role;
