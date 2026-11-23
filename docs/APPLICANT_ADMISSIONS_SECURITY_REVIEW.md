# Applicant Portal & Admissions — Security Review (2026-11-21)

## Scope
Repository: `Nleneedivine/dyp-goals`
Branch: `feature/applicant-portal-admissions`
This review covers the five agreed workstreams: payment/proof RPCs, programme entitlements, database admission gates, admin/portal-token controls, and a consolidated SQL/release review.

No production SQL was executed. No deployment or merge to `main` was performed.

## Changes committed on this branch during this review

1. `20261121210000_prevent_replacing_verified_payment_proof.sql`
   - Locks an existing payment row before proof replacement.
   - Rejects proof/reference replacement when payment status is already `paid`.
   - Clears stale verification metadata only when replacing a non-paid proof.
2. `supabase/functions/program-payment/index.ts`
   - Checks payment status before issuing a signed upload URL.
   - Returns HTTP 409 for an already verified payment. The SQL guard remains authoritative for races.
3. `20261121220000_scope_admissions_to_goals_forms.sql`
   - Restricts creation of new admission rows to forms attached to a cohort whose `program_key = 'goals'`.
   - This is important because `program_form_submissions` is shared; the original trigger would have placed every programme's future form submissions into the DYP GOALS admission workflow.
4. `src/pages/admin/AdminApplications.tsx`
   - Restricts incomplete-payment recovery candidates to enrollments in GOALS cohorts.
5. `src/components/ProgramAccessHub.tsx`
   - Corrects UI copy: funding approval alone does not unlock WhatsApp; access follows admission.

## Workstream 1 — Payment and proof RPC tracing

### Confirmed
- `program-payment` resolves the completed application from its session token server-side.
- Signed proof uploads are issued under `<submission UUID>/<random UUID>.<extension>`.
- The private `payment-proofs` bucket has an 8 MB limit and JPEG/PNG/WebP MIME allowlist.
- Admin-only read policy exists for payment proof objects.
- `submit_manual_program_payment_with_proof` is executable by anon/authenticated/service_role in the existing migration, so its server-side validation is security-critical.
- Before this review, the RPC preserved `paid` status while allowing the applicant to replace the manual reference and proof path. That could change the evidence attached to a verified payment without changing its paid status.
- The new migration rejects that replacement and locks the existing row. The Edge Function pre-check improves UX but is not relied upon for race safety.

### Still requires verification in Supabase
- Confirm deployed grants and policies match the migration history.
- Confirm the Edge Function deployment is using the branch code.
- Inspect actual bucket policies after all migrations, not only the original bucket migration.
- Check orphaned uploaded objects when the final SQL submission fails; consider scheduled cleanup.

## Workstream 2 — Programme-entitlement tracing

### Confirmed controls
- `program_application_access_allowed(submission_id)` preserves legacy submissions with no admission row and permits new submissions only when admitted.
- `getCurrentGoalEnrollment` checks that helper before returning a current GOALS enrollment to the My Goals, Journey, and Progress pages.
- The Paystack verification response withholds WhatsApp URL unless there is no admission row (legacy) or status is admitted.
- The payment-state RPC now applies the same admission gate to WhatsApp URL.
- The participant referral dashboard returns an admission-pending response before exposing participant referral code, metrics, earnings, or WhatsApp details.
- The independent promoter system uses `program_referral_promoters` and is not changed by the participant referral-code admission migration.
- Certificate issuance now requires admission for submissions in the new workflow; legacy submissions remain grandfathered.
- The GOALS admission trigger has been scoped to GOALS cohorts only, so other programme forms are not accidentally gated.

### Remaining entitlement risks
- `ProtectedRoute` checks authentication, not admission. It is not an entitlement boundary.
- The enrollment creation/sponsorship functions can still set an enrollment to active when funding is approved. This is acceptable only if every programme-specific data/API path independently enforces admission.
- A full database-wide inventory of every RPC, view, storage policy, and Edge Function that returns programme content or WhatsApp destinations remains necessary before claiming complete entitlement isolation.
- The current client helper is used by selected goal pages; it does not by itself prove every page or server-side operation is gated.

## Workstream 3 — Database admission-gate verification

### Reviewed migration chain
- `20261121120000_applicant_portal_admissions.sql`
- `20261121150000_application_funding_admission_transition.sql`
- `20261121180000_applicant_referral_codes_after_admission.sql`
- `20261121200000_gate_whatsapp_and_certificate_until_admission.sql`
- `20261121210000_prevent_replacing_verified_payment_proof.sql`
- `20261121220000_scope_admissions_to_goals_forms.sql`

