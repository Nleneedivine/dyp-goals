-- Shared participant completion/certificate state for program registrations.
create table if not exists public.program_participant_status (
  submission_id uuid primary key
    references public.program_form_submissions(id) on delete cascade,
  form_id uuid not null
    references public.program_forms(id) on delete cascade,
  completion_status text not null default 'registered'
    check (completion_status in ('registered','completed','ineligible')),
  certificate_eligible boolean not null default false,
  certificate_issued_at timestamptz,
  certificate_code text unique,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.program_participant_status enable row level security;

drop policy if exists "Admins can view participant status" on public.program_participant_status;
create policy "Admins can view participant status"
on public.program_participant_status
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

create or replace function public.initialize_program_participant_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.program_participant_status (submission_id, form_id)
  values (new.id, new.form_id)
  on conflict (submission_id) do nothing;

  return new;
end;
$function$;

drop trigger if exists trg_initialize_program_participant_status
on public.program_form_submissions;

create trigger trg_initialize_program_participant_status
after insert on public.program_form_submissions
for each row
execute function public.initialize_program_participant_status();

insert into public.program_participant_status (submission_id, form_id)
select s.id, s.form_id
from public.program_form_submissions s
on conflict (submission_id) do nothing;

create or replace function public.admin_set_program_participant_status(
  p_submission_id uuid,
  p_completion_status text,
  p_issue_certificate boolean default false
)
returns public.program_participant_status
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_status public.program_participant_status;
  v_code text;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  if p_completion_status not in ('registered','completed','ineligible') then
    raise exception 'Invalid completion status';
  end if;

  if p_issue_certificate and p_completion_status <> 'completed' then
    raise exception 'Certificate can only be issued for a completed participant';
  end if;

  if p_issue_certificate then
    v_code := 'DYP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  end if;

  update public.program_participant_status
  set
    completion_status = p_completion_status,
    certificate_eligible = (p_completion_status = 'completed'),
    certificate_issued_at = case
      when p_issue_certificate then coalesce(certificate_issued_at, now())
      when p_completion_status <> 'completed' then null
      else certificate_issued_at
    end,
    certificate_code = case
      when p_issue_certificate then coalesce(certificate_code, v_code)
      when p_completion_status <> 'completed' then null
      else certificate_code
    end,
    updated_at = now(),
    updated_by = auth.uid()
  where submission_id = p_submission_id
  returning * into v_status;

  if not found then
    raise exception 'Participant submission not found';
  end if;

  return v_status;
end;
$function$;

revoke all on function public.admin_set_program_participant_status(uuid, text, boolean) from public;
revoke all on function public.admin_set_program_participant_status(uuid, text, boolean) from anon;
grant execute on function public.admin_set_program_participant_status(uuid, text, boolean) to authenticated;
grant execute on function public.admin_set_program_participant_status(uuid, text, boolean) to service_role;

comment on table public.program_participant_status is
  'Program-registration completion and certificate state used by admin completion workflows and referral qualification.';
