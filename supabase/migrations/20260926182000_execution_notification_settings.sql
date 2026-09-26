-- Execution notification preferences and delivery deduplication.

create table if not exists public.execution_notification_settings (
  user_id uuid primary key,
  email_enabled boolean not null default false,
  morning_brief_enabled boolean not null default false,
  morning_time time not null default '07:00',
  evening_debrief_enabled boolean not null default false,
  evening_time time not null default '20:00',
  weekly_review_enabled boolean not null default false,
  weekly_review_day smallint not null default 7
    check (weekly_review_day between 1 and 7),
  weekly_review_time time not null default '18:00',
  deadline_alerts_enabled boolean not null default false,
  deadline_days_before smallint[] not null default array[7,3,1]::smallint[],
  timezone text not null default 'UTC'
    check (char_length(timezone) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint execution_notification_days_count
    check (cardinality(deadline_days_before) <= 5)
);

create table if not exists public.execution_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  notification_type text not null
    check (notification_type in (
      'morning_brief',
      'evening_debrief',
      'weekly_review',
      'deadline_alert'
    )),
  reference_key text not null
    check (char_length(reference_key) between 1 and 240),
  status text not null default 'sent'
    check (status in ('sent','failed')),
  error_message text not null default ''
    check (char_length(error_message) <= 2000),
  delivered_at timestamptz not null default now(),
  unique (user_id, notification_type, reference_key)
);

create index if not exists execution_notification_deliveries_user_time_idx
  on public.execution_notification_deliveries(user_id, delivered_at desc);

grant select, insert, update, delete
  on public.execution_notification_settings to authenticated;
grant all on public.execution_notification_settings to service_role;

grant select on public.execution_notification_deliveries to authenticated;
grant all on public.execution_notification_deliveries to service_role;

alter table public.execution_notification_settings enable row level security;
alter table public.execution_notification_deliveries enable row level security;

drop policy if exists "Users can view own execution notification settings"
on public.execution_notification_settings;
create policy "Users can view own execution notification settings"
on public.execution_notification_settings
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own execution notification settings"
on public.execution_notification_settings;
create policy "Users can create own execution notification settings"
on public.execution_notification_settings
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own execution notification settings"
on public.execution_notification_settings;
create policy "Users can update own execution notification settings"
on public.execution_notification_settings
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own execution notification settings"
on public.execution_notification_settings;
create policy "Users can delete own execution notification settings"
on public.execution_notification_settings
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can view own execution notification deliveries"
on public.execution_notification_deliveries;
create policy "Users can view own execution notification deliveries"
on public.execution_notification_deliveries
for select to authenticated
using (user_id = auth.uid());

create or replace function public.validate_execution_notification_days()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_day smallint;
begin
  foreach v_day in array new.deadline_days_before
  loop
    if v_day < 0 or v_day > 60 then
      raise exception 'Deadline alert days must be between 0 and 60';
    end if;
  end loop;

  if cardinality(new.deadline_days_before)
     <> cardinality(array(select distinct unnest(new.deadline_days_before))) then
    raise exception 'Deadline alert days cannot contain duplicates';
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_execution_notification_days
on public.execution_notification_settings;
create trigger validate_execution_notification_days
before insert or update on public.execution_notification_settings
for each row execute function public.validate_execution_notification_days();

drop trigger if exists update_execution_notification_settings_updated_at
on public.execution_notification_settings;
create trigger update_execution_notification_settings_updated_at
before update on public.execution_notification_settings
for each row execute function public.update_updated_at_column();

comment on table public.execution_notification_settings is
  'Opt-in email timing preferences for the GOALS execution rhythm.';

comment on table public.execution_notification_deliveries is
  'Delivery ledger used to prevent duplicate morning, evening, weekly and deadline emails.';
