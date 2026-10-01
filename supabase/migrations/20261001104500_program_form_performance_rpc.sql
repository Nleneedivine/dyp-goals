-- Aggregate form traffic and submissions server-side so the admin form list
-- does not download every session/submission row just to compute counts.

create or replace function public.get_program_form_performance(p_form_ids uuid[])
returns table (
  form_id uuid,
  visits bigint,
  submissions bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  return query
  with requested as (
    select unnest(p_form_ids) as form_id
  ),
  session_counts as (
    select s.form_id, count(*)::bigint as visits
    from public.program_form_sessions s
    where s.form_id = any(p_form_ids)
    group by s.form_id
  ),
  submission_counts as (
    select s.form_id, count(*)::bigint as submissions
    from public.program_form_submissions s
    where s.form_id = any(p_form_ids)
    group by s.form_id
  )
  select
    r.form_id,
    coalesce(sc.visits, 0)::bigint,
    coalesce(subc.submissions, 0)::bigint
  from requested r
  left join session_counts sc on sc.form_id = r.form_id
  left join submission_counts subc on subc.form_id = r.form_id;
end;
$function$;

revoke all on function public.get_program_form_performance(uuid[]) from public;
revoke all on function public.get_program_form_performance(uuid[]) from anon;
grant execute on function public.get_program_form_performance(uuid[]) to authenticated;
grant execute on function public.get_program_form_performance(uuid[]) to service_role;

comment on function public.get_program_form_performance(uuid[]) is
  'Admin-only aggregate visit and submission counts for program forms.';
