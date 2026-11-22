# DYP GOALS Applicant Admissions — Pre-production and Release Runbook

## Release boundary

- Target branch: `feature/applicant-portal-admissions`
- Target database: Supabase project `oegmeazgcmmsucvikbka`
- The nine admissions migrations are not yet applied to production.
- This runbook does not authorize production SQL execution or deployment by itself.
- Do not run the draft admissions SQL from the separate main-branch commit. The supported implementation for this release is the nine timestamped migrations listed below.
- Do not merge until the PR build is green and the deployment trigger for the connected Lovable/Vercel project is understood. A merge that automatically deploys the new frontend before its database/functions are ready would break the payment flow.

## Findings corrected during this review

1. Rebuilt `20261121120000_applicant_portal_admissions.sql`: the portal-token RPC section contained a truncated token-hash condition and repeated resolver fragments. The migration now has one complete token-creation function and one resolver, with GOALS cohort validation and service-role-only resolver execution.
2. Rebuilt `20261121230000_enforce_goals_scope_for_admission_admin_rpcs.sql`: the token-hash validation was truncated and followed by duplicate SQL. The migration now contains two complete functions and balanced dollar-quoted bodies.
3. Preserved NULL MIME-type rejection in the final legacy-session RPC replacement (`20261121250000`). This migration replaces the proof RPC from the earlier proof-hardening migration, so the NULL check must exist in the final replacement too.
4. Made admission funding validation apply to the `admitted` decision only. An administrator can reject an unfunded application with a reason; a positive admission still requires verified payment or approved sponsorship.
5. Made the referral-code-on-admission trigger branch safely on INSERT versus UPDATE before accessing OLD row values.
6. Preserved the shared referral-answer trigger for non-GOALS programmes and legacy submissions; only new GOALS submissions with a non-admitted admission row are prevented from receiving a referral code.
7. Added a separate database trigger on `chat_group_members`. That table has its own admin/group-admin insert policy, so guarding only `program_accountability_memberships` was insufficient to stop a direct chat-membership insert from bypassing the admission rule. The added trigger blocks new, non-admitted GOALS participants while preserving admitted/legacy users.

## Migration sequence

Run in timestamp order on an isolated staging Supabase project first:

1. `20261121120000_applicant_portal_admissions.sql`
2. `20261121150000_application_funding_admission_transition.sql`
3. `20261121180000_applicant_referral_codes_after_admission.sql`
4. `20261121200000_gate_whatsapp_and_certificate_until_admission.sql`
5. `20261121210000_prevent_replacing_verified_payment_proof.sql`
6. `20261121220000_scope_admissions_to_goals_forms.sql`
7. `20261121230000_enforce_goals_scope_for_admission_admin_rpcs.sql`

Then run every SELECT in `APPLICANT_ADMISSIONS_PREDEPLOY_CHECKS.sql`. Review the GOALS-only trigger result, RLS/grants, function guards, and the Accountability Lab preview. Record enrollment totals before proceeding.

Only after that review, apply:

8. `20261121240000_gate_accountability_until_admission.sql`
9. `20261121250000_scope_legacy_session_rpcs_to_portal.sql`

Re-run the read-only checks after migrations 8 and 9. Compare enrollment totals and the exact membership/chat-membership cleanup counts against the pre-migration report.

## Why migrations 8 and 9 are staged last

- Migration 8 deletes matching chat-group membership rows and marks matching Accountability Lab memberships as removed for new admission rows that are not admitted. The preflight SQL identifies the affected rows before the migration is executed. Legacy participants without an admission row are outside this cleanup.
- Migration 9 blocks direct browser use of legacy session-token payment/referral RPCs for submissions in the new admissions table. The portal Edge Functions must be deployed and verified to resolve the revocable portal token server-side before this restriction is relied on.

## Staging functional test matrix

Use test-only applicants and payment-provider test credentials. Do not use real applicant data or real payment credentials.

1. Submit a new application through a GOALS cohort form. Confirm one `awaiting_funding` admission row and a portal link with 180-day expiry.
2. Submit a non-GOALS programme form. Confirm it creates no admission row and its existing workflow remains unchanged.
3. Open a valid portal link; verify the underlying form session token is never returned to the browser. Test invalid, expired, and revoked links.
4. Verify the applicant can view funding instructions but cannot see a referral code, WhatsApp URL, certificate, or Accountability Lab access before admission.
5. Submit manual proof using valid JPEG, PNG, and WebP files. Reject files below 20 KB, above 8 MB, mismatched extension/MIME/signature, and null/unsupported MIME values.
6. Verify a paid payment cannot have its proof/reference replaced, including concurrent attempts.
7. Exercise Paystack initialize, return, and verify. Confirm the reference is bound to the same applicant, amount, and currency. Use Paystack test mode.
8. Verify sponsorship pending, approved, rejected, revoked, and auto-approved campaign paths. Approval is funding only, not admission.
9. Verify funding moves the admission state to `awaiting_admission`; it does not grant programme access.
10. Verify an admin can reject with a reason before or after funding; admission without verified funding is rejected; admission after verified funding succeeds.
11. On admission, verify referral code creation/reveal, programme access, Accountability Lab membership/chat, WhatsApp visibility, and certificate eligibility follow the intended rules.
12. Verify pending/rejected applicants cannot access those entitlements.
13. Verify independent promoter codes, attribution, earnings, and payouts are unchanged.
14. Verify legacy active participants retain their existing access, referrals, certificates, WhatsApp, and Accountability Lab membership.
15. Verify rotating/revoking a portal link invalidates the old link and the old session-token RPC path cannot bypass revocation for new GOALS admissions.
16. Verify admin workspace lists only GOALS submissions and all admission/token RPCs reject other programme submissions.

## Merge and production rollout

1. Open a draft PR from the feature branch to `main`; inspect GitHub's mergeability result and run CI.
2. Review the single newer main-branch commit before merging. It is labelled as a draft admissions SQL change and must not be applied alongside this nine-migration design.
3. Confirm whether merging `main` triggers automatic Lovable/Vercel deployment. If it does, disable/pause that deployment path for the release window or use an approved deployment hold so code is not published before database and Edge Function readiness.
4. Run the complete migration and functional matrix in staging.
5. Take/verify a Supabase backup and record pre-release counts. Schedule a short maintenance window because the final migration restricts legacy payment/referral session RPCs for new GOALS applications.
6. Merge the PR only after the PR checks are green and the deployment sequence is controlled.
7. During the maintenance window, apply production migrations in the same staged sequence, pausing after migration 7 for the SELECT-only impact review. Apply migration 8 only after its affected-row report is approved; then apply migration 9.
8. Deploy the updated `applicant-portal` and `program-payment` Edge Functions and the frontend commit. Ensure deployed function versions match the branch and the functions have the required secrets/configuration. Do not expose service-role credentials to the browser.
9. Run production smoke tests with designated test submissions and Paystack test mode where supported. Verify admin access, portal link rotation, payment proof, funding/admission separation, and legacy participant access.
10. Monitor Supabase function logs, database errors, payment status, and applicant support reports. Keep the previous frontend deployment available for rollback, but do not roll back only the frontend after migration 9 without a compatibility plan for the restricted RPCs.

## Rollback cautions

- Do not drop the new tables or reverse the admission trigger as a casual rollback; they may already contain real applications and token audit history.
- A frontend rollback alone will not restore the old public session-token payment flow after migration 9.
- If a release must be rolled back, use a reviewed forward-fix or a specific compatibility migration that preserves the security boundary and all applicant records.
- Do not run destructive SQL against production without a fresh, reviewed impact query and backup.
