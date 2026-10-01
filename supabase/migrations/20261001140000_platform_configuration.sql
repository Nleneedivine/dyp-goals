-- Global product/program configuration controlled by admins.
create table if not exists public.platform_configuration (
  id text primary key check (id = 'global'),
  accountability_lab_start_date date not null default date '2027-01-08',
  ui2_default boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.platform_configuration (
  id,
  accountability_lab_start_date,
  ui2_default
)
values ('global', date '2027-01-08', false)
on conflict (id) do nothing;

alter table public.platform_configuration enable row level security;

drop policy if exists "Anyone can read platform configuration"
on public.platform_configuration;
create policy "Anyone can read platform configuration"
on public.platform_configuration
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can update platform configuration"
on public.platform_configuration;
create policy "Admins can update platform configuration"
on public.platform_configuration
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select on public.platform_configuration to anon, authenticated;
grant update on public.platform_configuration to authenticated;
grant all on public.platform_configuration to service_role;

create or replace function public.touch_platform_configuration()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$function$;

drop trigger if exists trg_touch_platform_configuration
on public.platform_configuration;
create trigger trg_touch_platform_configuration
before update on public.platform_configuration
for each row
execute function public.touch_platform_configuration();

comment on table public.platform_configuration is
  'Admin-controlled global product rollout and program schedule configuration.';
