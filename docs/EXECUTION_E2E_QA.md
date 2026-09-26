# DYP GOALS End-to-End Execution QA

This checklist validates the integrated product as one system rather than a collection of pages.

## Test principles

- Use realistic participant data.
- Do not let AI decide which personal, spiritual, academic, career, health, relationship, or financial goal matters more.
- Deterministic capacity arithmetic is the source of truth for overload.
- AI may surface options, tensions, dependencies, sequencing questions, safeguards, and possible adjustments.
- A user must review AI-generated workload and execution plans before they enter the portfolio.
- Fixed commitments and unrelated calendar context stay private from mentors.
- Every executable task should retain lineage back to the goal it serves.
- A failed or missed task must remain visible until the user makes a deliberate decision.

## Scenario A — Habit / maintenance goal

Use a goal similar to:

Develop a consistent Bible study and prayer life by December 2027.

Expected goal context:
- at least 5 days/week
- normal session 30–45 minutes
- user-confirmed weekly commitment
- shorter 10–15 minute fallback routine on busy days
- weekly and monthly reflection
- saved safeguards and resources

Validate:
- [ ] Goal refinement preserves "5 days/week" rather than intensifying it to "daily".
- [ ] AI-estimated effort is clearly labelled until the user confirms or edits it.
- [ ] User can edit the weekly effort before confirmation.
- [ ] Milestones use the stated frequency and review rhythm without subjective spiritual scoring.
- [ ] Coaching context preserves safeguards, obstacles, resources, review rhythm, and constraints.
- [ ] Capacity checker uses the confirmed effort, not the original AI estimate.
- [ ] Week draft creates repeated practice tasks consistent with the saved frequency.
- [ ] Week draft does not exceed the goal's confirmed weekly workload.
- [ ] Replanning can surface the saved shorter fallback routine after a miss.
- [ ] Fallback remains an option; it is not silently applied.
- [ ] Weekly and monthly reviews describe represented execution without claiming spiritual growth was objectively measured.

## Scenario B — Project / outcome goal

Use a goal similar to:

Launch NovaBridge Digital and secure the first paying customer.

Expected context:
- branding/social/content services
- provisional business name
- unresolved pricing validation
- target audience
- first paying customer as an outcome
- milestones for setup, portfolio, pricing validation, promotion, outreach, and first sale

Validate:
- [ ] Unresolved pricing is represented as work to validate, not as a settled fact.
- [ ] AI does not invent a user commitment for weekly hours.
- [ ] Workload phases vary only if the plan genuinely has changing intensity.
- [ ] Milestones fall inside the saved goal window.
- [ ] Week draft works backward from upcoming milestones.
- [ ] Research/decision tasks are created for unresolved decisions.
- [ ] Completing tasks does not automatically mark the outcome achieved unless the relevant milestone/status is explicitly updated.

## Scenario C — Multi-goal portfolio

Create at least three overlapping goals from different life areas.

Example:
- spiritual habit: 4h/week
- academic/career project: 8h/week
- business project: 6h/week

Set normal goal-work capacity to 15h/week.

Validate:
- [ ] Capacity checker shows 18h demand vs 15h capacity for the overlapping period.
- [ ] No AI week draft is allowed while the confirmed portfolio itself is over capacity.
- [ ] System does not choose which goal should be reduced.
- [ ] User can change capacity, workload, status, dates, or priority deliberately.
- [ ] Once demand fits, week drafting becomes available.
- [ ] Date-specific workload phases change demand in the correct date windows.
- [ ] Temporary capacity overrides affect only their own date ranges.
- [ ] Peak demand and tightest margin match deterministic calculations.

## Scenario D — Explicit dependencies

Create a dependency such as:
Finish customer research before finalizing service packages.

Validate:
- [ ] User can save the dependency only between two different goals.
- [ ] Duplicate dependency is rejected.
- [ ] Circular dependency is rejected.
- [ ] Planner surfaces the dependency as context.
- [ ] Portfolio AI may discuss the dependency but cannot silently postpone either goal.
- [ ] Week drafting uses the confirmed dependency as sequencing context.
- [ ] Removing the dependency removes that planning signal.

## Scenario E — One calendar and fixed commitments

Add sleep, classes/work, commute, ministry/family commitment, and one date-specific appointment.

Validate:
- [ ] Fixed commitments appear in Today.
- [ ] Overnight commitments are represented on both dates correctly.
- [ ] A manually timed goal task cannot overlap a protected commitment.
- [ ] Two timed goal tasks cannot overlap each other.
- [ ] Untimed tasks can remain as "any time".
- [ ] Free-window suggestions only use saved commitments and timed tasks.
- [ ] Fixed commitments are not exposed to mentors.

## Scenario F — Year → Month → Week → Today

Validate:
- [ ] Year shows goals, dated milestones, represented execution, and month drilldown.
- [ ] Month shows goals in focus, milestones, execution, capacity/demand signals, and week drilldown.
- [ ] Week shows confirmed portfolio demand, scheduled task effort, capacity, dependencies, weekly actions, and daily tasks.
- [ ] On mobile, /plan opens Today by default.
- [ ] On desktop, /plan opens Week by default.
- [ ] Mobile Week can be horizontally navigated without squeezing seven desktop columns into the viewport.
- [ ] Today shows scheduled/completed/remaining effort and fixed commitments.
- [ ] Every task displays enough lineage to answer "why am I doing this?"

