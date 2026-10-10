import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isTrustedWorkerRequest, resolveSender, sendViaResend, renderEmail, emailAllowedByPrefs, nextRetryState, ProviderError, isPermanentProviderError } from "../_shared/emailCore.ts";
const SENDER = resolveSender(Deno.env.get("EMAIL_FROM"));

const DIRECT_API_KEY = Deno.env.get("RESEND_DIRECT_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_1") ?? Deno.env.get("RESEND_API_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://dyp-goals.lovable.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type NotificationType =
  | "morning_brief"
  | "evening_debrief"
  | "weekly_review"
  | "deadline_alert"
  | "program_session_24h"
  | "program_session_1h"
  | "accountability_meeting_24h"
  | "group_digest_daily"
  | "group_digest_weekly";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: weekdayMap[map.weekday] ?? 1,
  };
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function isDue(localHour: number, localMinute: number, configuredTime: string) {
  const current = localHour * 60 + localMinute;
  const target = timeToMinutes(configuredTime);
  const delta = current - target;
  return delta >= 0 && delta < 20;
}

function dateDiffDays(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00Z`).getTime();
  const to = new Date(`${toDate}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86400000);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function parseClockMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function programSessionDates(event: {
  starts_at: string;
  ends_at: string;
  session_start_time: string;
  session_end_time: string;
}) {
  const first = new Date(event.starts_at);
  const last = new Date(event.ends_at);
  const startMinutes = parseClockMinutes(event.session_start_time);
  const endMinutes = parseClockMinutes(event.session_end_time);
  let durationMinutes =
    startMinutes !== null && endMinutes !== null ? endMinutes - startMinutes : 90;
  if (durationMinutes <= 0) durationMinutes += 24 * 60;
  if (durationMinutes <= 0 || durationMinutes > 12 * 60) durationMinutes = 90;

  const count =
    Math.max(
      1,
      Math.round(
        (Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()) -
          Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate())) /
          86400000,
      ) + 1,
    );

  return Array.from({ length: count }, (_, index) => {
    const start = new Date(first.getTime() + index * 86400000);
    return {
      start,
      end: new Date(start.getTime() + durationMinutes * 60_000),
      day: index + 1,
    };
  });
}

function reminderDue(now: Date, eventStart: Date, targetMinutesBefore: number) {
  const minutesUntil = (eventStart.getTime() - now.getTime()) / 60_000;
  return minutesUntil <= targetMinutesBefore && minutesUntil > targetMinutesBefore - 25;
}

function nextRecurringOccurrence(
  firstStart: Date,
  recurrence: string,
  now: Date,
) {
  if (firstStart.getTime() >= now.getTime()) return firstStart;

  const next = new Date(firstStart);
  if (recurrence === "weekly" || recurrence === "biweekly") {
    const intervalDays = recurrence === "biweekly" ? 14 : 7;
    const elapsedDays = Math.floor((now.getTime() - firstStart.getTime()) / 86_400_000);
    const jumps = Math.floor(elapsedDays / intervalDays) + 1;
    next.setUTCDate(next.getUTCDate() + jumps * intervalDays);
    return next;
  }

  if (recurrence === "monthly") {
    while (next.getTime() < now.getTime()) {
      next.setUTCMonth(next.getUTCMonth() + 1);
    }
    return next;
  }

  return null;
}

async function sendEmail(to: string, subject: string, html: string, key: string) {
  const [category, userId, type] = key.split(":");
  if (category !== "queue") {
  const preferenceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const table = category === "execution" ? "execution_notification_settings" : "notification_preferences";
  const { data: preferences, error: preferencesError } = await preferenceClient.from(table).select("*").eq("user_id", userId).maybeSingle();
  if (preferencesError) throw preferencesError;
  if (category === "execution" ? !preferences?.email_enabled || preferences[type === "deadline_alert" ? "deadline_alerts_enabled" : `${type}_enabled`] === false : !emailAllowedByPrefs(type, preferences)) {
    throw new ProviderError(422, "Cancelled because email preferences changed");
  }
  }
  if (!SENDER) throw new Error("Verified sender (EMAIL_FROM) is not configured");
  return await sendViaResend({ directApiKey: DIRECT_API_KEY, lovableApiKey: LOVABLE_API_KEY, resendApiKey: RESEND_API_KEY, from: SENDER.from, to, subject, html, idempotencyKey: key });
}

