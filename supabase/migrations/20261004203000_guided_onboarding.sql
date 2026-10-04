-- Dynamic guided onboarding and GOALS Guide state.

create table if not exists public.user_tour_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  tour_key text not null,
  completed_at timestamptz,
  dismissed_at timestamptz,
  last_step integer not null default 0,
  auto_disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, tour_key)
);

alter table public.user_tour_state enable row level security;

drop policy if exists "Users manage own tour state" on public.user_tour_state;
create policy "Users manage own tour state"
on public.user_tour_state
for all
to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'::public.app_role))
with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'::public.app_role));

grant select, insert, update on public.user_tour_state to authenticated;
grant all on public.user_tour_state to service_role;

create or replace function public.get_goals_guide_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_enrollment_id uuid;
  v_has_vision boolean := false;
  v_goal_count integer := 0;
  v_plan_count integer := 0;
  v_today_count integer := 0;
  v_review_count integer := 0;
  v_has_accountability boolean := false;
  v_payment_status text := 'unknown';
  v_whatsapp_available boolean := false;
  v_referral_available boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select e.id
  into v_enrollment_id
  from public.program_enrollments e
  join public.program_cohorts c on c.id = e.cohort_id
  where e.user_id = v_user_id
    and c.program_key = 'goals'
    and c.is_current
    and e.status in ('active','completed')
  order by e.activated_at desc nulls last, e.registered_at desc
  limit 1;

  select exists (
    select 1
    from public.user_planning_vision v
    where v.user_id = v_user_id
      and nullif(trim(v.vision_statement),'') is not null
  ) into v_has_vision;

  select count(*)::integer
  into v_goal_count
  from public.goals g
  where g.user_id = v_user_id
    and g.status <> 'archived'
    and (v_enrollment_id is null or g.enrollment_id = v_enrollment_id);

  select count(*)::integer
  into v_plan_count
  from public.goal_tasks t
  where t.user_id = v_user_id
    and (
      v_enrollment_id is null
      or exists (
        select 1 from public.goals g
        where g.id = t.goal_id
          and g.enrollment_id = v_enrollment_id
      )
    );

  select count(*)::integer
  into v_today_count
  from public.goal_tasks t
  where t.user_id = v_user_id
    and t.scheduled_date = current_date
    and coalesce(t.status,'') <> 'completed'
    and (
      v_enrollment_id is null
      or exists (
        select 1 from public.goals g
        where g.id = t.goal_id
          and g.enrollment_id = v_enrollment_id
      )
    );

  select count(*)::integer
  into v_review_count
  from public.goal_weekly_reviews r
  where r.user_id = v_user_id;

  if v_enrollment_id is not null then
    select exists (
      select 1
      from public.program_accountability_memberships m
      where m.enrollment_id = v_enrollment_id
        and m.status = 'active'
    ) into v_has_accountability;
  end if;

  select
    coalesce(p.status,'unpaid'),
    (coalesce(ps.whatsapp_group_url,'') <> '' and p.status = 'paid'),
    exists (
      select 1
      from public.program_referral_codes rc
      where rc.submission_id = e.source_submission_id
    )
  into v_payment_status, v_whatsapp_available, v_referral_available
  from public.program_enrollments e
  left join public.program_payments p
    on p.submission_id = e.source_submission_id
  left join public.program_payment_settings ps
    on ps.form_id = p.form_id
  where e.id = v_enrollment_id;

  return jsonb_build_object(
    'hasCurrentEnrollment', v_enrollment_id is not null,
    'hasVision', v_has_vision,
    'goalCount', v_goal_count,
    'planCount', v_plan_count,
    'todayTaskCount', v_today_count,
    'reviewCount', v_review_count,
    'hasAccountabilityGroup', v_has_accountability,
    'paymentStatus', v_payment_status,
    'whatsappAvailable', v_whatsapp_available,
    'referralAvailable', v_referral_available
  );
end;
$function$;

revoke all on function public.get_goals_guide_context() from public;
revoke all on function public.get_goals_guide_context() from anon;
grant execute on function public.get_goals_guide_context() to authenticated, service_role;