## Scenario G — Missed work and adaptive replanning

Create a timed task for yesterday and leave it incomplete.

Validate:
- [ ] Task appears in the replanning queue.
- [ ] Quick choices can deliberately move it to Today, Tomorrow, or Next week.
- [ ] A move beyond the goal deadline is blocked.
- [ ] A move that overloads the destination week shows a warning rather than silently proceeding.
- [ ] AI replanning returns options, not a forced decision.
- [ ] AI can suggest split, reschedule, grounded fallback, or review-workload options.
- [ ] Split task effort stays approximately equal to the original task effort.
- [ ] Applying a split preserves goal/milestone lineage.
- [ ] Task execution history records the transition.

## Scenario H — Repeated under-execution

Complete less than 60% of represented planned effort for two reviewed weeks.

Validate:
- [ ] Progress surfaces a factual repeated-underexecution signal.
- [ ] System does not use moralizing labels for the user.
- [ ] System offers areas to review: capacity, workload, deadline, status/priority, or scheduling.
- [ ] System does not choose which goal to sacrifice.
- [ ] Saved weekly review blockers/adjustments are available to later adaptive planning.

## Scenario I — Accountability privacy

Participant opts into mentor goal/progress sharing and separately opts into monthly check-in sharing.

Validate:
- [ ] Mentor sees only explicitly shared execution context.
- [ ] Mentor cannot see capacity values.
- [ ] Mentor cannot see private fixed commitments.
- [ ] Turning sharing off removes mentor access.
- [ ] Monthly check-ins have a separate sharing control.
- [ ] Admin trends remain aggregate and do not expose task titles or private calendars.

## Scenario J — Monthly accountability check-in

At the end of a month:
- [ ] Current-month snapshot counts only work through today, not future scheduled work.
- [ ] Future-month check-ins cannot be saved.
- [ ] Snapshot records task counts, represented effort, and milestone counts.
- [ ] User can save wins, blockers, adjustments, and next-month focus.
- [ ] Re-saving updates the same month rather than creating duplicates.
- [ ] Mentor sees the check-in only when the participant opted in.

## Scenario K — Execution notifications

Enable email and configure a timezone.

Validate:
- [ ] Morning brief arrives only when enabled.
- [ ] Evening debrief arrives only when enabled.
- [ ] Weekly review reminder skips a week that already has a saved review.
- [ ] Milestone alerts respect the user's configured lead days.
- [ ] Monthly check-in reminder skips a month that already has a saved check-in.
- [ ] Delivery ledger prevents duplicate sends for the same notification/date.
- [ ] Email contains only goal execution context, not private fixed commitments.
- [ ] Email links to the correct app surface.
- [ ] "Manage email preferences" opens Profile.
- [ ] Disabling the master email switch stops all execution emails.
- [ ] Account email source matches Supabase Auth, including pending email-change confirmation behavior.
- [ ] Production sender uses a verified domain before broad external delivery.

## Scenario L — Guided journey

Fresh participant:
- [ ] Login/signup lands on Journey.
- [ ] Journey points first to direction/vision when relevant.
- [ ] Journey progresses through goals → planning readiness → capacity → fixed commitments → first week → review.
- [ ] Existing users are not forced to recreate prior setup.
- [ ] Once the loop is established, Journey acts as an execution dashboard rather than a completed onboarding dead-end.

## Scenario M — Public site integrity

Validate:
- [ ] Event dates are 27–29 Nov 2026 from event data.
- [ ] Price shows original ₦35,000 and current ₦5,000 where event data is rendered.
- [ ] Countdown is derived from event start, not a hardcoded stale date.
- [ ] Public schedule uses only confirmed three-day themes and overall session time.
- [ ] No invented speakers, participant statistics, ratings, testimonials, or outcome claims are shown.
- [ ] Contact and testimonials routes are public.
- [ ] Registration route loads on mobile and desktop.

## Runtime deployment smoke test

After the batched Edge deployment:
1. [ ] clarify-goal returns valid structured clarification.
2. [ ] refine-goals returns valid structured refinement.
3. [ ] analyze-goal-portfolio returns advisory findings.
4. [ ] generate-week-plan returns a reviewable, capacity-safe draft.
5. [ ] Applying the reviewed draft creates weekly actions/tasks atomically.
6. [ ] replan-execution returns options for every queue task.
7. [ ] Split/fallback applications preserve lineage and workload safeguards.
8. [ ] send-execution-notifications rejects ordinary user invocation and accepts the secure scheduled invocation.
9. [ ] Scheduled notification job runs once and reports a sane checked/sent/skipped/failed summary.
10. [ ] No new 500s appear in Edge Function logs during the test pass.

## Release gate

Do not call the integrated execution system production-ready until:
- all required migrations are applied,
- all pending Edge Functions are deployed from the same synced main commit,
- the runtime smoke tests above pass,
- notification sender/domain behavior is verified,
- no privacy regression is found in mentor/admin views,
- and at least one realistic multi-goal participant journey completes end to end.
