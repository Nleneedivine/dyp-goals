alter table public.email_notification_queue
  add column if not exists dedupe_key text,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz,
  add column if not exists provider_message_id text,
  add column if not exists accepted_at timestamptz;

comment on column public.email_notification_queue.status is
  'pending | processing | sent (accepted by provider, delivery NOT confirmed) | failed | skipped_opt_out';

create unique index if not exists email_notification_queue_dedupe_key_idx
  on public.email_notification_queue (dedupe_key) where dedupe_key is not null;
create index if not exists email_notification_queue_due_idx
  on public.email_notification_queue (status, next_attempt_at);

create or replace function public.claim_email_batch(p_limit integer default 50, p_stale_minutes integer default 15)
returns setof public.email_notification_queue
language plpgsql security definer set search_path = public
as $$
begin
  update public.email_notification_queue
     set status = 'pending', locked_at = null, next_attempt_at = now(),
         last_error = left('Recovered stale processing job. ' || coalesce(last_error, ''), 2000)
   where status = 'processing'
     and coalesce(locked_at, created_at) < now() - make_interval(mins => greatest(p_stale_minutes, 5));

  return query
  update public.email_notification_queue q
     set status = 'processing', locked_at = now(), attempt_count = q.attempt_count + 1
   where q.id in (
     select id from public.email_notification_queue
      where status = 'pending' and next_attempt_at <= now()
      order by created_at
      for update skip locked
      limit least(greatest(p_limit, 1), 200))
  returning q.*;
end;
$$;
revoke all on function public.claim_email_batch(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_email_batch(integer, integer) to service_role;

create or replace function public.queue_transactional_email(
  p_user_id uuid, p_type text, p_title text, p_body text,
  p_action_label text, p_action_path text, p_dedupe_key text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_pref public.notification_preferences;
  v_enabled boolean := true;
  v_id uuid;
begin
  if p_user_id is null or p_dedupe_key is null then return null; end if;
  if exists (select 1 from public.email_notification_queue where dedupe_key = p_dedupe_key)
     or exists (select 1 from public.user_notifications where user_id = p_user_id and metadata->>'dedupe_key' = p_dedupe_key) then
    return null;
  end if;

  insert into public.user_notifications (user_id, notification_type, title, body, action_label, action_path, metadata)
  values (p_user_id, p_type, p_title, coalesce(p_body, ''), p_action_label, p_action_path,
          jsonb_build_object('dedupe_key', p_dedupe_key));

  select * into v_pref from public.notification_preferences where user_id = p_user_id;
  if found then v_enabled := v_pref.program_emails_enabled; end if;

  if v_enabled then
    insert into public.email_notification_queue (user_id, notification_type, subject, body_html, action_label, action_path, dedupe_key)
    values (p_user_id, p_type, 'DYP GOALS · ' || p_title,
      '<p>' || replace(replace(replace(coalesce(p_body, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>',
      p_action_label, p_action_path, p_dedupe_key)
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.queue_transactional_email(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.queue_transactional_email(uuid, text, text, text, text, text, text) to service_role;

create or replace function public.queue_welcome_email()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.email_confirmed_at is not null and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    begin
      perform public.queue_transactional_email(
        new.id, 'welcome', 'Welcome to DYP GOALS',
        'Your account is confirmed. Open your GOALS journey to set up your profile, goals and weekly plan.',
        'Open my journey', '/journey', 'welcome:' || new.id::text);
    exception when others then
      raise warning 'queue_welcome_email failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_confirmed_welcome on auth.users;
create trigger on_auth_user_confirmed_welcome
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.queue_welcome_email();

create or replace function public.queue_registration_email()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_cohort text;
begin
  if new.user_id is not null and (tg_op = 'INSERT' or old.user_id is distinct from new.user_id) then
    begin
      select name into v_cohort from public.program_cohorts where id = new.cohort_id;
      perform public.queue_transactional_email(
        new.user_id, 'program_registration', 'Your program registration is confirmed',
        'You are registered for ' || coalesce(v_cohort, 'the GOALS program') ||
        '. Check Profile for program access, payment status and your schedule.',
        'Open Profile', '/profile', 'registration:' || new.id::text);
    exception when others then
      raise warning 'queue_registration_email failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_queue_registration_email on public.program_enrollments;
create trigger trg_queue_registration_email
  after insert or update of user_id on public.program_enrollments
  for each row execute function public.queue_registration_email();

create or replace function public.queue_testimonial_email()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform public.queue_transactional_email(
        new.user_id, 'testimonial_received', 'We received your story',
        'Thank you for sharing your GOALS story. Our team will review it before anything is published.',
        'Open Profile', '/profile', 'testimonial-received:' || new.id::text);
    elsif new.status = 'approved' and old.status is distinct from 'approved' then
      perform public.queue_transactional_email(
        new.user_id, 'testimonial_approved', 'Your story has been approved',
        case when new.publish_consent
          then 'Your story was approved and may now appear on the DYP GOALS testimonials page.'
          else 'Your story was approved. It will only be published with your consent.' end,
        'View testimonials', '/testimonials', 'testimonial-approved:' || new.id::text);
    end if;
  exception when others then
    raise warning 'queue_testimonial_email failed: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists trg_queue_testimonial_email on public.participant_testimonials;
create trigger trg_queue_testimonial_email
  after insert or update of status on public.participant_testimonials
  for each row execute function public.queue_testimonial_email();

create or replace function public.admin_email_system_overview()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v jsonb;
begin
  if not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.email_notification_queue group by status) s), '{}'::jsonb),
    'oldest_pending_at', (select min(created_at) from public.email_notification_queue where status = 'pending'),
    'accepted_last_24h', (select count(*) from public.email_notification_queue where status = 'sent' and coalesce(accepted_at, processed_at) > now() - interval '24 hours'),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'jobname', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'runs', (select coalesce(jsonb_agg(to_jsonb(r) order by r.start_time desc), '[]'::jsonb) from (
           select d.status, d.start_time, d.end_time, left(coalesce(d.return_message, ''), 300) as return_message
             from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 5) r)))
      from cron.job j where j.jobname like '%notification%' or j.jobname like '%email%'), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke all on function public.admin_email_system_overview() from public, anon;
grant execute on function public.admin_email_system_overview() to authenticated;

create or replace function public.admin_retry_email(p_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_allowed boolean;
begin
  if not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  select allowed into v_allowed from public.consume_edge_rate_limit('admin-email-retry:' || auth.uid()::text, 20, 3600);
  if not coalesce(v_allowed, false) then
    raise exception 'Too many retries. Try again later.';
  end if;
  update public.email_notification_queue
     set status = 'pending', attempt_count = 0, next_attempt_at = now(), locked_at = null, processed_at = null,
         last_error = left('Manual retry by admin. Previous: ' || coalesce(last_error, ''), 2000)
   where id = p_id and status = 'failed';
  if not found then raise exception 'Only failed messages can be retried'; end if;
end;
$$;
revoke all on function public.admin_retry_email(uuid) from public, anon;
grant execute on function public.admin_retry_email(uuid) to authenticated;