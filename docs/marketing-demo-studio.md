# GOALS Marketing Demo Studio — safe preview

This PR adds an **illustrative synthetic demo**, not a production feature. Route: `/marketing-demo`.

## Isolation
- This route renders fixture data held in React memory and has **no imports of Supabase, Lovable auth, AI edge functions, or chat messaging**.
- It does not create profiles, goals, enrollments, referrals, calendar events or chats.
- Fictional sample coach and member conversations are labeled.
- It avoids showing real member data or secrets.
- App.tsx only mounts the route if `VITE_ENABLE_MARKETING_DEMO=true`; default is off.

## IMPORTANT deployment boundary
The flag **is not an authorization boundary**. Do NOT enable it on the public production host; otherwise any visitor who knows the URL could view the synthetic demo. Use a separate restricted preview deployment protected by access controls enforced at hosting/proxy layer. Never substitute query parameters, front-end passwords or hidden links for access control. When enabling on a restricted preview, verify that shared parent layout/components do not issue any production network calls. The demo now loads through a dedicated dynamic import in src/main.tsx, without importing the production App module or shared providers into the demo runtime path. Runtime network inspection is still required to confirm third-party startup scripts make no unintended requests.

## How to review
1. Deploy this branch to a restricted preview environment (not production) with `VITE_ENABLE_MARKETING_DEMO=true`.
2. Inspect browser Network tab: expect **zero** requests to production Supabase, Lovable auth, production API endpoints or analytics.
3. Verify the five scenes, scene transitions, reset, and clean recording view.
4. Repeat tests on 390x844 and 1080x1920 viewport sizes.
5. Validate the root-level route prevents shared component/provider mounting and automatic authentication checks. Examine index.html and startup scripts for global network requests.
6. Verify current production app and user flows remain unchanged.
7. Keep the PR as draft until isolation and full QA are proven.

## Known scope
- Scripted demo sequences demonstrate workflows, *not a live AI generation*.
- The sample schedule is an in-app illustration, not synced to Google Calendar.
- No production release or real account interaction authorized.

## Verification limitations (2026-10-22)
- GitHub PR CI uses `npm run build`, but no successful check has been confirmed yet.
- The local execution container cannot resolve github.com for git checkout. Browser testing and install/build on the full repo have not been performed.
- Manual code inspection supports route-module isolation only; confirm with a network HAR in a restricted preview.
- VITE_ENABLE_MARKETING_DEMO must remain false on the public production host.
