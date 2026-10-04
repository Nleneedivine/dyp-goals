-- Gate participant account activation/access to valid DYP participation
-- while preserving staff/admin/mentor access.

create or replace function public.can_activate_goals_account(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.program_enrollments e
    join public.program_cohorts c on c.id = e.cohort_id
    where lower(e.email) = lower(trim(coalesce(p_email, '')))
      and c.program_key = 'goals'
      and (
        e.status in ('active','completed')
        or c.status = 'historical'
      )
  );
$function$;

revoke all on function public.can_activate_goals_account(text) from public;
grant execute on function public.can_activate_goals_account(text) to anon, authenticated, service_role;

create or replace function public.current_user_has_app_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select
    auth.uid() is not null
    and (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'mentor'::public.app_role)
      or exists (
        select 1
        from public.program_enrollments e
        where e.user_id = auth.uid()
      )
    );
$function$;

revoke all on function public.current_user_has_app_access() from public;
revoke all on function public.current_user_has_app_access() from anon;
grant execute on function public.current_user_has_app_access() to authenticated, service_role;
