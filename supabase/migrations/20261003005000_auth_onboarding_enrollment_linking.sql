-- Authentication onboarding: normalize profile creation for password/Google users
-- and link verified authenticated identities to existing program enrollments by email.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_full_name text;
  v_first_name text;
  v_last_name text;
begin
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    ''
  );

  v_first_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'first_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'given_name'), ''),
    case
      when v_full_name <> '' then split_part(v_full_name, ' ', 1)
      else ''
    end
  );

  v_last_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'last_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'family_name'), ''),
    case
      when position(' ' in v_full_name) > 0
        then trim(substr(v_full_name, position(' ' in v_full_name) + 1))
      else ''
    end
  );

  insert into public.profiles (
    id,
    first_name,
    last_name,
    email
  )
  values (
    new.id,
    coalesce(v_first_name, ''),
    coalesce(v_last_name, ''),
    coalesce(new.email, '')
  )
  on conflict (id)
  do update set
    first_name = case
      when public.profiles.first_name = '' then excluded.first_name
      else public.profiles.first_name
    end,
    last_name = case
      when public.profiles.last_name = '' then excluded.last_name
      else public.profiles.last_name
    end,
    email = case
      when excluded.email <> '' then excluded.email
      else public.profiles.email
    end;

  -- A registration may exist before the participant creates an auth account.
  -- Link only still-unclaimed enrollments with the same verified auth email.
  if new.email is not null and new.email <> '' then
    update public.program_enrollments
    set
      user_id = new.id,
      updated_at = now()
    where user_id is null
      and lower(email) = lower(new.email);
  end if;

  return new;
end;
$function$;

create or replace function public.link_current_user_enrollments()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_metadata jsonb;
  v_first_name text;
  v_last_name text;
  v_full_name text;
  v_linked integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select
    u.email,
    u.raw_user_meta_data
  into
    v_email,
    v_metadata
  from auth.users u
  where u.id = v_user_id;

  if v_email is null or trim(v_email) = '' then
    raise exception 'Authenticated account has no email address';
  end if;

  v_full_name := coalesce(
    nullif(trim(v_metadata->>'full_name'), ''),
    nullif(trim(v_metadata->>'name'), ''),
    ''
  );

  v_first_name := coalesce(
    nullif(trim(v_metadata->>'first_name'), ''),
    nullif(trim(v_metadata->>'given_name'), ''),
    case when v_full_name <> '' then split_part(v_full_name, ' ', 1) else '' end
  );

  v_last_name := coalesce(
    nullif(trim(v_metadata->>'last_name'), ''),
    nullif(trim(v_metadata->>'family_name'), ''),
    case
      when position(' ' in v_full_name) > 0
        then trim(substr(v_full_name, position(' ' in v_full_name) + 1))
      else ''
    end
  );

  insert into public.profiles (
    id,
    first_name,
    last_name,
    email
  )
  values (
    v_user_id,
    coalesce(v_first_name, ''),
    coalesce(v_last_name, ''),
    v_email
  )
  on conflict (id)
  do update set
    first_name = case
      when public.profiles.first_name = '' then excluded.first_name
      else public.profiles.first_name
    end,
    last_name = case
      when public.profiles.last_name = '' then excluded.last_name
      else public.profiles.last_name
    end,
    email = excluded.email;

  update public.program_enrollments
  set
    user_id = v_user_id,
    updated_at = now()
  where user_id is null
    and lower(email) = lower(v_email);

  get diagnostics v_linked = row_count;

  return jsonb_build_object(
    'linkedEnrollments', v_linked,
    'email', v_email
  );
end;
$function$;

revoke all on function public.link_current_user_enrollments() from public;
revoke all on function public.link_current_user_enrollments() from anon;
grant execute on function public.link_current_user_enrollments() to authenticated, service_role;

comment on function public.link_current_user_enrollments() is
  'Links unclaimed program enrollments to the currently authenticated user when the verified auth email matches.';
