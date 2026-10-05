-- Unified program notifications, preferences and accountability meeting schedule.

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  program_emails_enabled boolean not null default true,
  session_reminders_enabled boolean not null default true,
  accountability_reminders_enabled boolean not null default true,
  referral_updates_enabled boolean not null default true,
  group_digest text not null default 'off'
    check (group_digest in ('off','daily','weekly')),
  timezone text not null default 'Africa/Lagos',
  updated_at timestamptz not null default now()
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null default '',
  action_label text,
  action_path text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications(user_id, created_at desc);
create index if not exists user_notifications_unread_idx
  on public.user_notifications(user_id, read_at)
  where read_at is null;

create table if not exists public.email_notification_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  subject text not null,
  body_html text not null,
  action_label text,
  action_path text,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed','cancelled')),
  attempt_count integer not null default 0,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists email_notification_queue_pending_idx
  on public.email_notification_queue(status, created_at)
  where status = 'pending';

create table if not exists public.accountability_group_meetings (
  group_id uuid primary key references public.accountability_groups(id) on delete cascade,
  title text not null default 'Accountability Lab check-in',
  meeting_url text,
  starts_at timestamptz,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 360),
  recurrence text not null default 'weekly'
    check (recurrence in ('once','weekly','biweekly','monthly')),
  timezone text not null default 'Africa/Lagos',
  notes text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.notification_preferences enable row level security;
alter table public.user_notifications enable row level security;
alter table public.email_notification_queue enable row level security;
alter table public.accountability_group_meetings enable row level security;

drop policy if exists "Users manage own notification preferences" on public.notification_preferences;
create policy "Users manage own notification preferences"
on public.notification_preferences
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users read own notifications" on public.user_notifications;
create policy "Users read own notifications"
on public.user_notifications
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users update own notification reads" on public.user_notifications;
create policy "Users update own notification reads"
on public.user_notifications
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "No direct user email queue access" on public.email_notification_queue;
create policy "No direct user email queue access"
on public.email_notification_queue
for select to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Group members read meeting schedule" on public.accountability_group_meetings;
create policy "Group members read meeting schedule"
on public.accountability_group_meetings
for select to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or exists (
    select 1
    from public.program_accountability_memberships m
    join public.program_enrollments e on e.id = m.enrollment_id
    where m.group_id = accountability_group_meetings.group_id
      and m.status = 'active'
      and e.user_id = auth.uid()
  )
  or exists (
    select 1 from public.accountability_groups g
    where g.id = accountability_group_meetings.group_id
      and g.mentor_id = auth.uid()
  )
);

drop policy if exists "Admins and coaches manage meeting schedule" on public.accountability_group_meetings;
create policy "Admins and coaches manage meeting schedule"
on public.accountability_group_meetings
for all to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or (
    public.has_role(auth.uid(), 'accountability_coach'::public.app_role)
    and exists (
      select 1 from public.accountability_groups g
      where g.id = accountability_group_meetings.group_id
        and g.mentor_id = auth.uid()
    )
  )
)
with check (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or (
    public.has_role(auth.uid(), 'accountability_coach'::public.app_role)
    and exists (
      select 1 from public.accountability_groups g
      where g.id = accountability_group_meetings.group_id
        and g.mentor_id = auth.uid()
    )
  )
);

grant select,insert,update,delete on public.notification_preferences to authenticated;
grant select,update on public.user_notifications to authenticated;
grant all on public.user_notifications to service_role;
grant all on public.email_notification_queue to service_role;
grant select,insert,update,delete on public.accountability_group_meetings to authenticated;
grant all on public.accountability_group_meetings to service_role;



-- Existing and future accounts get sensible program-notification defaults.
insert into public.notification_preferences (user_id, timezone)
select id, 'Africa/Lagos'
from public.profiles
on conflict (user_id) do nothing;

