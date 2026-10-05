-- Add a distinct role for Accountability Lab group support.
alter type public.app_role add value if not exists 'accountability_coach';
