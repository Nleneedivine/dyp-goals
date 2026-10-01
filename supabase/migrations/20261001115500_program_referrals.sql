-- Referral tracking for program registrations.
-- Each completed submission receives a shareable DYPGL code.
create table if not exists public.program_referral_codes (
  submission_id uuid primary key
    references public.program_form_submissions(id) on delete cascade,
  form_id uuid not null
    references public.program_forms(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.program_submission_referrals (
  referred_submission_id uuid primary key
    references public.program_form_submissions(id) on delete cascade,
  referrer_submission_id uuid not null
    references public.program_form_submissions(id) on delete cascade,
  form_id uuid not null
    references public.program_forms(id) on delete cascade,
  referral_code text not null,
  created_at timestamptz not null default now(),
  check (referred_submission_id <> referrer_submission_id)
);

create index if not exists program_submission_referrals_referrer_idx
  on public.program_submission_referrals (referrer_submission_id);

alter table public.program_referral_codes enable row level security;
alter table public.program_submission_referrals enable row level security;

create or replace function public.ensure_program_referral_code(
  p_submission_id uuid,
  p_form_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_code text;
begin
  select code
  into v_code
  from public.program_referral_codes
  where submission_id = p_submission_id;

  if found then
    return v_code;
  end if;

  loop
    v_code := 'DYPGL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    begin
      insert into public.program_referral_codes (submission_id, form_id, code)
      values (p_submission_id, p_form_id, v_code);
      return v_code;
    exception
      when unique_violation then
        if exists (
          select 1
          from public.program_referral_codes
          where submission_id = p_submission_id
        ) then
          select code
          into v_code
          from public.program_referral_codes
          where submission_id = p_submission_id;
          return v_code;
        end if;
    end;
  end loop;
end;
$function$;

create or replace function public.initialize_program_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.ensure_program_referral_code(new.id, new.form_id);
  return new;
end;
$function$;

drop trigger if exists trg_initialize_program_referral_code
on public.program_form_submissions;

create trigger trg_initialize_program_referral_code
after insert on public.program_form_submissions
for each row
execute function public.initialize_program_referral_code();

select public.ensure_program_referral_code(id, form_id)
from public.program_form_submissions;

revoke all on function public.ensure_program_referral_code(uuid, uuid) from public;
revoke all on function public.ensure_program_referral_code(uuid, uuid) from anon;
revoke all on function public.ensure_program_referral_code(uuid, uuid) from authenticated;
revoke all on function public.initialize_program_referral_code() from public;
revoke all on function public.initialize_program_referral_code() from anon;
revoke all on function public.initialize_program_referral_code() from authenticated;
grant execute on function public.ensure_program_referral_code(uuid, uuid) to service_role;

create or replace function public.get_program_referral_code(
  p_session_token uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_code text;
begin
  select rc.code
  into v_code
  from public.program_form_sessions s
  join public.program_form_submissions sub on sub.session_id = s.id
  join public.program_referral_codes rc on rc.submission_id = sub.id
  where s.session_token = p_session_token
    and s.completed_at is not null
  limit 1;

  return v_code;
end;
$function$;

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

  if v_referrer_submission_id is null
     or v_referrer_submission_id = v_referred_submission_id then
    return false;
  end if;

  insert into public.program_submission_referrals (
    referred_submission_id,
    referrer_submission_id,
    form_id,
    referral_code
  )
  values (
    v_referred_submission_id,
    v_referrer_submission_id,
    v_form_id,
    v_normalized_code
  )
  on conflict (referred_submission_id) do nothing;

  return found;
end;
$function$;

create or replace function public.get_program_referral_leaderboard(
  p_form_id uuid
)
returns table (
  referrer_submission_id uuid,
  referral_code text,
  total_referrals bigint,
  completed_referrals bigint
)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  return query
  select
    r.referrer_submission_id,
    rc.code,
    count(*)::bigint as total_referrals,
    count(*) filter (
      where ps.certificate_issued_at is not null
    )::bigint as completed_referrals
  from public.program_submission_referrals r
  join public.program_referral_codes rc
    on rc.submission_id = r.referrer_submission_id
  left join public.program_participant_status ps
    on ps.submission_id = r.referred_submission_id
  where r.form_id = p_form_id
  group by r.referrer_submission_id, rc.code
  order by completed_referrals desc, total_referrals desc, rc.code asc;
end;
$function$;

revoke all on function public.get_program_referral_code(uuid) from public;
revoke all on function public.record_program_referral(uuid, text) from public;
revoke all on function public.get_program_referral_leaderboard(uuid) from public;

grant execute on function public.get_program_referral_code(uuid) to anon, authenticated, service_role;
grant execute on function public.record_program_referral(uuid, text) to anon, authenticated, service_role;
grant execute on function public.get_program_referral_leaderboard(uuid) to authenticated, service_role;

comment on table public.program_submission_referrals is
  'One referral attribution per completed program submission. Completed referral counts depend on certificate issuance.';
