-- Restore the original DYP referral-code convention for new program registrations.
-- Format: DYPGL-FL**** where F/L are the first/last letters of the participant's
-- first name and **** is the last four digits of their phone number.
-- Existing issued codes are preserved so active referral links do not break.

drop trigger if exists trg_initialize_program_referral_code
on public.program_form_submissions;

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
  v_existing text;
  v_name text;
  v_first_name text;
  v_phone text;
  v_digits text;
  v_base text;
  v_code text;
  v_suffix integer := 2;
begin
  select code
  into v_existing
  from public.program_referral_codes
  where submission_id = p_submission_id;

  if found then
    return v_existing;
  end if;

  select nullif(trim(a.answer #>> '{}'), '')
  into v_name
  from public.program_form_answers a
  join public.program_form_fields f on f.id = a.field_id
  where a.submission_id = p_submission_id
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
  limit 1;

  select nullif(trim(a.answer #>> '{}'), '')
  into v_phone
  from public.program_form_answers a
  join public.program_form_fields f on f.id = a.field_id
  where a.submission_id = p_submission_id
    and (
      f.field_type = 'phone'
      or position('phone' in lower(f.label)) > 0
      or position('whatsapp' in lower(f.label)) > 0
    )
  order by
    case when f.field_type = 'phone' then 0 else 1 end,
    f.display_order
  limit 1;

  if v_name is null or v_phone is null then
    return null;
  end if;

  v_first_name := split_part(regexp_replace(trim(v_name), '\s+', ' ', 'g'), ' ', 1);
  v_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');

  if char_length(v_first_name) < 1 or char_length(v_digits) < 4 then
    return null;
  end if;

  v_base :=
    'DYPGL-' ||
    upper(left(v_first_name, 1) || right(v_first_name, 1)) ||
    right(v_digits, 4);

  v_code := v_base;
  while exists (
    select 1
    from public.program_referral_codes
    where code = v_code
      and submission_id <> p_submission_id
  ) loop
    v_code := v_base || '-' || v_suffix::text;
    v_suffix := v_suffix + 1;
  end loop;

  insert into public.program_referral_codes (submission_id, form_id, code)
  values (p_submission_id, p_form_id, v_code)
  on conflict (submission_id) do update
    set form_id = excluded.form_id
  returning code into v_code;

  return v_code;
end;
$function$;

create or replace function public.initialize_program_referral_code_from_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_form_id uuid;
begin
  select s.form_id
  into v_form_id
  from public.program_form_submissions s
  where s.id = new.submission_id;

  if v_form_id is not null then
    perform public.ensure_program_referral_code(new.submission_id, v_form_id);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_initialize_program_referral_code_from_answer
on public.program_form_answers;

create trigger trg_initialize_program_referral_code_from_answer
after insert or update of answer on public.program_form_answers
for each row
execute function public.initialize_program_referral_code_from_answer();

-- Backfill only submissions that do not already have a code. Existing codes are
-- intentionally preserved so previously shared links remain valid.
select public.ensure_program_referral_code(s.id, s.form_id)
from public.program_form_submissions s
where not exists (
  select 1
  from public.program_referral_codes rc
  where rc.submission_id = s.id
);

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

revoke all on function public.ensure_program_referral_code(uuid, uuid) from public;
revoke all on function public.ensure_program_referral_code(uuid, uuid) from anon;
revoke all on function public.ensure_program_referral_code(uuid, uuid) from authenticated;
revoke all on function public.initialize_program_referral_code_from_answer() from public;
revoke all on function public.initialize_program_referral_code_from_answer() from anon;
revoke all on function public.initialize_program_referral_code_from_answer() from authenticated;
grant execute on function public.ensure_program_referral_code(uuid, uuid) to service_role;

revoke all on function public.search_program_referrers(uuid, text) from public;
grant execute on function public.search_program_referrers(uuid, text) to anon, authenticated, service_role;

comment on function public.search_program_referrers(uuid, text) is
  'Public limited referrer lookup for a program form. Returns referral code and a privacy-minimized display name.';
