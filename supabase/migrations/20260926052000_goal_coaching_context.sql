-- Preserve AI coaching insights and distinguish confirmed effort from estimates.

alter table public.goals
  add column if not exists coaching_context jsonb not null default '{}'::jsonb,
  add column if not exists effort_source text not null default 'unknown';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'goals_effort_source_valid'
      and conrelid = 'public.goals'::regclass
  ) then
    alter table public.goals
      add constraint goals_effort_source_valid
      check (effort_source in ('unknown', 'user_confirmed', 'ai_estimate_confirmed'));
  end if;
end
$$;

comment on column public.goals.coaching_context is
  'Structured coaching history and execution insights captured during AI goal refinement.';

comment on column public.goals.effort_source is
  'Origin of estimated_hours_per_week: unknown, user_confirmed, or ai_estimate_confirmed.';
