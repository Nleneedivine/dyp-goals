-- Runtime heartbeat is written by the deployed worker, not inferred from a successful cron submission.
create table if not exists public.email_runtime_status (
 id boolean primary key default true check(id), worker_version text not null,
 last_checked_at timestamptz not null, blocked_reason text
);
alter table public.email_runtime_status enable row level security;
revoke all on public.email_runtime_status from anon,authenticated;
grant all on public.email_runtime_status to service_role;
create or replace function public.claim_email_batch(p_limit integer default 50, p_stale_minutes integer default 15)
returns setof public.email_notification_queue
language plpgsql security definer set search_path = public
as $$
begin
  update public.email_notification_queue set status = 'failed', locked_at = null, processed_at = now(), last_error = 'Retry window expired; requires admin review'
   where status = 'processing' and coalesce(locked_at,created_at) < now() - interval '22 hours';
  update public.email_notification_queue set status = 'failed', locked_at = null, processed_at = now()
   where status in ('processing','pending') and attempt_count >= 5;
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
  perform pg_advisory_xact_lock(hashtextextended(p_dedupe_key, 0));
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

create or replace function public.admin_email_system_overview()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v jsonb;
begin
  if public.has_role(auth.uid(), 'admin'::public.app_role) is distinct from true then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'runtime', (select to_jsonb(s) - 'id' from public.email_runtime_status s where id),
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
  if public.has_role(auth.uid(), 'admin'::public.app_role) is distinct from true then
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
-- OAuth users can be confirmed before their profile exists; queue welcome after profile creation too.
create or replace function public.queue_profile_welcome_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
 if exists (select 1 from auth.users where id=new.id and email_confirmed_at is not null) then
  perform public.queue_transactional_email(new.id,'welcome','Welcome to DYP GOALS',
  'Your account is confirmed. Open your GOALS journey to set up your profile, goals and weekly plan.',
  'Open my journey','/journey','welcome:' || new.id::text);
 end if;
 return new;
exception when others then raise warning 'Welcome email queue failed: %', sqlerrm; return new;
end; $$;
drop trigger if exists trg_queue_profile_welcome_email on public.profiles;
create trigger trg_queue_profile_welcome_email after insert on public.profiles for each row execute function public.queue_profile_welcome_email();
