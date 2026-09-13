# GOALS / DYP Platform Refresh

## Goal
Rebrand the existing platform around the supplied GOALS and DYP marks, make the current experience reliable across mobile, tablet, and desktop, and add a complete admin form-builder and analytics product.

## Implementation phases

### 1. Brand foundation and shared navigation
- Add both supplied logos through the project asset flow and create the square DYP favicon.
- Replace the current dark template palette with semantic deep-teal, ink-teal, mint, white, neutral, success, warning, and danger tokens.
- Update typography, buttons, focus states, surfaces, charts, header, footer, login, dashboard headers, empty states, and email branding.
- Use DYP for organization/account areas and GOALS for goal/program areas.

### 2. Responsive platform pass
- Rework shared navigation and page shells at mobile, tablet, and desktop breakpoints.
- Audit every existing page, form, dialog, dropdown, chart, and data view for overflow, readable hierarchy, 44px tap targets, and stable loading states.
- Convert dense admin tables to mobile card views while retaining desktop tables.
- Verify key authenticated and public flows at 390px, 768px, and 1280px.

### 3. Admin form builder
- Add an admin Forms area with create, edit, reorder, duplicate, publish, schedule, archive, delete, feature, share, QR, and embed actions.
- Support text, textarea, email, phone, number, date, dropdown, multi-select, checkbox, radio, file upload, rating, and section fields.
- Add per-field validation, helper text, required state, choices, and conditional visibility rules.
- Add form settings for branding, limits, deadlines, scheduling, and confirmation copy/email.
- Add Lovable AI drafting from a plain-language program description, while keeping every suggestion editable.

### 4. Public forms and secure collection
- Give each published form a unique no-login public URL and mobile-first branded experience.
- Add validated submission handling, response limits, open/close enforcement, confirmation feedback, optional email confirmation, and secure file uploads.
- Add featured forms to the existing home experience without turning it into a separate CMS.

### 5. Analytics and response management
- Capture privacy-conscious field interactions, first-input delay, completion time, field time, abandonment point, device category, and browser family.
- Build per-form analytics for conversion, drop-off, hesitation, fill rate, ignored fields, completion time, funnel, volume, and device/browser mix.
- Add plain-language interpretations, configurable warning thresholds, raw response viewing, and CSV export.
- Add an aggregate comparison view across forms.

## Technical details
- Store form definitions, versions, fields, options, conditional rules, submissions, answers, sessions, and events in Lovable Cloud with explicit grants and row-level policies.
- Public visitors may read published/open form definitions and create scoped sessions/events/submissions only; response data remains admin-only.
- Use server-side functions for AI drafting, publish/open-state enforcement, exports where needed, confirmation email, and abuse protection.
- Use `openai/gpt-6-astra` through Lovable AI for field drafting, streaming the request and surfacing gateway errors.
- Preserve all current goals, mentorship, chat, planning, and admin data and workflows.

## Validation
- Test creation → AI draft → edit/reorder → publish → public submission → confirmation → analytics → CSV export.
- Verify public permissions cannot expose submissions or unpublished forms.
- Confirm app builds cleanly and visually test representative pages at mobile, tablet, and desktop widths.
