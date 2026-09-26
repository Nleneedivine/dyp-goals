-- Privacy-preserving aggregate execution trends for DYP program admins.
-- Returns counts and effort totals only; no participant task titles, calendar blocks,
-- coaching context, vision text, or private capacity details are exposed.

create or replace function public.get_accountability_program_trends(
  p_week_start date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_week_end date := p_week_start + 6;
  v_today date := current_date;
  v_result jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;

  if extract(isodow from p_week_start) <> 1 then
    raise exception 'Week start must be a Monday';
  end if;

  with
  profile_base as (
    select p.id, p.group_id
    from public.profiles p
  ),
  active_goals as (
    select g.id, g.user_id
    from public.goals g
    where g.status in ('draft','active')
  ),
  weekly_reviews as (
    select r.*
    from public.goal_weekly_reviews r
    where r.week_start = p_week_start
  ),
  overdue_milestones as (
    select m.id, g.user_id
    from public.goal_milestones m
    join public.goals g on g.id = m.goal_id
    where m.status <> 'completed'
      and m.due_date is not null
      and m.due_date < v_today
      and g.status in ('draft','active')
  ),
  sharing as (
    select s.user_id
    from public.accountability_sharing_preferences s
    where s.share_goals
  ),
  group_rows as (
    select
      ag.id as group_id,
      ag.name as group_name,
      (
        select count(*)::integer
        from profile_base p
        where p.group_id = ag.id
      ) as member_count,
      (
        select count(distinct g.user_id)::integer
        from active_goals g
        join profile_base p on p.id = g.user_id
        where p.group_id = ag.id
      ) as members_with_active_goals,
      (
        select count(distinct wr.user_id)::integer
        from weekly_reviews wr
        join profile_base p on p.id = wr.user_id
        where p.group_id = ag.id
      ) as members_reviewed_this_week,
      (
        select coalesce(sum(wr.planned_minutes), 0)::integer
        from weekly_reviews wr
        join profile_base p on p.id = wr.user_id
        where p.group_id = ag.id
      ) as planned_minutes_this_week,
      (
        select coalesce(sum(wr.completed_minutes), 0)::integer
        from weekly_reviews wr
        join profile_base p on p.id = wr.user_id
        where p.group_id = ag.id
      ) as completed_minutes_this_week,
      (
        select count(*)::integer
        from overdue_milestones om
        join profile_base p on p.id = om.user_id
        where p.group_id = ag.id
      ) as overdue_milestones,
      (
        select count(*)::integer
        from sharing s
        join profile_base p on p.id = s.user_id
        where p.group_id = ag.id
      ) as members_sharing_with_mentor
    from public.accountability_groups ag
  ),
  group_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'groupId', group_id,
          'groupName', group_name,
          'memberCount', member_count,
          'membersWithActiveGoals', members_with_active_goals,
          'membersReviewedThisWeek', members_reviewed_this_week,
          'plannedMinutesThisWeek', planned_minutes_this_week,
          'completedMinutesThisWeek', completed_minutes_this_week,
          'overdueMilestones', overdue_milestones,
          'membersSharingWithMentor', members_sharing_with_mentor
        )
        order by group_name
      ),
      '[]'::jsonb
    ) as value
    from group_rows
  )
  select jsonb_build_object(
    'weekStart', p_week_start,
    'weekEnd', v_week_end,
    'participants', (select count(*) from profile_base),
    'participantsAssignedToGroups', (
      select count(*) from profile_base where group_id is not null
    ),
    'participantsWithActiveGoals', (
      select count(distinct user_id) from active_goals
    ),
    'activeGoals', (
      select count(*) from active_goals
    ),
    'participantsReviewedThisWeek', (
      select count(distinct user_id) from weekly_reviews
    ),
    'weeklyReviews', (
      select count(*) from weekly_reviews
    ),
    'plannedMinutesThisWeek', (
      select coalesce(sum(planned_minutes), 0) from weekly_reviews
    ),
    'completedMinutesThisWeek', (
      select coalesce(sum(completed_minutes), 0) from weekly_reviews
    ),
    'overdueMilestones', (
      select count(*) from overdue_milestones
    ),
    'participantsSharingWithMentor', (
      select count(*) from sharing
    ),
    'groups', (select value from group_json)
  )
  into v_result;

  return v_result;
end;
$function$;

grant execute on function public.get_accountability_program_trends(date) to authenticated;

comment on function public.get_accountability_program_trends(date) is
  'Admin-only aggregate execution and accountability trends. Returns no participant-level private planning details.';
