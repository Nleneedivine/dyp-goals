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

### Critical unresolved issue — session-token escape
The resolver currently returns the original `program_form_sessions.session_token` to the browser. The portal then uses it directly for payment-state, proof-submission, and referral-code RPCs. This means a user who has already obtained that session token may continue using those session-token RPCs after the admin revokes/reissues the portal link. Revocation of the portal token does not revoke the exposed session token.

**Do not describe portal-link revocation as complete until this is fixed.** Recommended architecture:
- Never return the underlying form session token to the browser.
- Have the applicant-portal Edge Function return payment state and (only after admission) the referral code while retaining the session token server-side.
- Have payment actions accept the portal bearer token, validate its hash/revocation/expiry on every request, and resolve the session token server-side.
- Keep Paystack verification bound to the payment record/reference and validate amount/currency/reference as it does now.
- Add tests proving a reissued/revoked portal token cannot perform any later payment or referral action.

### Token lifecycle decision still needed
The database default is 180 days. That duration was not explicitly confirmed by the user. Decide the intended lifetime before applying the admissions SQL. The admin UI also does not currently surface the returned expiry date.

## Workstream 5 — Consolidated SQL/release review

### Proposed migration order
1. `20261121120000_applicant_portal_admissions.sql`
2. `20261121150000_application_funding_admission_transition.sql`
3. `20261121180000_applicant_referral_codes_after_admission.sql`
4. `20261121200000_gate_whatsapp_and_certificate_until_admission.sql`
5. `20261121210000_prevent_replacing_verified_payment_proof.sql`
6. `20261121220000_scope_admissions_to_goals_forms.sql`

### Pre-production checks still required
- Confirm the intended portal-token expiry duration.
- Fix the session-token escape before relying on portal-link revocation.
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
- The session-token escape and 180-day expiry decision remain release blockers.
