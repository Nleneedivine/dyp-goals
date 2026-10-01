-- Capture explicit participant consent to the accountability operating rules
-- without changing existing group assignments.
alter table public.mentorship_requests
  add column if not exists accountability_rules_accepted boolean not null default false,
  add column if not exists accountability_rules_accepted_at timestamptz;

comment on column public.mentorship_requests.accountability_rules_accepted is
  'Whether the participant explicitly accepted the accountability-group operating rules when submitting the request.';

comment on column public.mentorship_requests.accountability_rules_accepted_at is
  'Timestamp when the participant accepted the accountability-group operating rules.';