create or replace function public.ensure_default_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.notification_preferences (user_id, timezone)
  values (new.id, 'Africa/Lagos')
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

drop trigger if exists trg_default_notification_preferences on public.profiles;
create trigger trg_default_notification_preferences
after insert on public.profiles
for each row execute function public.ensure_default_notification_preferences();

-- Reuse the existing delivery ledger for deduplicating scheduled program reminders.
alter table public.execution_notification_deliveries
  drop constraint if exists execution_notification_deliveries_notification_type_check;

alter table public.execution_notification_deliveries
  add constraint execution_notification_deliveries_notification_type_check
  check (notification_type in (
    'morning_brief',
    'evening_debrief',
    'weekly_review',
    'deadline_alert',
    'program_session_24h',
    'program_session_1h',
    'accountability_meeting_24h',
    'group_digest_daily',
    'group_digest_weekly'
  ));

create or replace function public.queue_user_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_action_label text default null,
  p_action_path text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_email boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_notification_id uuid;
  v_email_enabled boolean := true;
  v_pref public.notification_preferences;
  v_html text;
begin
  insert into public.user_notifications (
    user_id, notification_type, title, body, action_label, action_path, metadata
  )
  values (
    p_user_id, p_type, p_title, coalesce(p_body,''), p_action_label, p_action_path, coalesce(p_metadata,'{}'::jsonb)
  )
  returning id into v_notification_id;

  select *
  into v_pref
  from public.notification_preferences
  where user_id = p_user_id;

  if found then
    v_email_enabled := v_pref.program_emails_enabled;
    if p_type like 'referral_%' then
      v_email_enabled := v_email_enabled and v_pref.referral_updates_enabled;
    elsif p_type like 'accountability_%' or p_type like 'coach_%' then
      v_email_enabled := v_email_enabled and v_pref.accountability_reminders_enabled;
    elsif p_type like 'session_%' then
      v_email_enabled := v_email_enabled and v_pref.session_reminders_enabled;
    end if;
  end if;

  if p_email and v_email_enabled then
    v_html :=
      '<p>' || replace(replace(replace(coalesce(p_body,''),'&','&amp;'),'<','&lt;'),'>','&gt;') || '</p>';

    insert into public.email_notification_queue (
      user_id,
      notification_type,
      subject,
      body_html,
      action_label,
      action_path
    )
    values (
      p_user_id,
      p_type,
      'DYP GOALS · ' || p_title,
      v_html,
      p_action_label,
      p_action_path
    );
  end if;

  return v_notification_id;
end;
$function$;

revoke all on function public.queue_user_notification(uuid,text,text,text,text,text,jsonb,boolean) from public;
grant execute on function public.queue_user_notification(uuid,text,text,text,text,text,jsonb,boolean)
to service_role;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.user_notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

grant execute on function public.mark_all_notifications_read() to authenticated;

