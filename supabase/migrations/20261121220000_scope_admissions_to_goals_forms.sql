-- Scope the new admission workflow to DYP GOALS forms only.
-- program_form_submissions is shared by multiple programme forms.
create or replace function public.initialize_program_application_admission()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if exists (
    select 1
    from public.program_forms f
    join public.program_cohorts c on c.id = f.cohort_id
    where f.id = new.form_id
      and c.program_key = 'goals'
  ) then
    insert into public.program_application_admissions (submission_id, status)
    values (new.id, 'awaiting_funding')
    on conflict (submission_id) do nothing;
  end if;
  return new;
end;
$function$;

comment on function public.initialize_program_application_admission() is
  'Creates admission workflow rows only for new DYP GOALS cohort form submissions; other programme forms are unaffected.';
