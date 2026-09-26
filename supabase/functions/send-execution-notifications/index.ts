import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_1") ?? Deno.env.get("RESEND_API_KEY");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://dyp-goals.lovable.app";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type NotificationType =
  | "morning_brief"
  | "evening_debrief"
  | "weekly_review"
  | "deadline_alert";

function decodeJwtPayload(token: string) {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

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

async function sendEmail(to: string, subject: string, html: string) {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

  const response = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": RESEND_API_KEY,
    },
    body: JSON.stringify({
      from: "DYP GOALS <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend API error [${response.status}]: ${await response.text()}`);
  }
}

function emailShell(title: string, body: string, ctaLabel: string, ctaPath: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6faf8;color:#173b2b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:32px 18px;">
      <div style="background:#fff;border:1px solid #d7e4dd;border-radius:16px;padding:28px;">
        <p style="margin:0 0 8px;color:#0f766e;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">DYP GOALS</p>
        <h1 style="margin:0 0 18px;font-size:24px;">${escapeHtml(title)}</h1>
        ${body}
        <a href="${APP_URL}${ctaPath}" style="display:inline-block;margin-top:20px;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">${escapeHtml(ctaLabel)}</a>
      </div>
      <p style="margin:14px 4px 0;color:#64748b;font-size:12px;">You are receiving this because you enabled this execution email in your DYP GOALS profile.</p>
    </div>
  </body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const payload = decodeJwtPayload(token);

    if (payload?.role !== "service_role") {
      return new Response(JSON.stringify({ error: "Service role required" }), {
        status: 403,
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

    return new Response(JSON.stringify({
      success: true,
      users_checked: settings?.length ?? 0,
      sent,
      failed,
      skipped,
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