-- Payment status notifications.
create or replace function public.notify_program_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select e.user_id
  into v_user_id
  from public.program_enrollments e
  where e.source_submission_id = new.submission_id;

  if v_user_id is null then return new; end if;

  if new.status = 'paid' then
    perform public.queue_user_notification(
      v_user_id,
      'payment_confirmed',
      'Payment confirmed',
      'Your GOALS payment has been confirmed. WhatsApp access and your program dashboard are now available.',
      'Open Program Access',
      '/profile',
      jsonb_build_object('submissionId', new.submission_id),
      true
    );
  elsif new.status = 'rejected' then
    perform public.queue_user_notification(
      v_user_id,
      'payment_rejected',
      'Payment proof needs attention',
      coalesce(new.rejection_reason, 'Your payment proof could not be verified. Please upload another proof.'),
      'Review payment',
      '/profile',
      jsonb_build_object('submissionId', new.submission_id),
      true
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_notify_program_payment_change on public.program_payments;
create trigger trg_notify_program_payment_change
after insert or update of status on public.program_payments
for each row execute function public.notify_program_payment_change();

-- Accountability group assignment notification.
create or replace function public.notify_accountability_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid;
  v_group_name text;
begin
  if new.status <> 'active' then return new; end if;

  select e.user_id, g.name
  into v_user_id, v_group_name
  from public.program_enrollments e
  join public.accountability_groups g on g.id = new.group_id
  where e.id = new.enrollment_id;

  if v_user_id is not null then
    perform public.queue_user_notification(
      v_user_id,
      'accountability_group_assigned',
      'Your accountability group is ready',
      'You have been placed in ' || coalesce(v_group_name,'your accountability group') || '. Your group chat is available now.',
      'Open Group Chat',
      '/accountability/chat',
      jsonb_build_object('groupId', new.group_id),
      true
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_notify_accountability_membership on public.program_accountability_memberships;
create trigger trg_notify_accountability_membership
after insert or update of status,group_id on public.program_accountability_memberships
for each row execute function public.notify_accountability_membership();

-- Coach assignment notification to group members and coach.
create or replace function public.notify_accountability_coach_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_member record;
  v_group_name text;
  v_coach_name text;
begin
  if new.mentor_id is not distinct from old.mentor_id then return new; end if;

  v_group_name := new.name;

  if new.mentor_id is not null then
    select trim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))
    into v_coach_name
    from public.profiles where id = new.mentor_id;

    perform public.queue_user_notification(
      new.mentor_id,
      'coach_group_assigned',
      'You have a new accountability group',
      'You are now the Accountability Coach for ' || v_group_name || '.',
      'Open Coach Dashboard',
      '/coach-dashboard',
      jsonb_build_object('groupId', new.id),
      true
    );
  end if;

  for v_member in
    select e.user_id
    from public.program_accountability_memberships m
    join public.program_enrollments e on e.id = m.enrollment_id
    where m.group_id = new.id and m.status = 'active' and e.user_id is not null
  loop
    perform public.queue_user_notification(
      v_member.user_id,
      'accountability_coach_assigned',
      'Your Accountability Coach was updated',
      case when new.mentor_id is null
        then 'Your group currently has no assigned Accountability Coach.'
        else coalesce(v_coach_name,'A coach') || ' is now supporting ' || v_group_name || '.'
      end,
      'Open Group Chat',
      '/accountability/chat',
      jsonb_build_object('groupId', new.id, 'coachId', new.mentor_id),
      true
    );
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_notify_accountability_coach_assignment on public.accountability_groups;
create trigger trg_notify_accountability_coach_assignment
after update of mentor_id on public.accountability_groups
for each row execute function public.notify_accountability_coach_assignment();

