-- Short referral links, unique visitor tracking, and referral funnel attribution.

create table if not exists public.program_referral_visits (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.program_forms(id) on delete cascade,
  referral_code text not null,
  referrer_submission_id uuid references public.program_form_submissions(id) on delete set null,
  promoter_id uuid references public.program_referral_promoters(id) on delete set null,
  visitor_token uuid not null,
  click_count integer not null default 1 check (click_count > 0),
  first_clicked_at timestamptz not null default now(),
  last_clicked_at timestamptz not null default now(),
  registration_session_id uuid references public.program_form_sessions(id) on delete set null,
  referred_submission_id uuid references public.program_form_submissions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (form_id, referral_code, visitor_token),
  check (
    (referrer_submission_id is not null and promoter_id is null)
    or (referrer_submission_id is null and promoter_id is not null)
  )
);

create index if not exists program_referral_visits_code_idx
  on public.program_referral_visits(form_id, referral_code);
create index if not exists program_referral_visits_submission_idx
  on public.program_referral_visits(referred_submission_id);
create index if not exists program_referral_visits_session_idx
  on public.program_referral_visits(registration_session_id);

alter table public.program_referral_visits enable row level security;

drop policy if exists "Admins view referral visits" on public.program_referral_visits;
create policy "Admins view referral visits"
on public.program_referral_visits
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select on public.program_referral_visits to authenticated;
grant all on public.program_referral_visits to service_role;

create or replace function public.normalize_program_referral_code(p_code text)
returns text
language sql
immutable
set search_path = public
as $function$
  select case
    when upper(trim(coalesce(p_code, ''))) like 'DYPGL-%'
      then upper(trim(p_code))
    when trim(coalesce(p_code, '')) <> ''
      then 'DYPGL-' || upper(trim(p_code))
    else ''
  end;
$function$;

