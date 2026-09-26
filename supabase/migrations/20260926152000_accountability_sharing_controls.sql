-- Explicit, opt-in accountability sharing for the execution system.
-- Fixed commitments, capacity settings and private calendar context remain private.

create table if not exists public.accountability_sharing_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  share_goals boolean not null default false,
  share_tasks boolean not null default false,
  share_weekly_reviews boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accountability_sharing_requires_goal_context
    check (
      (not share_tasks or share_goals)
      and (not share_weekly_reviews or share_goals)
    )
);

grant select, insert, update, delete
  on public.accountability_sharing_preferences to authenticated;
grant all
  on public.accountability_sharing_preferences to service_role;

alter table public.accountability_sharing_preferences enable row level security;

drop policy if exists "Users can view own accountability sharing" on public.accountability_sharing_preferences;
create policy "Users can view own accountability sharing"
on public.accountability_sharing_preferences
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own accountability sharing" on public.accountability_sharing_preferences;
create policy "Users can create own accountability sharing"
on public.accountability_sharing_preferences
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own accountability sharing" on public.accountability_sharing_preferences;
create policy "Users can update own accountability sharing"
on public.accountability_sharing_preferences
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own accountability sharing" on public.accountability_sharing_preferences;
create policy "Users can delete own accountability sharing"
on public.accountability_sharing_preferences
for delete to authenticated
using (user_id = auth.uid());

create or replace function public.is_user_accountability_mentor(
  p_member_id uuid,
  p_mentor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    join public.accountability_groups g
      on g.id = p.group_id
    where p.id = p_member_id
      and g.mentor_id = p_mentor_id
      and public.has_role(p_mentor_id, 'mentor'::public.app_role)
  );
$function$;

grant execute on function public.is_user_accountability_mentor(uuid, uuid) to authenticated;

drop policy if exists "Mentors can view group sharing preferences" on public.accountability_sharing_preferences;
create policy "Mentors can view group sharing preferences"
on public.accountability_sharing_preferences
for select to authenticated
using (public.is_user_accountability_mentor(user_id, auth.uid()));

drop policy if exists "Opted-in mentors can view shared goals" on public.goals;
create policy "Opted-in mentors can view shared goals"
on public.goals
for select to authenticated
using (
  exists (
    select 1
    from public.accountability_sharing_preferences p
    where p.user_id = goals.user_id
      and p.share_goals
      and public.is_user_accountability_mentor(goals.user_id, auth.uid())
  )
);

drop policy if exists "Opted-in mentors can view shared milestones" on public.goal_milestones;
create policy "Opted-in mentors can view shared milestones"
on public.goal_milestones
for select to authenticated
using (
  exists (
    select 1
    from public.goals g
    join public.accountability_sharing_preferences p
      on p.user_id = g.user_id
    where g.id = goal_milestones.goal_id
      and p.share_goals
      and public.is_user_accountability_mentor(g.user_id, auth.uid())
  )
);

drop policy if exists "Opted-in mentors can view shared goal effort" on public.goal_effort_periods;
create policy "Opted-in mentors can view shared goal effort"
on public.goal_effort_periods
for select to authenticated
using (
  exists (
    select 1
    from public.goals g
    join public.accountability_sharing_preferences p
      on p.user_id = g.user_id
    where g.id = goal_effort_periods.goal_id
      and p.share_goals
      and public.is_user_accountability_mentor(g.user_id, auth.uid())
  )
);

drop policy if exists "Opted-in mentors can view shared weekly actions" on public.goal_weekly_actions;
create policy "Opted-in mentors can view shared weekly actions"
on public.goal_weekly_actions
for select to authenticated
using (
  exists (
    select 1
    from public.accountability_sharing_preferences p
    where p.user_id = goal_weekly_actions.user_id
      and p.share_tasks
      and public.is_user_accountability_mentor(goal_weekly_actions.user_id, auth.uid())
  )
);

drop policy if exists "Opted-in mentors can view shared goal tasks" on public.goal_tasks;
create policy "Opted-in mentors can view shared goal tasks"
on public.goal_tasks
for select to authenticated
using (
  exists (
    select 1
    from public.accountability_sharing_preferences p
    where p.user_id = goal_tasks.user_id
      and p.share_tasks
      and public.is_user_accountability_mentor(goal_tasks.user_id, auth.uid())
  )
);

drop policy if exists "Opted-in mentors can view shared weekly reviews" on public.goal_weekly_reviews;
create policy "Opted-in mentors can view shared weekly reviews"
on public.goal_weekly_reviews
for select to authenticated
using (
  exists (
    select 1
    from public.accountability_sharing_preferences p
    where p.user_id = goal_weekly_reviews.user_id
      and p.share_weekly_reviews
      and public.is_user_accountability_mentor(goal_weekly_reviews.user_id, auth.uid())
  )
);

drop trigger if exists update_accountability_sharing_preferences_updated_at
on public.accountability_sharing_preferences;

create trigger update_accountability_sharing_preferences_updated_at
before update on public.accountability_sharing_preferences
for each row execute function public.update_updated_at_column();

comment on table public.accountability_sharing_preferences is
  'Explicit user-controlled sharing scope for their assigned accountability mentor. Goal capacity and fixed calendar commitments are never shared by these policies.';
