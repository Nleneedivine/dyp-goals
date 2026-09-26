-- Personal planning direction above the goal portfolio.
-- Vision and life-area focus remain private to the user by default.

create table if not exists public.user_planning_vision (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  vision_statement text not null default ''
    check (char_length(vision_statement) <= 12000),
  year_theme text not null default ''
    check (char_length(year_theme) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.life_area_focus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  life_area text not null
    check (char_length(trim(life_area)) between 1 and 80),
  focus_statement text not null default ''
    check (char_length(focus_statement) <= 4000),
  active boolean not null default true,
  display_order integer not null default 0
    check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists life_area_focus_user_name_uidx
  on public.life_area_focus(user_id, lower(life_area));

create index if not exists life_area_focus_user_order_idx
  on public.life_area_focus(user_id, active desc, display_order, life_area);

grant select, insert, update, delete on public.user_planning_vision to authenticated;
grant select, insert, update, delete on public.life_area_focus to authenticated;
grant all on public.user_planning_vision to service_role;
grant all on public.life_area_focus to service_role;

alter table public.user_planning_vision enable row level security;
alter table public.life_area_focus enable row level security;

drop policy if exists "Users can view own planning vision" on public.user_planning_vision;
create policy "Users can view own planning vision"
on public.user_planning_vision for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own planning vision" on public.user_planning_vision;
create policy "Users can create own planning vision"
on public.user_planning_vision for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own planning vision" on public.user_planning_vision;
create policy "Users can update own planning vision"
on public.user_planning_vision for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own planning vision" on public.user_planning_vision;
create policy "Users can delete own planning vision"
on public.user_planning_vision for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can view own life area focus" on public.life_area_focus;
create policy "Users can view own life area focus"
on public.life_area_focus for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own life area focus" on public.life_area_focus;
create policy "Users can create own life area focus"
on public.life_area_focus for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own life area focus" on public.life_area_focus;
create policy "Users can update own life area focus"
on public.life_area_focus for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own life area focus" on public.life_area_focus;
create policy "Users can delete own life area focus"
on public.life_area_focus for delete to authenticated
using (user_id = auth.uid());

drop trigger if exists update_user_planning_vision_updated_at
on public.user_planning_vision;
create trigger update_user_planning_vision_updated_at
before update on public.user_planning_vision
for each row execute function public.update_updated_at_column();

drop trigger if exists update_life_area_focus_updated_at
on public.life_area_focus;
create trigger update_life_area_focus_updated_at
before update on public.life_area_focus
for each row execute function public.update_updated_at_column();

comment on table public.user_planning_vision is
  'Private high-level direction that the user wants their goal portfolio to serve.';

comment on table public.life_area_focus is
  'Private per-life-area focus statements that sit between personal vision and individual goals.';