create or replace function public.record_program_referral_click(
  p_code text,
  p_visitor_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_code text := public.normalize_program_referral_code(p_code);
  v_form_id uuid;
  v_form_slug text;
  v_referrer_submission_id uuid;
  v_promoter_id uuid;
  v_display_name text;
  v_visitor_token uuid := coalesce(p_visitor_token, gen_random_uuid());
begin
  if v_code = '' then
    return jsonb_build_object('valid', false);
  end if;

  select
    rc.form_id,
    f.slug,
    rc.submission_id,
    coalesce(name_answer.raw_name, 'Participant')
  into
    v_form_id,
    v_form_slug,
    v_referrer_submission_id,
    v_display_name
  from public.program_referral_codes rc
  join public.program_forms f on f.id = rc.form_id
  left join lateral (
    select nullif(trim(a.answer #>> '{}'), '') as raw_name
    from public.program_form_answers a
    join public.program_form_fields ff on ff.id = a.field_id
    where a.submission_id = rc.submission_id
      and ff.field_type = 'text'
      and (
        position('first name' in lower(ff.label)) > 0
        or position('full name' in lower(ff.label)) > 0
        or lower(trim(ff.label)) = 'name'
      )
    order by ff.display_order
    limit 1
  ) name_answer on true
  where rc.code = v_code
    and f.status = 'published'
    and (f.opens_at is null or f.opens_at <= now())
    and (f.closes_at is null or f.closes_at > now())
    and (f.submission_deadline is null or f.submission_deadline > now())
  limit 1;

  if v_form_id is null then
    select p.form_id, f.slug, p.id, p.display_name
    into v_form_id, v_form_slug, v_promoter_id, v_display_name
    from public.program_referral_promoters p
    join public.program_forms f on f.id = p.form_id
    where p.code = v_code
      and p.active
      and f.status = 'published'
      and (f.opens_at is null or f.opens_at <= now())
      and (f.closes_at is null or f.closes_at > now())
      and (f.submission_deadline is null or f.submission_deadline > now())
    limit 1;
  end if;

  if v_form_id is null then
    return jsonb_build_object('valid', false);
  end if;

  insert into public.program_referral_visits (
    form_id,
    referral_code,
    referrer_submission_id,
    promoter_id,
    visitor_token
  )
  values (
    v_form_id,
    v_code,
    v_referrer_submission_id,
    v_promoter_id,
    v_visitor_token
  )
  on conflict (form_id, referral_code, visitor_token)
  do update set
    click_count = public.program_referral_visits.click_count + 1,
    last_clicked_at = now();

  return jsonb_build_object(
    'valid', true,
    'formId', v_form_id,
    'formSlug', v_form_slug,
    'referralCode', v_code,
    'shortCode', regexp_replace(v_code, '^DYPGL-', ''),
    'displayName', v_display_name,
    'visitorToken', v_visitor_token
  );
end;
$function$;

revoke all on function public.record_program_referral_click(text,uuid) from public;
grant execute on function public.record_program_referral_click(text,uuid)
  to anon, authenticated, service_role;

create or replace function public.attach_program_referral_visit(
  p_session_token uuid,
  p_referral_code text,
  p_visitor_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_session_id uuid;
  v_form_id uuid;
  v_code text := public.normalize_program_referral_code(p_referral_code);
begin
  select id, form_id
  into v_session_id, v_form_id
  from public.program_form_sessions
  where session_token = p_session_token
  limit 1;

  if v_session_id is null or v_code = '' then
    return false;
  end if;

  update public.program_referral_visits
  set registration_session_id = coalesce(registration_session_id, v_session_id)
  where form_id = v_form_id
    and referral_code = v_code
    and visitor_token = p_visitor_token;

  return found;
end;
$function$;

revoke all on function public.attach_program_referral_visit(uuid,text,uuid) from public;
grant execute on function public.attach_program_referral_visit(uuid,text,uuid)
  to anon, authenticated, service_role;

create or replace function public.record_program_referral_v2(
  p_session_token uuid,
  p_referral_code text,
  p_visitor_token uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_referred_submission_id uuid;
  v_session_id uuid;
  v_form_id uuid;
  v_referrer_submission_id uuid;
  v_promoter_id uuid;
  v_code text := public.normalize_program_referral_code(p_referral_code);
  v_inserted boolean := false;
begin
  if v_code = '' then
    return false;
  end if;

  select sub.id, sub.form_id, s.id
  into v_referred_submission_id, v_form_id, v_session_id
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
  where code = v_code
    and form_id = v_form_id
  limit 1;

  if v_referrer_submission_id = v_referred_submission_id then
    return false;
  end if;

  if v_referrer_submission_id is null then
    select id
    into v_promoter_id
    from public.program_referral_promoters
    where code = v_code
      and form_id = v_form_id
      and active
    limit 1;
  end if;

  if v_referrer_submission_id is null and v_promoter_id is null then
    return false;
  end if;

  insert into public.program_submission_referrals (
    referred_submission_id,
    referrer_submission_id,
    promoter_id,
    form_id,
    referral_code
  )
  values (
    v_referred_submission_id,
    v_referrer_submission_id,
    v_promoter_id,
    v_form_id,
    v_code
  )
  on conflict (referred_submission_id) do nothing;

  v_inserted := found;

  update public.program_referral_visits
  set
    registration_session_id = coalesce(registration_session_id, v_session_id),
    referred_submission_id = v_referred_submission_id
  where form_id = v_form_id
    and referral_code = v_code
    and (
      registration_session_id = v_session_id
      or (p_visitor_token is not null and visitor_token = p_visitor_token)
    );

  return v_inserted or exists (
    select 1
    from public.program_submission_referrals
    where referred_submission_id = v_referred_submission_id
      and referral_code = v_code
  );
end;
$function$;

revoke all on function public.record_program_referral_v2(uuid,text,uuid) from public;
grant execute on function public.record_program_referral_v2(uuid,text,uuid)
  to anon, authenticated, service_role;

create or replace function public.get_program_referral_funnel_admin(p_form_id uuid)
returns table (
  referral_code text,
  referrer_submission_id uuid,
  promoter_id uuid,
  display_name text,
  total_clicks bigint,
  unique_visitors bigint,
  registration_starts bigint,
  submitted_registrations bigint,
  pending_registrations bigint,
  pending_payments bigint,
  paid_referrals bigint,
  activated_accounts bigint,
  completed_training bigint,
  certified_referrals bigint
)
language sql
stable
security definer
set search_path = public
as $function$
  with sources as (
    select
      rc.code as referral_code,
      rc.submission_id as referrer_submission_id,
      null::uuid as promoter_id,
      coalesce(name_answer.raw_name, rc.code) as display_name
    from public.program_referral_codes rc
    left join lateral (
      select nullif(trim(a.answer #>> '{}'), '') as raw_name
      from public.program_form_answers a
      join public.program_form_fields ff on ff.id = a.field_id
      where a.submission_id = rc.submission_id
        and ff.field_type = 'text'
        and (
          position('first name' in lower(ff.label)) > 0
          or position('full name' in lower(ff.label)) > 0
          or lower(trim(ff.label)) = 'name'
        )
      order by ff.display_order
      limit 1
    ) name_answer on true
    where rc.form_id = p_form_id

    union all

    select p.code, null::uuid, p.id, p.display_name
    from public.program_referral_promoters p
    where p.form_id = p_form_id
      and p.active
  ),
  visit_stats as (
    select
      v.referral_code,
      sum(v.click_count)::bigint as total_clicks,
      count(*)::bigint as unique_visitors,
      count(*) filter (where v.registration_session_id is not null)::bigint as registration_starts
    from public.program_referral_visits v
    where v.form_id = p_form_id
    group by v.referral_code
  ),
  referral_stats as (
    select
      r.referral_code,
      count(*)::bigint as submitted_registrations,
      count(*) filter (where pay.status = 'pending')::bigint as pending_payments,
      count(*) filter (where pay.status = 'paid')::bigint as paid_referrals,
      count(*) filter (where e.user_id is not null)::bigint as activated_accounts,
      count(*) filter (where ps.completion_status = 'completed')::bigint as completed_training,
      count(*) filter (where ps.certificate_issued_at is not null)::bigint as certified_referrals
    from public.program_submission_referrals r
    left join public.program_payments pay on pay.submission_id = r.referred_submission_id
    left join public.program_enrollments e on e.source_submission_id = r.referred_submission_id
    left join public.program_participant_status ps on ps.submission_id = r.referred_submission_id
    where r.form_id = p_form_id
    group by r.referral_code
  )
  select
    s.referral_code,
    s.referrer_submission_id,
    s.promoter_id,
    s.display_name,
    coalesce(v.total_clicks, 0),
    coalesce(v.unique_visitors, 0),
    coalesce(v.registration_starts, 0),
    coalesce(r.submitted_registrations, 0),
    greatest(coalesce(v.registration_starts, 0) - coalesce(r.submitted_registrations, 0), 0),
    coalesce(r.pending_payments, 0),
    coalesce(r.paid_referrals, 0),
    coalesce(r.activated_accounts, 0),
    coalesce(r.completed_training, 0),
    coalesce(r.certified_referrals, 0)
  from sources s
  left join visit_stats v on v.referral_code = s.referral_code
  left join referral_stats r on r.referral_code = s.referral_code
  where auth.uid() is not null
    and public.has_role(auth.uid(), 'admin'::public.app_role)
  order by
    coalesce(r.certified_referrals, 0) desc,
    coalesce(r.paid_referrals, 0) desc,
    coalesce(v.unique_visitors, 0) desc,
    s.referral_code;
$function$;

revoke all on function public.get_program_referral_funnel_admin(uuid) from public;
grant execute on function public.get_program_referral_funnel_admin(uuid)
  to authenticated, service_role;
