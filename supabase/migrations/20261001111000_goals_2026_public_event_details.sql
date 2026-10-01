-- Keep public GOALS campaign details data-driven for the 2026 event.
alter table public.program_events
  add column if not exists platform text not null default 'Online',
  add column if not exists discount_deadline date;

update public.program_events
set
  platform = 'Google Meet',
  discount_deadline = date '2026-11-20',
  benefits = jsonb_build_array(
    'A clear vision for the year ahead',
    'A practical framework for turning your vision into meaningful goals',
    'Guidance for setting specific, measurable and actionable goals',
    'A practical time-management system for turning goals into daily action',
    'AI-assisted goal review and refinement',
    'A personal action plan you can continue using after the master class',
    'Access to the DYP community and accountability pathway',
    'Access to the 3-month Accountability Lab series in 2027 with human accountability support'
  ),
  updated_at = now()
where slug = 'goals-masterclass-2026';
