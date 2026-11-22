-- Persistent applicant portal links and a separate admission decision.
-- Additive only: existing enrollment/payment/sponsorship rows are not rewritten.

create table if not exists public.program_application_admissions (
  submission_id uuid primary key references public.program_form_submissions(id) on delete cascade,
  status text not null default 'awaiting_funding'
    check (status in ('awaiting_funding','awaiting_admission','admitted','rejected')),
  decision_reason text not null default '',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.program_applicant_portal_tokens (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.program_form_submissions(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '180 days'),
  revoked_at timestamptz,
  last_used_at timestamptz
);

create index if not exists program_applicant_portal_tokens_submission_idx
  on public.program_applicant_portal_tokens(submission_id, created_at desc);

create table if not exists public.program_applicant_portal_audit (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.program_form_submissions(id) on delete cascade,
  token_id uuid references public.program_applicant_portal_tokens(id) on delete set null,
  actor_id uuid references auth.users(id),
  action text not null check (action in ('created','revoked','rotated','opened','admission_decision')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.program_application_admissions enable row level security;
alter table public.program_applicant_portal_tokens enable row level security;
alter table public.program_applicant_portal_audit enable row level security;

drop policy if exists "Admins read application admissions" on public.program_application_admissions;
create policy "Admins read application admissions"
on public.program_application_admissions for select to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Admins read applicant portal audit" on public.program_applicant_portal_audit;
create policy "Admins read applicant portal audit"
on public.program_applicant_portal_audit for select to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

revoke all on public.program_application_admissions from anon, authenticated;
revoke all on public.program_applicant_portal_tokens from anon, authenticated;
revoke all on public.program_applicant_portal_audit from anon, authenticated;
grant select on public.program_application_admissions, public.program_applicant_portal_audit to authenticated;
grant all on public.program_application_admissions, public.program_applicant_portal_tokens, public.program_applicant_portal_audit to service_role;

-- Only submissions created after this trigger is installed receive a new admission stage.
create or replace function public.initialize_program_application_admission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The submissions table is shared across programmes. Scope the trigger from
  -- its first installation so there is no migration-window exposure for others.
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
$$;

drop trigger if exists initialize_program_application_admission on public.program_form_submissions;
create trigger initialize_program_application_admission
after insert on public.program_form_submissions
for each row execute function public.initialize_program_application_admission();

create or replace function public.admin_set_program_application_admission(
  p_submission_id uuid,
  p_decision text,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_status text;
  v_sponsorship_status text;
  v_row public.program_application_admissions;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  if p_decision not in ('admitted','rejected') then
    raise exception 'Invalid admission decision';
  end if;

  if not exists (
    select 1
    from public.program_form_submissions s
    join public.program_forms f on f.id = s.form_id
    join public.program_cohorts c on c.id = f.cohort_id
    where s.id = p_submission_id
      and c.program_key = 'goals'
  ) then
    raise exception 'Admission decisions are only available for DYP GOALS applications';
  end if;

  select p.status into v_payment_status
  from public.program_payments p
  where p.submission_id = p_submission_id;

  select c.status into v_sponsorship_status
  from public.program_sponsorship_claims c
  where c.submission_id = p_submission_id
  order by c.updated_at desc
  limit 1;

  if p_decision = 'admitted'
     and coalesce(v_payment_status <> 'paid', true)
     and coalesce(v_sponsorship_status <> 'approved', true) then
    raise exception 'Funding must be verified before admission';
  end if;

  if p_decision = 'rejected' and char_length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'A reason is required when rejecting an application';
  end if;

  update public.program_application_admissions
  set status = p_decision,
      decision_reason = case when p_decision = 'rejected' then trim(p_reason) else '' end,
      decided_by = auth.uid(),
      decided_at = now(),
      updated_at = now()
  where submission_id = p_submission_id
  returning * into v_row;

  if not found then
    raise exception 'This application is not in the new admission workflow';
  end if;

  insert into public.program_applicant_portal_audit
    (submission_id, actor_id, action, details)
  values
    (p_submission_id, auth.uid(), 'admission_decision',
     jsonb_build_object('decision', p_decision, 'reason', coalesce(p_reason,'')));

  return jsonb_build_object(
    'submissionId', v_row.submission_id,
    'status', v_row.status,
    'decidedAt', v_row.decided_at
  );
end;
$$;

revoke all on function public.admin_set_program_application_admission(uuid,text,text) from public, anon;
grant execute on function public.admin_set_program_application_admission(uuid,text,text) to authenticated, service_role;

-- Admin generates a random bearer token in the browser, sends only its SHA-256 hash here,
-- and receives the token row ID. The raw token is never stored in Postgres.
create or replace function public.admin_create_applicant_portal_token(
  p_submission_id uuid,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.program_applicant_portal_tokens;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}
  set revoked_at = now()
  where submission_id = p_submission_id and revoked_at is null;

  insert into public.program_applicant_portal_tokens
    (submission_id, token_hash, created_by)
  values (p_submission_id, lower(p_token_hash), auth.uid())
  returning * into v_token;

  insert into public.program_applicant_portal_audit
    (submission_id, token_id, actor_id, action)
  values (p_submission_id, v_token.id, auth.uid(), 'rotated');

  return jsonb_build_object(
    'tokenId', v_token.id,
    'expiresAt', v_token.expires_at
  );
end;
$$;

create or replace function public.get_applicant_portal_state(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.program_applicant_portal_tokens;
  v_submission public.program_form_submissions;
  v_payment public.program_payments;
  v_claim public.program_sponsorship_claims;
  v_admission public.program_application_admissions;
  v_session_token uuid;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('valid', false);
  end if;

  select * into v_token
  from public.program_applicant_portal_tokens
  where token_hash = lower(p_token_hash)
    and revoked_at is null
    and expires_at > now();

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  select s, fs.session_token
  into v_submission, v_session_token
  from public.program_form_submissions s
  join public.program_form_sessions fs on fs.id = s.session_id
  where s.id = v_token.submission_id;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  select * into v_payment from public.program_payments
  where submission_id = v_submission.id;

  select * into v_claim from public.program_sponsorship_claims
  where submission_id = v_submission.id
  order by updated_at desc limit 1;

  select * into v_admission from public.program_application_admissions
  where submission_id = v_submission.id;

  update public.program_applicant_portal_tokens
  set last_used_at = now() where id = v_token.id;

  insert into public.program_applicant_portal_audit
    (submission_id, token_id, action)
  values (v_submission.id, v_token.id, 'opened');

  return jsonb_build_object(
    'valid', true,
    'submissionId', v_submission.id,
    'sessionToken', v_session_token,
    'submittedAt', v_submission.submitted_at,
    'paymentStatus', coalesce(v_payment.status, 'unpaid'),
    'fundingType', case when v_claim.id is not null then 'sponsored' else 'self_paid' end,
    'sponsorshipStatus', v_claim.status,
    'admissionStatus', v_admission.status,
    'admissionReason', v_admission.decision_reason
  );
end;
$$;

revoke all on function public.admin_create_applicant_portal_token(uuid,text) from public, anon;
grant execute on function public.admin_create_applicant_portal_token(uuid,text) to authenticated, service_role;
revoke all on function public.get_applicant_portal_state(text) from public;
grant execute on function public.get_applicant_portal_state(text) to anon, authenticated, service_role;

comment on table public.program_application_admissions is
  'Separate admission decisions for applications submitted after this migration; historical applications are not backfilled.';
comment on table public.program_applicant_portal_tokens is
  'Hashed, expiring bearer tokens for persistent applicant portal access. Raw tokens are never stored.';
 then
    raise exception 'Invalid portal token hash';
  end if;
  if not exists (
    select 1
    from public.program_form_submissions s
    join public.program_forms f on f.id = s.form_id
    join public.program_cohorts c on c.id = f.cohort_id
    where s.id = p_submission_id
      and c.program_key = 'goals'
  ) then
    raise exception 'Applicant portal links are only available for DYP GOALS applications';
  end if;

  update public.program_applicant_portal_tokens
  set revoked_at = now()
  where submission_id = p_submission_id and revoked_at is null;

  insert into public.program_applicant_portal_tokens
    (submission_id, token_hash, created_by)
  values (p_submission_id, lower(p_token_hash), auth.uid())
  returning * into v_token;

  insert into public.program_applicant_portal_audit
    (submission_id, token_id, actor_id, action)
  values (p_submission_id, v_token.id, auth.uid(), 'rotated');

  return jsonb_build_object(
    'tokenId', v_token.id,
    'expiresAt', v_token.expires_at
  );
end;
$$;

create or replace function public.get_applicant_portal_state(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.program_applicant_portal_tokens;
  v_submission public.program_form_submissions;
  v_payment public.program_payments;
  v_claim public.program_sponsorship_claims;
  v_admission public.program_application_admissions;
  v_session_token uuid;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('valid', false);
  end if;

  select * into v_token
  from public.program_applicant_portal_tokens
  where token_hash = lower(p_token_hash)
    and revoked_at is null
    and expires_at > now();

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  select s, fs.session_token
  into v_submission, v_session_token
  from public.program_form_submissions s
  join public.program_form_sessions fs on fs.id = s.session_id
  where s.id = v_token.submission_id;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  select * into v_payment from public.program_payments
  where submission_id = v_submission.id;

  select * into v_claim from public.program_sponsorship_claims
  where submission_id = v_submission.id
  order by updated_at desc limit 1;

  select * into v_admission from public.program_application_admissions
  where submission_id = v_submission.id;

  update public.program_applicant_portal_tokens
  set last_used_at = now() where id = v_token.id;

  insert into public.program_applicant_portal_audit
    (submission_id, token_id, action)
  values (v_submission.id, v_token.id, 'opened');

  return jsonb_build_object(
    'valid', true,
    'submissionId', v_submission.id,
    'sessionToken', v_session_token,
    'submittedAt', v_submission.submitted_at,
    'paymentStatus', coalesce(v_payment.status, 'unpaid'),
    'fundingType', case when v_claim.id is not null then 'sponsored' else 'self_paid' end,
    'sponsorshipStatus', v_claim.status,
    'admissionStatus', v_admission.status,
    'admissionReason', v_admission.decision_reason
  );
end;
$$;

revoke all on function public.admin_create_applicant_portal_token(uuid,text) from public, anon;
grant execute on function public.admin_create_applicant_portal_token(uuid,text) to authenticated, service_role;
revoke all on function public.get_applicant_portal_state(text) from public;
grant execute on function public.get_applicant_portal_state(text) to anon, authenticated, service_role;

comment on table public.program_application_admissions is
  'Separate admission decisions for applications submitted after this migration; historical applications are not backfilled.';
comment on table public.program_applicant_portal_tokens is
  'Hashed, expiring bearer tokens for persistent applicant portal access. Raw tokens are never stored.';
 then
    raise exception 'Invalid portal token hash';
  end if;
  if not exists (
    select 1
    from public.program_form_submissions s
    join public.program_forms f on f.id = s.form_id
    join public.program_cohorts c on c.id = f.cohort_id
    where s.id = p_submission_id
      and c.program_key = 'goals'
  ) then
    raise exception 'Applicant portal links are only available for DYP GOALS applications';
  end if;

  update public.program_applicant_portal_tokens
  set revoked_at = now()
  where submission_id = p_submission_id and revoked_at is null;

  insert into public.program_applicant_portal_tokens
    (submission_id, token_hash, created_by)
  values (p_submission_id, lower(p_token_hash), auth.uid())
  returning * into v_token;

  insert into public.program_applicant_portal_audit
    (submission_id, token_id, actor_id, action)
  values (p_submission_id, v_token.id, auth.uid(), 'rotated');

  return jsonb_build_object(
    'tokenId', v_token.id,
    'expiresAt', v_token.expires_at
  );
end;
$$;

create or replace function public.get_applicant_portal_state(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.program_applicant_portal_tokens;
  v_submission public.program_form_submissions;
  v_payment public.program_payments;
  v_claim public.program_sponsorship_claims;
  v_admission public.program_application_admissions;
  v_session_token uuid;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('valid', false);
  end if;

  select * into v_token
  from public.program_applicant_portal_tokens
  where token_hash = lower(p_token_hash)
    and revoked_at is null
    and expires_at > now();

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  select s, fs.session_token
  into v_submission, v_session_token
  from public.program_form_submissions s
  join public.program_form_sessions fs on fs.id = s.session_id
  where s.id = v_token.submission_id;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  select * into v_payment from public.program_payments
  where submission_id = v_submission.id;

  select * into v_claim from public.program_sponsorship_claims
  where submission_id = v_submission.id
  order by updated_at desc limit 1;

  select * into v_admission from public.program_application_admissions
  where submission_id = v_submission.id;

  update public.program_applicant_portal_tokens
  set last_used_at = now() where id = v_token.id;

  insert into public.program_applicant_portal_audit
    (submission_id, token_id, action)
  values (v_submission.id, v_token.id, 'opened');

  return jsonb_build_object(
    'valid', true,
    'submissionId', v_submission.id,
    'sessionToken', v_session_token,
    'submittedAt', v_submission.submitted_at,
    'paymentStatus', coalesce(v_payment.status, 'unpaid'),
    'fundingType', case when v_claim.id is not null then 'sponsored' else 'self_paid' end,
    'sponsorshipStatus', v_claim.status,
    'admissionStatus', v_admission.status,
    'admissionReason', v_admission.decision_reason
  );
end;
$$;

revoke all on function public.admin_create_applicant_portal_token(uuid,text) from public, anon;
grant execute on function public.admin_create_applicant_portal_token(uuid,text) to authenticated, service_role;
revoke all on function public.get_applicant_portal_state(text) from public;
grant execute on function public.get_applicant_portal_state(text) to anon, authenticated, service_role;

comment on table public.program_application_admissions is
  'Separate admission decisions for applications submitted after this migration; historical applications are not backfilled.';
comment on table public.program_applicant_portal_tokens is
  'Hashed, expiring bearer tokens for persistent applicant portal access. Raw tokens are never stored.';
 then
    raise exception 'Invalid portal token hash';
  end if;
  if not exists (
    select 1
    from public.program_form_submissions s
    join public.program_forms f on f.id = s.form_id
    join public.program_cohorts c on c.id = f.cohort_id
    where s.id = p_submission_id
      and c.program_key = 'goals'
  ) then
    raise exception 'Applicant portal links are only available for DYP GOALS applications';
  end if;

  update public.program_applicant_portal_tokens
  set revoked_at = now()
  where submission_id = p_submission_id and revoked_at is null;

  insert into public.program_applicant_portal_tokens
    (submission_id, token_hash, created_by)
  values (p_submission_id, lower(p_token_hash), auth.uid())
  returning * into v_token;

  insert into public.program_applicant_portal_audit
    (submission_id, token_id, actor_id, action)
  values (p_submission_id, v_token.id, auth.uid(), 'rotated');

  return jsonb_build_object(
    'tokenId', v_token.id,
    'expiresAt', v_token.expires_at
  );
end;
$$;

create or replace function public.get_applicant_portal_state(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.program_applicant_portal_tokens;
  v_submission public.program_form_submissions;
  v_payment public.program_payments;
  v_claim public.program_sponsorship_claims;
  v_admission public.program_application_admissions;
  v_session_token uuid;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('valid', false);
  end if;

  select * into v_token
  from public.program_applicant_portal_tokens
  where token_hash = lower(p_token_hash)
    and revoked_at is null
    and expires_at > now();

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  select s, fs.session_token
  into v_submission, v_session_token
  from public.program_form_submissions s
  join public.program_form_sessions fs on fs.id = s.session_id
  where s.id = v_token.submission_id;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  select * into v_payment from public.program_payments
  where submission_id = v_submission.id;

  select * into v_claim from public.program_sponsorship_claims
  where submission_id = v_submission.id
  order by updated_at desc limit 1;

  select * into v_admission from public.program_application_admissions
  where submission_id = v_submission.id;

  update public.program_applicant_portal_tokens
  set last_used_at = now() where id = v_token.id;

  insert into public.program_applicant_portal_audit
    (submission_id, token_id, action)
  values (v_submission.id, v_token.id, 'opened');

  return jsonb_build_object(
    'valid', true,
    'submissionId', v_submission.id,
    'sessionToken', v_session_token,
    'submittedAt', v_submission.submitted_at,
    'paymentStatus', coalesce(v_payment.status, 'unpaid'),
    'fundingType', case when v_claim.id is not null then 'sponsored' else 'self_paid' end,
    'sponsorshipStatus', v_claim.status,
    'admissionStatus', v_admission.status,
    'admissionReason', v_admission.decision_reason
  );
end;
$$;

revoke all on function public.admin_create_applicant_portal_token(uuid,text) from public, anon;
grant execute on function public.admin_create_applicant_portal_token(uuid,text) to authenticated, service_role;
revoke all on function public.get_applicant_portal_state(text) from public;
grant execute on function public.get_applicant_portal_state(text) to anon, authenticated, service_role;

comment on table public.program_application_admissions is
  'Separate admission decisions for applications submitted after this migration; historical applications are not backfilled.';
comment on table public.program_applicant_portal_tokens is
  'Hashed, expiring bearer tokens for persistent applicant portal access. Raw tokens are never stored.';