### Confirmed intended behavior
- New GOALS applications get an `awaiting_funding` row.
- Payment or approved sponsorship moves the row to `awaiting_admission`; funding is not admission.
- An admin decision is required before new programme access.
- Existing rows are not backfilled, bulk-updated, or re-admitted.
- Historical submissions without admission rows remain grandfathered.
- Auto-approved sponsorship remains a funding decision and does not itself set the admission row to admitted.
- Applicant referral code generation happens on admission; existing code rows are retained.
- Promoter code attribution and payout paths are not altered.

### Important deployment-order note
Apply the migration files in timestamp order. The final GOALS-only trigger-scope migration must be applied after the original admissions migration, or the broad original trigger will remain active until the final migration is applied.

## Workstream 4 — Admin and applicant-token security

### Confirmed
- `/admin/applications` is wrapped in `AdminRoute`.
- The admission-decision and portal-token creation RPCs independently check `has_role(auth.uid(), 'admin')`; route protection is not the only control.
- Token creation uses 32 random bytes; only the SHA-256 hash is stored.
- Reissuing a link revokes previous active tokens for that submission.
- The resolver checks token hash, revocation and expiry, and the Edge Function rate-limits by IP and token hash.
- Resolver responses use `Cache-Control: no-store`.

### Session-token escape — implementation committed, verification pending
The original resolver returned the underlying `program_form_sessions.session_token` to the browser. This was a revocation bypass because the applicant could continue using legacy session-token RPCs after the portal link was rotated.

The branch now changes the design as follows:
- The applicant portal resolver strips `sessionToken` from its browser response.
- Payment-state and referral-code lookups run through the `applicant-portal` Edge Function; the session token stays server-side.
- Payment initialization and proof upload/submission now require the revocable portal bearer token. The Edge Function resolves its hash and expiry/revocation state server-side before using the session token.
- Direct `sessionToken` input has been removed from the payment Edge Function request schema.
- Payment responses use `Cache-Control: no-store`; portal-token payment actions are rate-limited.

This closes the identified browser session-token escape in the code path, but **must still be tested** against deployed function versions and SQL grants. A previously exposed session token remains a valid credential for any legacy RPCs that still accept it; revoke/restrict those RPC grants or rotate the underlying form session token as part of production rollout if the old token may already have been exposed.

### Token lifecycle
The user confirmed a **180-day** applicant portal lifetime. The database token column already defaults to `now() + interval '180 days'`; no duration change is required. The admin UI now displays the expiry date in the link-created confirmation.

## Workstream 5 — Consolidated SQL/release review

### Proposed migration order
1. `20261121120000_applicant_portal_admissions.sql`
2. `20261121150000_application_funding_admission_transition.sql`
3. `20261121180000_applicant_referral_codes_after_admission.sql`
4. `20261121200000_gate_whatsapp_and_certificate_until_admission.sql`
5. `20261121210000_prevent_replacing_verified_payment_proof.sql`
6. `20261121220000_scope_admissions_to_goals_forms.sql`
7. `20261121230000_enforce_goals_scope_for_admission_admin_rpcs.sql`

### Pre-production checks still required
- Verify the portal-token/session-token boundary against deployed Edge Function versions and database grants before relying on portal-link revocation. The branch code strips the underlying session token from browser responses, but production verification is still outstanding.
- Verify all remaining programme-content and WhatsApp access paths at the database/API layer.
- Run SQL migrations against a non-production Supabase environment first.
- Run SQL checks for trigger scope, RLS, grants, function definitions, and existing data preservation.
- Run frontend typecheck, lint, production build, and browser tests for applicant submission, payment proof, Paystack, sponsorship, admission, referral code visibility, WhatsApp visibility, certificate issuance, and promoter referrals.
- Verify a legacy participant and an independent promoter retain their existing benefits.
- Verify a non-GOALS form submission does not create an admission row.
- Verify new GOALS applications cannot access programme entitlements before admission.
- Verify no existing enrollment/payment/sponsorship/certificate/referral records are mass-updated.

## Current status
- Branch-only changes committed; no SQL applied, no deployment, no merge.
- Automated tests/build have not been run in this review.
- The 180-day expiry is confirmed and displayed in the admin link-created confirmation. The session-token boundary is implemented in branch code but remains a release blocker until verified against deployed functions and live SQL grants.

### GOALS-only administrative enforcement (2026-11-21)
- The Applications & Admissions admin query now restricts submissions to forms whose cohort has `program_key = 'goals'`, so legacy admission rows created by the earlier broad trigger cannot appear in this workspace.
- Added `20261121230000_enforce_goals_scope_for_admission_admin_rpcs.sql` to enforce the same GOALS cohort check inside both `admin_set_program_application_admission` and `admin_create_applicant_portal_token`. This protects against direct RPC calls and does not modify other programme records.
- This migration is branch-only and has not been applied. Verify the `program_forms.cohort_id` / `program_cohorts.program_key` relationship against the live schema before applying.

