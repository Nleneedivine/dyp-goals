-- Planner fixed commitments and availability blocks.

create table if not exists public.planner_fixed_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null check (char_length(title) between 1 and 160),
  category text not null default 'Other'
    check (category in ('Sleep','Work','Class','Commute','Family','Ministry','Health','Meal','Other')),
  recurrence text not null default 'weekly'
    check (recurrence in ('weekly','date')),
  days_of_week smallint[] not null default '{}',
  specific_date date,
  active_start_date date,
  active_end_date date,
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_fixed_blocks_active_window_valid
    check (
      active_start_date is null
      or active_end_date is null
      or active_end_date >= active_start_date
    ),
  constraint planner_fixed_blocks_recurrence_shape
    check (
      (
        recurrence = 'weekly'
        and cardinality(days_of_week) between 1 and 7
        and specific_date is null
      )
      or
      (
        recurrence = 'date'
        and cardinality(days_of_week) = 0
        and specific_date is not null
      )
    ),
  constraint planner_fixed_blocks_times_not_equal
    check (start_time <> end_time)
);

create index if not exists planner_fixed_blocks_user_idx
  on public.planner_fixed_blocks(user_id, recurrence);

create index if not exists planner_fixed_blocks_specific_date_idx
  on public.planner_fixed_blocks(user_id, specific_date)
  where specific_date is not null;

grant select, insert, update, delete on public.planner_fixed_blocks to authenticated;
grant all on public.planner_fixed_blocks to service_role;

alter table public.planner_fixed_blocks enable row level security;

drop policy if exists "Users can view own planner fixed blocks" on public.planner_fixed_blocks;
create policy "Users can view own planner fixed blocks"
on public.planner_fixed_blocks for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own planner fixed blocks" on public.planner_fixed_blocks;
create policy "Users can create own planner fixed blocks"
on public.planner_fixed_blocks for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own planner fixed blocks" on public.planner_fixed_blocks;
create policy "Users can update own planner fixed blocks"
on public.planner_fixed_blocks for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own planner fixed blocks" on public.planner_fixed_blocks;
create policy "Users can delete own planner fixed blocks"
on public.planner_fixed_blocks for delete to authenticated
using (user_id = auth.uid());

create or replace function public.validate_planner_fixed_block_days()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_day smallint;
begin
  if new.recurrence = 'weekly' then
    foreach v_day in array new.days_of_week
    loop
      if v_day < 1 or v_day > 7 then
        raise exception 'Weekly planner days must be ISO weekday numbers 1 through 7';
      end if;
    end loop;

    if cardinality(new.days_of_week) <> cardinality(array(select distinct unnest(new.days_of_week))) then
      raise exception 'Weekly planner days cannot contain duplicates';
    end if;
  end if;

  new.crosses_midnight := new.end_time < new.start_time;
  return new;
end;
$function$;

drop trigger if exists validate_planner_fixed_block_days on public.planner_fixed_blocks;
create trigger validate_planner_fixed_block_days
before insert or update on public.planner_fixed_blocks
for each row execute function public.validate_planner_fixed_block_days();

drop trigger if exists update_planner_fixed_blocks_updated_at on public.planner_fixed_blocks;
create trigger update_planner_fixed_blocks_updated_at
before update on public.planner_fixed_blocks
for each row execute function public.update_updated_at_column();

comment on table public.planner_fixed_blocks is
  'Recurring or date-specific fixed commitments used to protect unavailable time before scheduling goal tasks.';
