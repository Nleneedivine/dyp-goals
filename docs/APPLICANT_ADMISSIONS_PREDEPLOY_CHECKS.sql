-- DYP GOALS applicant admissions: READ-ONLY pre-deployment checks.
-- Run only after migrations 20261121120000 through 20261121230000 have been
-- applied to a NON-PRODUCTION staging database.
-- Do not run migration 20261121240000 until its impact query below is reviewed.
-- Every statement in this file is SELECT-only.

-- 1. Migration ledger: expected versions already applied in staging.
select version
from supabase_migrations.schema_migrations
where version in (
  '20261121120000',
  '20261121150000',
  '20261121180000',
  '20261121200000',
  '20261121210000',
  '20261121220000',
  '20261121230000'
)
order by version;

-- 2. Required tables exist and RLS is enabled.
select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'program_application_admissions',
    'program_applicant_portal_tokens',
    'program_applicant_portal_audit'
  )
order by c.relname;

-- 3. No admission rows may belong to another programme.
-- Expected: zero rows.
select a.submission_id, f.id as form_id, c.program_key
from public.program_application_admissions a
join public.program_form_submissions s on s.id = a.submission_id
join public.program_forms f on f.id = s.form_id
left join public.program_cohorts c on c.id = f.cohort_id
where c.program_key is distinct from 'goals';

-- 4. Admission state distribution, scoped to GOALS.
select a.status, count(*)::bigint as applications
from public.program_application_admissions a
join public.program_form_submissions s on s.id = a.submission_id
join public.program_forms f on f.id = s.form_id
join public.program_cohorts c on c.id = f.cohort_id
where c.program_key = 'goals'
group by a.status
order by a.status;

-- 5. Preview the exact Accountability Lab cleanup in migration 20261121240000.
-- These are the rows the migration will mark removed/delete. Review every
-- returned row before executing that migration.
with affected_memberships as (
  select m.enrollment_id, e.source_submission_id, e.user_id,
         a.status as admission_status, m.group_id
  from public.program_accountability_memberships m
  join public.program_enrollments e on e.id = m.enrollment_id
  join public.program_application_admissions a on a.submission_id = e.source_submission_id
  join public.program_cohorts c on c.id = e.cohort_id
  where c.program_key = 'goals'
    and a.status <> 'admitted'
    and m.status = 'active'
)
select admission_status, count(*)::bigint as memberships_to_mark_removed
from affected_memberships
group by admission_status
order by admission_status;

with affected_chat_memberships as (
  select distinct cgm.group_id, cgm.user_id, am.admission_status
  from public.chat_group_members cgm
  join public.chat_groups cg on cg.id = cgm.group_id
  join public.program_accountability_memberships m
    on m.group_id = cg.accountability_group_id
  join public.program_enrollments e on e.id = m.enrollment_id
  join public.program_application_admissions a on a.submission_id = e.source_submission_id
  join public.program_cohorts c on c.id = e.cohort_id
  cross join lateral (select a.status as admission_status) am
  where c.program_key = 'goals'
    and a.status <> 'admitted'
    and m.status = 'active'
    and e.user_id = cgm.user_id
)
select admission_status, count(*)::bigint as chat_memberships_to_delete
from affected_chat_memberships
group by admission_status
order by admission_status;

-- 6. Existing GOALS enrollment totals (baseline for before/after comparison).
select c.program_key, e.status, count(*)::bigint as enrollments
from public.program_enrollments e
join public.program_cohorts c on c.id = e.cohort_id
where c.program_key = 'goals'
group by c.program_key, e.status
order by e.status;

-- 7. Verify portal resolver is service-role only; admin functions require
-- authenticated callers. Expected booleans: anon=false, authenticated=false
-- for resolver; authenticated=true for admin RPCs.
select
  has_function_privilege('anon', 'public.get_applicant_portal_state(text)', 'EXECUTE') as anon_can_resolve_portal,
  has_function_privilege('authenticated', 'public.get_applicant_portal_state(text)', 'EXECUTE') as authenticated_can_resolve_portal,
  has_function_privilege('service_role', 'public.get_applicant_portal_state(text)', 'EXECUTE') as service_role_can_resolve_portal,
  has_function_privilege('authenticated', 'public.admin_set_program_application_admission(uuid,text,text)', 'EXECUTE') as authenticated_can_decide_admission,
  has_function_privilege('authenticated', 'public.admin_create_applicant_portal_token(uuid,text)', 'EXECUTE') as authenticated_can_create_portal_link;

-- 8. Verify legacy session RPCs cannot be used directly for new admission rows.
-- The functions should remain executable for anon/authenticated for legacy
-- programme sessions, but their bodies must contain the admission-row guard.
select p.proname,
       pg_get_functiondef(p.oid) like '%program_application_admissions%' as contains_admission_guard
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_program_payment_state',
    'submit_manual_program_payment_with_proof',
    'submit_manual_program_payment',
    'get_program_referral_code'
  )
order by p.proname;

-- 9. After migration 20261121240000, verify both accountability guards exist.
-- Expected: one trigger for memberships and one for chat_group_members.
select c.relname as table_name, t.tgname as trigger_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname = 'public'
  and t.tgname in (
    'guard_accountability_membership_admission',
    'guard_accountability_chat_group_member_admission'
  )
order by c.relname, t.tgname;

-- 10. Verify portal token lifetime default remains 180 days.
select column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'program_applicant_portal_tokens'
  and column_name = 'expires_at';

-- 11. Check no unapproved admission rows accidentally expose programme access.
-- Expected: zero rows from the access helper.
select a.submission_id, a.status
from public.program_application_admissions a
where a.status <> 'admitted'
  and public.program_application_access_allowed(a.submission_id);

-- After migration 20261121240000 is applied, rerun sections 5 and 6.
-- The accountability impact queries should return zero pending/rejected
-- active memberships/chat memberships; existing legacy participants have
-- no admission row and therefore are not in the cleanup set.