### Paystack verification binding and public-form payment path (2026-11-21)
- `program-payment` now requires a valid applicant portal token for the `verify` action and resolves the token to its underlying application session server-side.
- Payment verification now queries the provider reference together with the submission ID resolved from that portal token. A valid reference belonging to a different applicant is rejected before any payment status update or WhatsApp URL response.
- The public form now passes the applicant portal token to Paystack initialization and verification, includes it in the Paystack return URL, and uses the applicant-portal/payment Edge Function for new portal-based payment-state and manual-proof actions. The old session-token payment-state lookup remains only as a compatibility fallback for existing pre-portal sessions; payment mutations require the portal token.
- No portal token is returned by the payment function. The token remains a bearer credential and must not be logged or exposed to third parties.
- These code changes are branch-only. Live Edge Function deployment, database grants, and full Paystack callback testing remain outstanding.

## Work completed in the four follow-up areas (2026-11-21)

### 1. Payment-proof storage verification
- `program-payment` now requires the declared file size when requesting a signed upload URL and enforces the private bucket's 20 KB–8 MB range server-side.
- Before recording proof, the Edge Function resolves the portal token to the applicant submission, requires an object path under that exact submission folder with a UUID filename and approved extension, downloads the object from the private bucket, checks actual size and MIME metadata, and validates JPEG/PNG/WebP file signatures.
- The database proof RPC also locks the existing payment row and refuses to replace evidence after a payment is marked paid.
- The existing bucket remains private, capped at 8 MB, and restricted to JPEG/PNG/WebP. Admin-only read policy is preserved.
- Orphaned uploads can still occur if upload succeeds but proof submission fails. A scheduled cleanup job is a future operational improvement, not implemented here.

### 2. Legacy session-token RPC containment
- Added `20261121250000_scope_legacy_session_rpcs_to_portal.sql`.
- For submissions that have a row in `program_application_admissions` (the new GOALS-only workflow), direct anon/authenticated calls using the underlying session UUID are blocked for payment-state lookup, manual proof submission, legacy manual payment submission, and participant referral-code lookup.
- The protected applicant-portal and program-payment Edge Functions continue to call these functions server-side with the service-role key after resolving the revocable portal bearer token.
- Legacy submissions without admission rows and other programme form sessions retain their prior RPC behavior. This is intentionally scoped so the shared form/payment system is not globally broken.
- Independent promoter codes, referral attribution, earnings and payouts remain untouched.

### 3. Programme-entitlement coverage
- Added `20261121240000_gate_accountability_until_admission.sql`.
- `join_current_accountability_lab`, `assign_current_user_to_accountability_group`, and `current_user_accountability_chat` now check `program_application_access_allowed` before allowing new applicants into Accountability Lab or its group chat.

- The Accountability Lab migration also removes any pre-existing group-chat membership for applicants whose new admission status is still pending/rejected, and adds a database trigger preventing any writer (including admin bulk assignment) from activating a new GOALS applicant's accountability membership before admission. Legacy membership rows without an admission record are preserved.
- The existing grandfathering helper still permits historical submissions without an admission row.
- WhatsApp links remain withheld from new applicants until admitted; certificate issuance already has the admission check.
- UI copy in the admin payment panel now clarifies that funding verification does not itself grant WhatsApp access.
- This review covers the known applicant-facing entitlement surfaces in the current codebase. Live database policies, other integrations and production Edge Function versions still require verification.

### 4. CI/build validation
- Updated `.github/workflows/ci.yml` so pushes to `feature/applicant-portal-admissions` run ESLint and the production Vite build, in addition to the existing main-branch/PR workflow.
- `package.json` has no automated test script; the configured validation commands are `npm run lint` and `npm run build`.
- The GitHub connector cannot execute a local build in this environment, and the runner result must be checked from GitHub Actions after the branch push. No test/build result is claimed in this review.

## Updated rollout blockers
- Apply the migrations in timestamp order only after confirming live schema compatibility; none has been applied from this session.
- Verify the current deployed Edge Function code and `verify_jwt = false` settings are consistent with the portal-token enforcement.
- Verify actual database function grants and storage policies in Supabase.
- Complete an end-to-end test with a new GOALS application: portal link, manual proof upload, Paystack initialize/return/verify, funding approval, admission decision, referral-code reveal, Accountability Lab access, WhatsApp link, and certificate issuance.
- Test that rejected/pending applicants cannot access those entitlements, and that legacy participants and independent promoters continue to work.
- Check GitHub Actions lint/build result before release.