-- Referral commission notification.
create or replace function public.notify_referral_earning()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid;
begin
  if new.status = 'reversed' then return new; end if;
  if tg_op = 'UPDATE'
     and new.amount_minor is not distinct from old.amount_minor
     and new.status is not distinct from old.status then
    return new;
  end if;

  if new.referrer_submission_id is not null then
    select e.user_id into v_user_id
    from public.program_enrollments e
    where e.source_submission_id = new.referrer_submission_id;
  end if;

  if v_user_id is not null then
    perform public.queue_user_notification(
      v_user_id,
      'referral_earning',
      'Referral earnings updated',
      'A referral earning has been added to your GOALS referral ledger.',
      'View Referral Earnings',
      '/profile',
      jsonb_build_object('earningId', new.id, 'amountMinor', new.amount_minor),
      true
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_notify_referral_earning on public.program_referral_earnings;
create trigger trg_notify_referral_earning
after insert or update of amount_minor,status on public.program_referral_earnings
for each row execute function public.notify_referral_earning();

-- Referral payout notification.
create or replace function public.notify_referral_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid;
begin
  if new.status <> 'paid' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'paid' then return new; end if;

  if new.referrer_submission_id is not null then
    select e.user_id into v_user_id
    from public.program_enrollments e
    where e.source_submission_id = new.referrer_submission_id;
  end if;

  if v_user_id is not null then
    perform public.queue_user_notification(
      v_user_id,
      'referral_payout',
      'Referral payout recorded',
      'A referral payout has been recorded on your GOALS account.',
      'View Referral Earnings',
      '/profile',
      jsonb_build_object('payoutId', new.id, 'amountMinor', new.amount_minor),
      true
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_notify_referral_payout on public.program_referral_payouts;
create trigger trg_notify_referral_payout
after insert or update of status on public.program_referral_payouts
for each row execute function public.notify_referral_payout();

-- Certificate notification.
create or replace function public.notify_certificate_issued()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid;
begin
  if new.certificate_issued_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.certificate_issued_at is not null then return new; end if;

  select e.user_id into v_user_id
  from public.program_enrollments e
  where e.source_submission_id = new.submission_id;

  if v_user_id is not null then
    perform public.queue_user_notification(
      v_user_id,
      'certificate_issued',
      'Your GOALS certificate is ready',
      'Congratulations. Your completion certificate has been issued.',
      'Open Profile',
      '/profile',
      jsonb_build_object('certificateCode', new.certificate_code),
      true
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_notify_certificate_issued on public.program_participant_status;
create trigger trg_notify_certificate_issued
after insert or update of certificate_issued_at on public.program_participant_status
for each row execute function public.notify_certificate_issued();


create or replace function public.admin_send_program_announcement(
  p_title text,
  p_body text,
  p_action_label text default null,
  p_action_path text default null,
  p_cohort_id uuid default null,
  p_email boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_recipient record;
  v_count integer := 0;
begin
  if auth.uid() is null
     or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  if char_length(trim(coalesce(p_title,''))) < 3 then
    raise exception 'Announcement title is required';
  end if;

  if char_length(trim(coalesce(p_body,''))) < 3 then
    raise exception 'Announcement body is required';
  end if;

  for v_recipient in
    select distinct e.user_id
    from public.program_enrollments e
    where e.user_id is not null
      and (p_cohort_id is null or e.cohort_id = p_cohort_id)
      and e.status in ('active','completed')
  loop
    perform public.queue_user_notification(
      v_recipient.user_id,
      'admin_announcement',
      trim(p_title),
      trim(p_body),
      nullif(trim(coalesce(p_action_label,'')),''),
      nullif(trim(coalesce(p_action_path,'')),''),
      jsonb_build_object('cohortId', p_cohort_id),
      p_email
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.admin_send_program_announcement(text,text,text,text,uuid,boolean) from public;
grant execute on function public.admin_send_program_announcement(text,text,text,text,uuid,boolean)
to authenticated, service_role;


create or replace function public.notify_accountability_meeting_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_member record;
  v_group_name text;
begin
  if new.starts_at is null then return new; end if;

  select name into v_group_name
  from public.accountability_groups
  where id = new.group_id;

  for v_member in
    select e.user_id
    from public.program_accountability_memberships m
    join public.program_enrollments e on e.id = m.enrollment_id
    where m.group_id = new.group_id
      and m.status = 'active'
      and e.user_id is not null
  loop
    perform public.queue_user_notification(
      v_member.user_id,
      'accountability_meeting_scheduled',
      'Accountability check-in scheduled',
      coalesce(v_group_name,'Your group') || ' has a ' || new.recurrence || ' check-in schedule. Add it to your calendar from Profile.',
      'Open Calendar',
      '/profile',
      jsonb_build_object('groupId', new.group_id, 'startsAt', new.starts_at),
      true
    );
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_notify_accountability_meeting_change on public.accountability_group_meetings;
create trigger trg_notify_accountability_meeting_change
after insert or update of starts_at,recurrence,meeting_url,duration_minutes
on public.accountability_group_meetings
for each row execute function public.notify_accountability_meeting_change();
