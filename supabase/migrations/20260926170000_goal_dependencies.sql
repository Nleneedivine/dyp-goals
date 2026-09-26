-- User-confirmed dependencies between portfolio goals.
-- Dependencies are advisory planning context; they do not automatically block execution.

create table if not exists public.goal_dependencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  prerequisite_goal_id uuid not null references public.goals(id) on delete cascade,
  dependent_goal_id uuid not null references public.goals(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_dependencies_not_self
    check (prerequisite_goal_id <> dependent_goal_id),
  constraint goal_dependencies_unique_pair
    unique (user_id, prerequisite_goal_id, dependent_goal_id)
);

create index if not exists goal_dependencies_user_idx
  on public.goal_dependencies(user_id);

create index if not exists goal_dependencies_prerequisite_idx
  on public.goal_dependencies(prerequisite_goal_id);

create index if not exists goal_dependencies_dependent_idx
  on public.goal_dependencies(dependent_goal_id);

grant select, insert, update, delete on public.goal_dependencies to authenticated;
grant all on public.goal_dependencies to service_role;

alter table public.goal_dependencies enable row level security;

drop policy if exists "Users can view own goal dependencies" on public.goal_dependencies;
create policy "Users can view own goal dependencies"
on public.goal_dependencies for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own goal dependencies" on public.goal_dependencies;
create policy "Users can create own goal dependencies"
on public.goal_dependencies for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own goal dependencies" on public.goal_dependencies;
create policy "Users can update own goal dependencies"
on public.goal_dependencies for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own goal dependencies" on public.goal_dependencies;
create policy "Users can delete own goal dependencies"
on public.goal_dependencies for delete to authenticated
using (user_id = auth.uid());

create or replace function public.validate_goal_dependency_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1 from public.goals g
    where g.id = new.prerequisite_goal_id
      and g.user_id = new.user_id
  ) then
    raise exception 'Prerequisite goal does not belong to this user';
  end if;

  if not exists (
    select 1 from public.goals g
    where g.id = new.dependent_goal_id
      and g.user_id = new.user_id
  ) then
    raise exception 'Dependent goal does not belong to this user';
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_goal_dependency_ownership on public.goal_dependencies;
create trigger validate_goal_dependency_ownership
before insert or update on public.goal_dependencies
for each row execute function public.validate_goal_dependency_ownership();

drop trigger if exists update_goal_dependencies_updated_at on public.goal_dependencies;
create trigger update_goal_dependencies_updated_at
before update on public.goal_dependencies
for each row execute function public.update_updated_at_column();

comment on table public.goal_dependencies is
  'User-confirmed advisory dependencies between portfolio goals. The planner surfaces them but does not auto-block or reprioritize goals.';
