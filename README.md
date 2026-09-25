# DYP GOALS

DYP GOALS is a purpose-to-action platform by Discover Your Purpose (DYP). It combines the DYP GOALS Master Class with AI-assisted goal review, planning, daily action, mentorship and accountability.

## 2026 Master Class

- **Dates:** 27–29 November 2026
- **Format:** Virtual
- **Session time:** 8:00 PM–9:30 PM WAT
- **Original price:** NGN 35,000
- **Current discounted price:** NGN 5,000
- **Registration:** \`/apply/goals-masterclass-2026\`
- **Next pathway:** 3-month Accountability Lab series beginning January 2027; exact start date and structure will be configured later.

Event dates, pricing, benefits and registration linkage are stored in the \`program_events\` table rather than hardcoded into the public pages.

## Product journey

The intended participant journey is:

**Vision → Goals → AI Review → Refined Goals → Time Plan → Daily Action → Accountability → Progress**

The public website handles program discovery and registration. The authenticated application provides the participant experience.

## Main features

- Public program landing page and dynamic event countdown
- Data-driven event schedule and pricing
- Public program registration forms
- Admin form builder, publishing, analytics and QR sharing
- AI goal analysis and refinement
- AI-generated yearly, monthly, weekly and daily plans
- To-do and reminder features
- Mentorship and accountability features
- Supabase authentication, database, RLS and Edge Functions

## Security

Sensitive AI and email functions require authenticated requests where appropriate. Public endpoints are rate limited. AI responses are validated against application schemas before being accepted.

Never commit real environment files or server secrets. Use \`.env.example\` as the local template. Supabase publishable/anon configuration may be exposed to the browser, but service-role keys, AI keys, email provider keys and other server secrets must remain in Supabase project secrets.

## Development

\`\`\`sh
npm install
npm run dev
\`\`\`

The Supabase migrations in \`supabase/migrations\` define the database and event/registration configuration. Apply migrations through the Supabase workflow used by the project before expecting the new event or registration form to appear.

## Architecture

- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- React Router
- Supabase Auth / Postgres / Storage / Edge Functions
- Lovable AI gateway for AI-assisted features

## Deployment note

This repository is connected to Lovable. Changes should be reviewed before merging to \`main\`, then synced/deployed through the project's normal Lovable/Supabase workflow.
