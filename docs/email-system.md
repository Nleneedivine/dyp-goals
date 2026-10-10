# DYP GOALS automatic emails

## Current deployment prerequisites

The prior provider rejects participant sends with HTTP403 because `onboarding@resend.dev` is a testing sender. A Resend account connection or new API key alone does not lift this restriction. An owned, verified domain is required. Do not invent a sender on someone else's domain.

Use Resend for this project. Create a dedicated **sending-only** key named `DYP GOALS production`, scoped to the verified sending domain when available. Save its one-time value only in Lovable Cloud backend Secrets as `RESEND_DIRECT_API_KEY`; never put it in a VITE variable, frontend code, git, docs or chat. Set `EMAIL_FROM` to the verified address, for example `DYP GOALS <hello@notify.your-owned-domain.com>`. `RESEND_API_KEY_1` remains the existing Lovable gateway connection fallback. Direct sending does not require LOVABLE_API_KEY.

Deploy `send-execution-notifications`, `send-contact-email`, and `email-admin` after applying both 20261010 email migrations. Check that the worker records `email-system-v2` in `email_runtime_status` on its next scheduled invocation. The Admin page will not enable test/retry controls until a recent updated-worker heartbeat and sender/provider configuration are present. Configured sender does not independently prove DNS verification.

No real emails, failed-message retries or historical backfill were initiated during development. The existing 15-minute schedule remains unchanged. Frontend publication does not prove edge-function deployment.

Lovable also offers managed authentication and app emails at **More → Cloud → Emails**, requiring a paid workspace and verified owned domain. This queue currently uses Resend; managed email transport is not integrated. Cloud Auth confirmation/reset messages are separate from this app notification queue and have not been reconfigured.

## Flows

- Welcome on account confirmation, with a profile-created fallback for OAuth ordering.
- Registration confirmation when an enrollment is linked to the permanent account. Registration before account activation is not emailed by this account-based queue.
- Story submission acknowledgement and first approval notice.
- Existing payment, certificate, referral, accountability, schedule and execution reminder flows remain connected.

New flows create in-app notices too, respect program-email preferences, and use unique event keys. No historical records are backfilled. The queue rechecks preferences and account confirmation before sending; direct reminders recheck current preferences as well.

## Operations

Admin → Email system (`/admin/email`) shows failed/pending/processing/provider-accepted counts, recent errors, cron status and worker heartbeat. Provider acceptance is not confirmed inbox delivery. Delivery/bounce webhooks are not implemented in this increment.

Individual failed-message retry is admin-only and rate limited. Admin tests derive the destination from the verified admin JWT and allow three requests per hour; callers cannot choose other recipients. The worker accepts only the real service key or configured cron secret, never a decoded JWT role. Read-only dry_run reports configuration and sends/claims nothing.

Claims use SKIP LOCKED and a lease timestamp. Queue retries use bounded backoff, stop after five attempts, and require review for a lease older than 22 hours. Resend idempotency keys are stable per queued message or scheduled occurrence; delivery is not guaranteed exactly once after the provider's retention window. A stale/ambiguous job requires provider-log review before manual retry.

## Verification

`PGLITE_MODULE_PATH=/path/to/@electric-sql/pglite/dist/index.js node tests/email-system.mjs`

The test uses isolated PostgreSQL and mocked HTTP, never production recipients. Covers worker credentials, sender restrictions, preference changes, safe links, provider acceptance/idempotency, atomic claims, retry bounds, admin access and confirmed OAuth welcome ordering.
