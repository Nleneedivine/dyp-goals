-- GOALS 2026 event configuration and Edge Function rate limiting.
-- Event dates/pricing live in data, not page components, so the public experience
-- can be updated without rewriting countdown/schedule components.

create table if not exists public.program_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Africa/Lagos',
  session_start_time text not null default '8:00 PM',
  session_end_time text not null default '9:30 PM',
  currency text not null default 'NGN' check (currency = 'NGN'),
  original_price numeric(12,2) not null check (original_price >= 0),
  discounted_price numeric(12,2) not null check (discounted_price >= 0 and discounted_price <= original_price),
  registration_slug text not null default 'goals-masterclass-2026',
  benefits jsonb not null default '[]'::jsonb,
  status text not null default 'published' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_events_schedule_valid check (ends_at > starts_at)
);

alter table public.program_events enable row level security;
revoke all on table public.program_events from anon, authenticated;
grant select on table public.program_events to anon, authenticated;
grant all on table public.program_events to service_role;

drop policy if exists "Public can view published events" on public.program_events;
create policy "Public can view published events"
on public.program_events
for select
to anon, authenticated
using (status = 'published');

create index if not exists program_events_slug_idx on public.program_events(slug);
create trigger update_program_events_updated_at
before update on public.program_events
for each row execute function public.update_updated_at_column();

insert into public.program_events (
  slug,
  title,
  starts_at,
  ends_at,
  timezone,
  session_start_time,
  session_end_time,
  currency,
  original_price,
  discounted_price,
  registration_slug,
  benefits,
  status
)
values (
  'goals-masterclass-2026',
  'DYP GOALS Master Class 2026',
  '2026-11-27T20:00:00+01:00',
  '2026-11-29T21:30:00+01:00',
  'Africa/Lagos',
  '8:00 PM',
  '9:30 PM',
  'NGN',
  35000,
  5000,
  'goals-masterclass-2026',
  '[
    "A clear vision for the year ahead",
    "A practical framework for turning your vision into meaningful goals",
    "Guidance for setting specific, measurable and actionable goals",
    "A practical time-management system for turning goals into daily action",
    "AI-assisted goal review and refinement",
    "A personal action plan you can continue using after the master class",
    "Access to the DYP community and accountability pathway",
    "Eligibility to continue into the 3-month Accountability Lab series in 2027"
  ]'::jsonb,
  'published'
)
on conflict (slug) do update set
  title = excluded.title,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  timezone = excluded.timezone,
  session_start_time = excluded.session_start_time,
  session_end_time = excluded.session_end_time,
  currency = excluded.currency,
  original_price = excluded.original_price,
  discounted_price = excluded.discounted_price,
  registration_slug = excluded.registration_slug,
  benefits = excluded.benefits,
  status = excluded.status,
  updated_at = now();

-- Server-side rate limiting for Edge Functions.
create table if not exists public.edge_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

revoke all on table public.edge_rate_limits from anon, authenticated;
grant all on table public.edge_rate_limits to service_role;
alter table public.edge_rate_limits enable row level security;

create or replace function public.consume_edge_rate_limit(
  p_rate_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.edge_rate_limits%rowtype;
  now_ts timestamptz := now();
  window_end timestamptz;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    return query select false, 0, p_window_seconds;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_rate_key));

  select *
  into current_row
  from public.edge_rate_limits
  where rate_key = p_rate_key
  for update;

  if current_row is null or current_row.window_started_at + make_interval(secs => p_window_seconds) <= now_ts then
    insert into public.edge_rate_limits(rate_key, window_started_at, request_count, updated_at)
    values (p_rate_key, now_ts, 1, now_ts)
    on conflict (rate_key) do update set
      window_started_at = excluded.window_started_at,
      request_count = 1,
      updated_at = now_ts;

    return query select true, p_limit - 1, 0;
    return;
  end if;

  window_end := current_row.window_started_at + make_interval(secs => p_window_seconds);

  if current_row.request_count >= p_limit then
    return query select false, 0, greatest(1, ceil(extract(epoch from (window_end - now_ts)))::integer);
    return;
  end if;

  update public.edge_rate_limits
  set request_count = request_count + 1, updated_at = now_ts
  where rate_key = p_rate_key;

  return query select true, p_limit - current_row.request_count - 1, 0;
end;
$$;

revoke execute on function public.consume_edge_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_edge_rate_limit(text, integer, integer) to service_role;
