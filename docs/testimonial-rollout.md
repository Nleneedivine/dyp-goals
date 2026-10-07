# Participant stories

Participants share stories at `/testimonials/submit`; administrators review at
`/admin/testimonials`. The Admin dashboard links to the review queue in both UI modes.
Public stories appear on `/testimonials` and, when selected by an admin, Home and
the GOALS 2026 registration form. `FeaturedTestimonials` also accepts `placement="campaign"`
for future campaign landing sections; no separate campaign page currently exists.

## Rollout

1. Apply `supabase/migrations/20261007180000_participant_testimonials.sql` through the
   existing Lovable Cloud database migration/SQL workflow. No Edge Function changes
   are required. Repository sync alone does not install this migration.
2. Publish the frontend using the project's existing hosting workflow.
3. With two participant accounts and an admin, submit a private story, verify that
   it is absent publicly, verify and approve it with a note, and select placements.
   Test full name, first name plus initial, first name, and hidden portrait.
4. Withdraw consent from the participant's submission page. Confirm the story is
   absent from public feeds. Already issued portrait URLs expire after one minute.

Every published story requires permission, verification and a private verification
note. There are no seeded testimonials or example participant claims. Moderators
cannot overwrite participant words, identity settings or consent. Rejected stories
can be reviewed again; withdrawn stories require a fresh participant submission.

The portrait bucket is private. Uploads are restricted to the signed-in account's
folder and to JPG/PNG/WebP images under 2 MB. Public reads require approval, consent,
a permitted placement and the participant's photo preference. Moderators and owners
can review private portraits. Anonymous visitors receive only a projected display
name and story, never account IDs, full hidden names or verification notes.

## Checks

Run `npm run build`, `npx tsc --noEmit -p tsconfig.app.json`, and targeted ESLint for
new testimonial files. The repository's pre-existing npm lockfile is out of sync;
`npm install --no-package-lock` can prepare dependencies without changing it.

The security test uses an isolated PGlite PostgreSQL database with mock auth/storage
schemas. It models Supabase's default grants and checks private reads, ownership,
consent, approval, verification notes, placement filters, portrait access and withdrawal:

```sh
npm install --prefix /tmp/dyp-testimonial-tests @electric-sql/pglite --no-audit --no-fund
PGLITE_MODULE_PATH=/tmp/dyp-testimonial-tests/node_modules/@electric-sql/pglite/dist/index.js node tests/testimonials-security.mjs
```

These local checks do not replace a smoke test against the deployed Lovable Cloud
schema and storage APIs.