function emailShell(title: string, body: string, ctaLabel: string, ctaPath: string) {
  return renderEmail({ appUrl: APP_URL, title, bodyHtml: body, ctaLabel, ctaPath });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!isTrustedWorkerRequest(req, SERVICE_ROLE_KEY, Deno.env.get("EXECUTION_NOTIFICATIONS_CRON_SECRET"))) {
      return new Response(JSON.stringify({ error: "Trusted service credential required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    const requestBody = await req.json().catch(() => ({}));
    if (requestBody.dry_run === true) {
      return new Response(JSON.stringify({ success: true, dry_run: true, worker_version: "email-system-v2", sender_configured: !!SENDER, provider_configured: !!DIRECT_API_KEY || (!!LOVABLE_API_KEY && !!RESEND_API_KEY), sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Supabase service configuration is missing");
    const runtimeClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { error: runtimeError } = await runtimeClient.from("email_runtime_status").upsert({ id: true, worker_version: "email-system-v2", last_checked_at: new Date().toISOString(), blocked_reason: !SENDER || (!DIRECT_API_KEY && (!LOVABLE_API_KEY || !RESEND_API_KEY)) ? "sender_or_provider_not_configured" : null });
    if (runtimeError) throw runtimeError;
    // Do not attempt (and burn retries on) sends until a verified-domain sender exists.
    if (!SENDER || (!DIRECT_API_KEY && (!LOVABLE_API_KEY || !RESEND_API_KEY))) {
      return new Response(JSON.stringify({ success: true, worker_version: "email-system-v2", blocked: "sender_or_provider_not_configured", sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error("Supabase service configuration is missing");
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: settings, error: settingsError } = await admin
      .from("execution_notification_settings")
      .select("*")
      .eq("email_enabled", true)
      .limit(500);

    if (settingsError) throw settingsError;

    const now = new Date();
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    const alreadySent = async (
      userId: string,
      type: NotificationType,
      referenceKey: string,
    ) => {
      const { data, error } = await admin
        .from("execution_notification_deliveries")
        .select("id")
        .eq("user_id", userId)
        .eq("notification_type", type)
        .eq("reference_key", referenceKey)
        .eq("status", "sent")
        .maybeSingle();

      if (error) throw error;
      return Boolean(data);
    };

    const recordDelivery = async (
      userId: string,
      type: NotificationType,
      referenceKey: string,
      status: "sent" | "failed",
      errorMessage = "",
    ) => {
      const { error } = await admin
        .from("execution_notification_deliveries")
        .upsert({
          user_id: userId,
          notification_type: type,
          reference_key: referenceKey,
          status,
          error_message: errorMessage.slice(0, 2000),
          delivered_at: new Date().toISOString(),
        }, { onConflict: "user_id,notification_type,reference_key" });

      if (error) console.error("Could not record delivery:", error);
    };

    for (const setting of settings ?? []) {
      try {
        const local = localParts(now, setting.timezone);
        const dueTypes: NotificationType[] = [];

        if (
          setting.morning_brief_enabled &&
          isDue(local.hour, local.minute, setting.morning_time)
        ) dueTypes.push("morning_brief");

        if (
          setting.evening_debrief_enabled &&
          isDue(local.hour, local.minute, setting.evening_time)
        ) dueTypes.push("evening_debrief");

        if (
          setting.weekly_review_enabled &&
          local.weekday === setting.weekly_review_day &&
          isDue(local.hour, local.minute, setting.weekly_review_time)
        ) dueTypes.push("weekly_review");

        if (
          setting.deadline_alerts_enabled &&
          isDue(local.hour, local.minute, setting.deadline_time)
        ) dueTypes.push("deadline_alert");

        if (!dueTypes.length) {
          skipped += 1;
          continue;
        }

        const { data: userData, error: userError } = await admin.auth.admin.getUserById(setting.user_id);
        if (userError) throw userError;
        const email = userData.user?.email;
        if (!email) {
          skipped += 1;
          continue;
        }

        const { data: goals, error: goalsError } = await admin
          .from("goals")
          .select("id,title")
          .eq("user_id", setting.user_id)
          .in("status", ["draft", "active"]);
        if (goalsError) throw goalsError;

        const goalIds = (goals ?? []).map((goal) => goal.id);
        const goalTitle = new Map((goals ?? []).map((goal) => [goal.id, goal.title]));

        const { data: dayTasks, error: dayTasksError } = await admin
          .from("goal_tasks")
          .select("id,goal_id,title,scheduled_time,estimated_minutes,status")
          .eq("user_id", setting.user_id)
          .eq("scheduled_date", local.date)
          .in("status", ["planned", "completed"])
          .order("scheduled_time", { ascending: true, nullsFirst: false });
        if (dayTasksError) throw dayTasksError;

        let milestones: Array<{
          id: string;
          goal_id: string;
          title: string;
          due_date: string | null;
          status: string;
        }> = [];

        if (goalIds.length) {
          const { data, error } = await admin
            .from("goal_milestones")
            .select("id,goal_id,title,due_date,status")
            .in("goal_id", goalIds)
            .neq("status", "completed")
            .not("due_date", "is", null)
            .order("due_date", { ascending: true });
          if (error) throw error;
          milestones = data ?? [];
        }

        for (const type of dueTypes) {
          const referenceKey = local.date;
          if (await alreadySent(setting.user_id, type, referenceKey)) {
            skipped += 1;
            continue;
          }

          try {
            if (type === "morning_brief") {
              const planned = (dayTasks ?? []).filter((task) => task.status === "planned");
              const nextMilestone = milestones.find((milestone) => milestone.due_date && milestone.due_date >= local.date);
              const taskList = planned.length
                ? `<ul style="padding-left:20px;">${planned.slice(0, 8).map((task) =>
                    `<li style="margin:8px 0;"><strong>${escapeHtml(task.title)}</strong> <span style="color:#64748b;">· ${escapeHtml(goalTitle.get(task.goal_id) ?? "Goal")}${task.scheduled_time ? ` · ${escapeHtml(task.scheduled_time.slice(0, 5))}` : ""}</span></li>`
                  ).join("")}</ul>`
                : '<p style="color:#64748b;">No goal-linked tasks are scheduled for today.</p>';
              const milestoneBlock = nextMilestone
                ? `<p style="margin-top:18px;"><strong>Next milestone:</strong> ${escapeHtml(nextMilestone.title)} <span style="color:#64748b;">· ${escapeHtml(nextMilestone.due_date ?? "")}</span></p>`
                : "";

              await sendEmail(
                email,
                "Your DYP GOALS morning brief",
                emailShell(
                  "Morning brief",
                  `<p>Here is the goal work currently represented for today.</p>${taskList}${milestoneBlock}`,
                  "Open Today",
                  "/todo",
                ),
                `execution:${setting.user_id}:${type}:${referenceKey}`,
              );
            }

            if (type === "evening_debrief") {
              const completed = (dayTasks ?? []).filter((task) => task.status === "completed");
              const remaining = (dayTasks ?? []).filter((task) => task.status === "planned");
              const body = `
                <p><strong>${completed.length}</strong> task${completed.length === 1 ? "" : "s"} marked complete today.</p>
                <p><strong>${remaining.length}</strong> planned task${remaining.length === 1 ? "" : "s"} still need a deliberate decision.</p>
                ${remaining.length ? `<ul style="padding-left:20px;">${remaining.slice(0, 8).map((task) => `<li style="margin:8px 0;">${escapeHtml(task.title)}</li>`).join("")}</ul>` : ""}
              `;

              await sendEmail(
                email,
                "DYP GOALS evening debrief",
                emailShell("Evening debrief", body, "Review Today", "/todo"),
                `execution:${setting.user_id}:${type}:${referenceKey}`,
              );
            }

            if (type === "weekly_review") {
              const weekStart = addDays(local.date, -(local.weekday - 1));
              const weekEnd = addDays(weekStart, 6);

              const { data: existingReview, error: existingReviewError } = await admin
                .from("goal_weekly_reviews")
                .select("id")
                .eq("user_id", setting.user_id)
                .eq("week_start", weekStart)
                .maybeSingle();

              if (existingReviewError) throw existingReviewError;
              if (existingReview) {
                skipped += 1;
                continue;
              }

              const { data: weekTasks, error: weekTasksError } = await admin
                .from("goal_tasks")
                .select("status,estimated_minutes")
                .eq("user_id", setting.user_id)
                .gte("scheduled_date", weekStart)
                .lte("scheduled_date", weekEnd)
                .neq("status", "skipped");
              if (weekTasksError) throw weekTasksError;

              const plannedMinutes = (weekTasks ?? []).reduce(
                (sum, task) => sum + Number(task.estimated_minutes || 0),
                0,
              );
              const completedMinutes = (weekTasks ?? [])
                .filter((task) => task.status === "completed")
                .reduce((sum, task) => sum + Number(task.estimated_minutes || 0), 0);

              await sendEmail(
                email,
                "Time for your DYP GOALS weekly review",
                emailShell(
                  "Weekly review",
                  `<p>This week currently contains <strong>${(weekTasks ?? []).length}</strong> represented execution tasks.</p><p>Completed represented effort: <strong>${(completedMinutes / 60).toFixed(1)}h</strong> of <strong>${(plannedMinutes / 60).toFixed(1)}h</strong>.</p><p>Save your wins, blockers and adjustments so the next plan can learn from actual execution.</p>`,
                  "Open Weekly Review",
                  "/plan",
                ),
                `execution:${setting.user_id}:${type}:${referenceKey}`,
              );
            }

            if (type === "deadline_alert") {
              const selectedDays = new Set<number>(setting.deadline_days_before ?? []);
              const due = milestones.filter((milestone) => {
                if (!milestone.due_date) return false;
                return selectedDays.has(dateDiffDays(local.date, milestone.due_date));
              });

              if (!due.length) {
                skipped += 1;
                continue;
              }

              const list = `<ul style="padding-left:20px;">${due.slice(0, 10).map((milestone) => {
                const days = dateDiffDays(local.date, milestone.due_date ?? local.date);
                return `<li style="margin:8px 0;"><strong>${escapeHtml(milestone.title)}</strong> <span style="color:#64748b;">· ${escapeHtml(goalTitle.get(milestone.goal_id) ?? "Goal")} · ${days === 0 ? "due today" : `due in ${days} day${days === 1 ? "" : "s"}`}</span></li>`;
              }).join("")}</ul>`;

              await sendEmail(
                email,
                "DYP GOALS milestone deadline alert",
                emailShell(
                  "Milestone deadline alert",
                  `<p>These incomplete milestones match the alert timing you chose:</p>${list}`,
                  "Review Plan",
                  "/plan",
                ),
                `execution:${setting.user_id}:${type}:${referenceKey}`,
              );
            }

            await recordDelivery(setting.user_id, type, referenceKey, "sent");
            sent += 1;
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown notification error";
            console.error(`Failed ${type} for ${setting.user_id}:`, message);
            await recordDelivery(setting.user_id, type, referenceKey, "failed", message);
            failed += 1;
          }
        }
      } catch (error) {
        console.error("Could not process notification user:", setting.user_id, error);
        failed += 1;
      }
    }

    // Scheduled program/session/accountability reminders and optional chat digests.
    const { data: programPrefs, error: programPrefsError } = await admin
      .from("notification_preferences")
      .select("*")
      .eq("program_emails_enabled", true)
      .limit(1000);

    if (programPrefsError && programPrefsError.code !== "42P01" && programPrefsError.code !== "PGRST205") {
      throw programPrefsError;
    }

    let scheduledProgramSent = 0;
    let scheduledProgramFailed = 0;

    const { data: currentCohort } = await admin
      .from("program_cohorts")
      .select("id,program_event_id")
      .eq("program_key", "goals")
      .eq("is_current", true)
      .maybeSingle();

    let currentEvent: {
      id: string;
      title: string;
      starts_at: string;
      ends_at: string;
      session_start_time: string;
      session_end_time: string;
      timezone: string;
      platform: string;
    } | null = null;

    if (currentCohort?.program_event_id) {
      const { data: event } = await admin
        .from("program_events")
        .select("id,title,starts_at,ends_at,session_start_time,session_end_time,timezone,platform")
        .eq("id", currentCohort.program_event_id)
        .maybeSingle();
      currentEvent = event ?? null;
    }

    for (const pref of programPrefs ?? []) {
      try {
        const { data: userData, error: userError } =
          await admin.auth.admin.getUserById(pref.user_id);
        if (userError) throw userError;
        const email = userData.user?.email;
        if (!email) {
          skipped += 1;
          continue;
        }

        const local = localParts(now, pref.timezone || "Africa/Lagos");

        const { data: currentEnrollment } = currentCohort?.id
          ? await admin
              .from("program_enrollments")
              .select("id")
              .eq("user_id", pref.user_id)
              .eq("cohort_id", currentCohort.id)
              .in("status", ["active", "completed"])
              .maybeSingle()
          : { data: null };

        if (pref.session_reminders_enabled && currentEvent && currentEnrollment?.id) {
          for (const session of programSessionDates(currentEvent)) {
            const dayKey = `${currentEvent.id}:day-${session.day}`;

            for (const reminder of [
              { type: "program_session_24h" as NotificationType, minutes: 1440, label: "24 hours" },
              { type: "program_session_1h" as NotificationType, minutes: 60, label: "1 hour" },
            ]) {
              if (!reminderDue(now, session.start, reminder.minutes)) continue;
              const referenceKey = `${dayKey}:${reminder.type}`;
              if (await alreadySent(pref.user_id, reminder.type, referenceKey)) continue;

              try {
                await sendEmail(
                  email,
                  `DYP GOALS Day ${session.day} starts in ${reminder.label}`,
                  emailShell(
                    `GOALS Day ${session.day} reminder`,
                    `<p><strong>${escapeHtml(currentEvent.title)}</strong> starts in ${reminder.label}.</p><p>Platform: <strong>${escapeHtml(currentEvent.platform)}</strong></p>`,
                    "Open Schedule",
                    "/schedule",
                  ),
                  `scheduled:${pref.user_id}:${reminder.type}:${referenceKey}`,
                );

                await admin.rpc("queue_user_notification", {
                  p_user_id: pref.user_id,
                  p_type: reminder.type,
                  p_title: `GOALS Day ${session.day} starts in ${reminder.label}`,
                  p_body: `${currentEvent.title} · ${currentEvent.platform}`,
                  p_action_label: "Open Schedule",
                  p_action_path: "/schedule",
                  p_metadata: { eventId: currentEvent.id, day: session.day },
                  p_email: false,
                });

                await recordDelivery(pref.user_id, reminder.type, referenceKey, "sent");
                scheduledProgramSent += 1;
              } catch (error) {
                const message = error instanceof Error ? error.message : "Program session reminder failed";
                await recordDelivery(pref.user_id, reminder.type, referenceKey, "failed", message);
                scheduledProgramFailed += 1;
              }
            }
          }
        }

        if (pref.accountability_reminders_enabled && currentCohort?.id) {
          if (currentEnrollment?.id) {
            const { data: membership } = await admin
              .from("program_accountability_memberships")
              .select("group_id")
              .eq("enrollment_id", currentEnrollment.id)
              .eq("status", "active")
              .maybeSingle();

            if (membership?.group_id) {
              const { data: meeting } = await admin
                .from("accountability_group_meetings")
                .select("group_id,title,meeting_url,starts_at,duration_minutes,recurrence,timezone")
                .eq("group_id", membership.group_id)
                .maybeSingle();

              if (meeting?.starts_at) {
                const occurrence = nextRecurringOccurrence(
                  new Date(meeting.starts_at),
                  meeting.recurrence,
                  now,
                );

                if (occurrence && reminderDue(now, occurrence, 1440)) {
                  const occurrenceKey = occurrence.toISOString().slice(0, 16);
                  const type: NotificationType = "accountability_meeting_24h";
                  const referenceKey = `${meeting.group_id}:${occurrenceKey}`;

                  if (!(await alreadySent(pref.user_id, type, referenceKey))) {
                    try {
                      await sendEmail(
                        email,
                        "Your Accountability Lab check-in is tomorrow",
                        emailShell(
                          "Accountability check-in reminder",
                          `<p>Your group check-in starts in about 24 hours.</p>${
                            meeting.meeting_url
                              ? `<p>Meeting link: <a href="${escapeHtml(meeting.meeting_url)}">${escapeHtml(meeting.meeting_url)}</a></p>`
                              : ""
                          }`,
                          "Open Group Chat",
                          "/accountability/chat",
                        ),
                        `scheduled:${pref.user_id}:${type}:${referenceKey}`,
                      );

                      await admin.rpc("queue_user_notification", {
                        p_user_id: pref.user_id,
                        p_type: type,
                        p_title: "Accountability check-in is tomorrow",
                        p_body: "Open your group chat or Profile calendar for the meeting details.",
                        p_action_label: "Open Group Chat",
                        p_action_path: "/accountability/chat",
                        p_metadata: { groupId: meeting.group_id, startsAt: occurrence.toISOString() },
                        p_email: false,
                      });

                      await recordDelivery(pref.user_id, type, referenceKey, "sent");
                      scheduledProgramSent += 1;
                    } catch (error) {
                      const message = error instanceof Error ? error.message : "Accountability reminder failed";
                      await recordDelivery(pref.user_id, type, referenceKey, "failed", message);
                      scheduledProgramFailed += 1;
                    }
                  }
                }

                if (
                  pref.group_digest !== "off" &&
                  isDue(local.hour, local.minute, "20:00")
                ) {
                  const weekly = pref.group_digest === "weekly";
                  if (!weekly || local.weekday === 7) {
                    const digestType: NotificationType = weekly
                      ? "group_digest_weekly"
                      : "group_digest_daily";
                    const digestKey = weekly
                      ? addDays(local.date, -(local.weekday - 1))
                      : local.date;

                    if (!(await alreadySent(pref.user_id, digestType, digestKey))) {
                      const since = new Date(
                        now.getTime() - (weekly ? 7 : 1) * 86_400_000,
                      ).toISOString();

                      const { data: chatGroup } = await admin
                        .from("chat_groups")
                        .select("id,name")
                        .eq("accountability_group_id", membership.group_id)
                        .maybeSingle();

                      if (chatGroup?.id) {
                        const { data: messages } = await admin
                          .from("chat_messages")
                          .select("message,created_at")
                          .eq("group_id", chatGroup.id)
                          .is("deleted_at", null)
                          .gte("created_at", since)
                          .order("created_at", { ascending: false })
                          .limit(20);

                        if ((messages ?? []).length > 0) {
                          const digestList = (messages ?? [])
                            .slice(0, 8)
                            .map((message) =>
                              `<li style="margin:8px 0;">${escapeHtml(
                                message.message.length > 180
                                  ? message.message.slice(0, 180) + "…"
                                  : message.message,
                              )}</li>`
                            )
                            .join("");

                          try {
                            await sendEmail(
                              email,
                              `DYP GOALS · ${weekly ? "Weekly" : "Daily"} group chat digest`,
                              emailShell(
                                `${weekly ? "Weekly" : "Daily"} group chat digest`,
                                `<p><strong>${(messages ?? []).length}</strong> recent message${
                                  (messages ?? []).length === 1 ? "" : "s"
                                } in ${escapeHtml(chatGroup.name)}.</p><ul style="padding-left:20px;">${digestList}</ul>`,
                                "Open Group Chat",
                                "/accountability/chat",
                              ),
                              `digest:${pref.user_id}:${digestType}:${digestKey}`,
                            );
                            await recordDelivery(pref.user_id, digestType, digestKey, "sent");
                            scheduledProgramSent += 1;
                          } catch (error) {
                            const message = error instanceof Error ? error.message : "Group digest failed";
                            await recordDelivery(pref.user_id, digestType, digestKey, "failed", message);
                            scheduledProgramFailed += 1;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Program notification user failed:", pref.user_id, error);
        scheduledProgramFailed += 1;
      }
    }

    // Chat digests are independent of whether a group check-in has been scheduled.
    for (const pref of programPrefs ?? []) {
      if (pref.group_digest === "off") continue;

      try {
        const local = localParts(now, pref.timezone || "Africa/Lagos");
        if (!isDue(local.hour, local.minute, "20:00")) continue;

        const weekly = pref.group_digest === "weekly";
        if (weekly && local.weekday !== 7) continue;

        const { data: enrollment } = currentCohort?.id
          ? await admin
              .from("program_enrollments")
              .select("id")
              .eq("user_id", pref.user_id)
              .eq("cohort_id", currentCohort.id)
              .in("status", ["active", "completed"])
              .maybeSingle()
          : { data: null };

        if (!enrollment?.id) continue;

        const { data: membership } = await admin
          .from("program_accountability_memberships")
          .select("group_id")
          .eq("enrollment_id", enrollment.id)
          .eq("status", "active")
          .maybeSingle();

        if (!membership?.group_id) continue;

        const digestType: NotificationType = weekly
          ? "group_digest_weekly"
          : "group_digest_daily";
        const digestKey = weekly
          ? addDays(local.date, -(local.weekday - 1))
          : local.date;

        if (await alreadySent(pref.user_id, digestType, digestKey)) continue;

        const { data: userData } = await admin.auth.admin.getUserById(pref.user_id);
        const email = userData.user?.email;
        if (!email) continue;

        const since = new Date(
          now.getTime() - (weekly ? 7 : 1) * 86_400_000,
        ).toISOString();

        const { data: chatGroup } = await admin
          .from("chat_groups")
          .select("id,name")
          .eq("accountability_group_id", membership.group_id)
          .maybeSingle();

        if (!chatGroup?.id) continue;

        const { data: messages } = await admin
          .from("chat_messages")
          .select("message,created_at")
          .eq("group_id", chatGroup.id)
          .is("deleted_at", null)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(20);

        if (!(messages ?? []).length) continue;

        const digestList = (messages ?? [])
          .slice(0, 8)
          .map((message) =>
            `<li style="margin:8px 0;">${escapeHtml(
              message.message.length > 180
                ? message.message.slice(0, 180) + "…"
                : message.message,
            )}</li>`
          )
          .join("");

        await sendEmail(
          email,
          `DYP GOALS · ${weekly ? "Weekly" : "Daily"} group chat digest`,
          emailShell(
            `${weekly ? "Weekly" : "Daily"} group chat digest`,
            `<p><strong>${(messages ?? []).length}</strong> recent message${
              (messages ?? []).length === 1 ? "" : "s"
            } in ${escapeHtml(chatGroup.name)}.</p><ul style="padding-left:20px;">${digestList}</ul>`,
            "Open Group Chat",
            "/accountability/chat",
          ),
          `digest:${pref.user_id}:${digestType}:${digestKey}`,
        );
        await recordDelivery(pref.user_id, digestType, digestKey, "sent");
        scheduledProgramSent += 1;
      } catch (error) {
        console.error("Group digest delivery failed:", pref.user_id, error);
        scheduledProgramFailed += 1;
      }
    }

    // Claims are atomic; only the worker holding locked_at may finalize a row.
    const { data: queuedEmails, error: queueError } = await admin.rpc("claim_email_batch", { p_limit: 50, p_stale_minutes: 15 });
    if (queueError) throw queueError;
    let queuedSent = 0;
    let queuedFailed = 0;
    for (const item of queuedEmails ?? []) {
      const finish = async (patch: Record<string, unknown>) => {
        const { error } = await admin.from("email_notification_queue").update({ ...patch, locked_at: null })
          .eq("id", item.id).eq("status", "processing").eq("locked_at", item.locked_at);
        if (error) throw error;
      };
      try {
        const { data: pref, error: prefError } = await admin.from("notification_preferences").select("*").eq("user_id", item.user_id).maybeSingle();
        if (prefError) throw prefError;
        if (!emailAllowedByPrefs(item.notification_type, pref)) {
          await finish({ status: "cancelled", last_error: "Cancelled because email preferences changed", processed_at: new Date().toISOString() });
          continue;
        }
        const { data: userData, error: userError } = await admin.auth.admin.getUserById(item.user_id);
        if (userError) throw userError;
        if (!userData.user?.email || !userData.user.email_confirmed_at) throw new ProviderError(422, "Recipient has no confirmed account email");
        const receipt = await sendEmail(userData.user.email, item.subject,
          emailShell(item.subject.replace(/^DYP GOALS ·\s*/i, ""), item.body_html, item.action_label || "Open DYP GOALS", item.action_path || "/journey"),
          `queue:${item.id}`);
        await finish({ status: "sent", last_error: "", accepted_at: new Date().toISOString(), processed_at: new Date().toISOString(), provider_message_id: receipt.providerMessageId });
        queuedSent += 1;
      } catch (error) {
        const retry = nextRetryState(Number(item.attempt_count));
        const permanent = error instanceof ProviderError && isPermanentProviderError(error.status);
        await finish({ status: permanent ? "failed" : retry.status,
          ...(retry.nextAttemptAt ? { next_attempt_at: retry.nextAttemptAt } : {}),
          last_error: (error instanceof Error ? error.message : "Email job failed").slice(0, 2000),
          processed_at: permanent || retry.status === "failed" ? new Date().toISOString() : null });
        queuedFailed += 1;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      worker_version: "email-system-v2",
      users_checked: settings?.length ?? 0,
      sent,
      failed,
      skipped,
      queued_program_emails_sent: queuedSent,
      queued_program_emails_failed: queuedFailed,
      scheduled_program_emails_sent: scheduledProgramSent,
      scheduled_program_emails_failed: scheduledProgramFailed,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Execution notification job failed:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Execution notification job failed",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
