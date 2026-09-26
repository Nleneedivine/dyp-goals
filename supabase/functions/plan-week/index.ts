import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const RequestSchema = z.object({
  weekStart: DateString,
});

const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const overlaps = (
  startDate: string | null,
  endDate: string | null,
  rangeStart: string,
  rangeEnd: string,
) => {
  const start = startDate ?? "0001-01-01";
  const end = endDate ?? "9999-12-31";
  return start <= rangeEnd && end >= rangeStart;
};

const lower = (value: string) => value.trim().toLocaleLowerCase();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const limit = await rateLimit(req, "plan-week", 6, 60, user.id);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds, corsHeaders);

    const parsedRequest = RequestSchema.safeParse(await req.json());
    if (!parsedRequest.success) {
      return new Response(
        JSON.stringify({ error: "Invalid weekly planning request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { weekStart } = parsedRequest.data;
    const weekDate = new Date(`${weekStart}T00:00:00Z`);
    if (weekDate.getUTCDay() !== 1) {
      return new Response(
        JSON.stringify({ error: "weekStart must be a Monday" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const weekEnd = addDays(weekStart, 6);

    const [
      goalsResult,
      capacitySettingsResult,
      capacityPeriodsResult,
      actionsResult,
      tasksResult,
    ] = await Promise.all([
      supabase
        .from("goals")
        .select("id,title,description,life_area,start_date,end_date,priority,status,estimated_hours_per_week,effort_source,success_definition,coaching_context")
        .eq("user_id", user.id)
        .in("status", ["draft", "active"]),
      supabase
        .from("goal_capacity_settings")
        .select("default_hours_per_week")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("goal_capacity_periods")
        .select("label,start_date,end_date,hours_per_week")
        .eq("user_id", user.id)
        .lte("start_date", weekEnd)
        .gte("end_date", weekStart),
      supabase
        .from("goal_weekly_actions")
        .select("id,goal_id,milestone_id,title,estimated_minutes,status")
        .eq("user_id", user.id)
        .eq("week_start", weekStart),
      supabase
        .from("goal_tasks")
        .select("id,goal_id,milestone_id,weekly_action_id,title,scheduled_date,estimated_minutes,status")
        .eq("user_id", user.id)
        .gte("scheduled_date", weekStart)
        .lte("scheduled_date", weekEnd),
    ]);

    const firstError =
      goalsResult.error ||
      capacitySettingsResult.error ||
      capacityPeriodsResult.error ||
      actionsResult.error ||
      tasksResult.error;

    if (firstError) throw new Error(firstError.message);

    const allGoals = (goalsResult.data ?? []).filter((goal) =>
      overlaps(goal.start_date, goal.end_date, weekStart, weekEnd)
    );

    if (!allGoals.length) {
      return new Response(
        JSON.stringify({
          planReady: false,
          source: "deterministic",
          weekStart,
          weekEnd,
          reason: "no_goals",
          message: "No draft or active goals overlap this week.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const goalIds = allGoals.map((goal) => goal.id);
    const [milestonesResult, effortPeriodsResult] = await Promise.all([
      supabase
        .from("goal_milestones")
        .select("id,goal_id,title,due_date,status")
        .in("goal_id", goalIds)
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("goal_effort_periods")
        .select("goal_id,label,start_date,end_date,hours_per_week")
        .in("goal_id", goalIds)
        .lte("start_date", weekEnd)
        .gte("end_date", weekStart),
    ]);

    if (milestonesResult.error || effortPeriodsResult.error) {
      throw new Error(milestonesResult.error?.message ?? effortPeriodsResult.error?.message ?? "Planning context failed");
    }

    const milestones = milestonesResult.data ?? [];
    const effortPeriods = effortPeriodsResult.data ?? [];
    const existingActions = actionsResult.data ?? [];
    const existingTasks = tasksResult.data ?? [];

    const confirmedGoals = allGoals.filter((goal) =>
      goal.effort_source === "user_confirmed" || goal.effort_source === "ai_estimate_confirmed"
    );
    const excludedGoals = allGoals
      .filter((goal) => !confirmedGoals.some((confirmed) => confirmed.id === goal.id))
      .map((goal) => ({
        id: goal.id,
        title: goal.title,
        reason: "Weekly effort is not confirmed yet.",
      }));

    const goalDemand = confirmedGoals.map((goal) => {
      const overlappingPhases = effortPeriods.filter((period) =>
        period.goal_id === goal.id &&
        period.start_date <= weekEnd &&
        period.end_date >= weekStart
      );
      const hours = overlappingPhases.length
        ? Math.max(...overlappingPhases.map((period) => Number(period.hours_per_week)))
        : Number(goal.estimated_hours_per_week ?? 0);

      const alreadyScheduledMinutes = existingTasks
        .filter((task) =>
          task.goal_id === goal.id &&
          (task.status === "planned" || task.status === "completed")
        )
        .reduce((sum, task) => sum + Number(task.estimated_minutes ?? 0), 0);

      return {
        goal,
        hours,
        commitmentMinutes: Math.round(hours * 60),
        alreadyScheduledMinutes,
        remainingMinutes: Math.max(0, Math.round(hours * 60) - alreadyScheduledMinutes),
      };
    });

    const confirmedDemandHours = goalDemand.reduce((sum, item) => sum + item.hours, 0);
    const alreadyScheduledHours = goalDemand.reduce(
      (sum, item) => sum + item.alreadyScheduledMinutes,
      0,
    ) / 60;

    const defaultCapacity = capacitySettingsResult.data
      ? Number(capacitySettingsResult.data.default_hours_per_week)
      : null;
    const overlappingCapacityPeriods = capacityPeriodsResult.data ?? [];
    const capacityCandidates = [
      ...(defaultCapacity === null ? [] : [defaultCapacity]),
      ...overlappingCapacityPeriods.map((period) => Number(period.hours_per_week)),
    ];
    const effectiveCapacity = capacityCandidates.length
      ? Math.min(...capacityCandidates)
      : null;
    const capacityVaries =
      capacityCandidates.length > 1 &&
      new Set(capacityCandidates.map((value) => value.toFixed(2))).size > 1;

    const capacity = {
      configured: effectiveCapacity !== null,
      hours: effectiveCapacity,
      varies: capacityVaries,
      labels: overlappingCapacityPeriods.map((period) => period.label || "Temporary capacity"),
    };

    if (!confirmedGoals.length) {
      return new Response(
        JSON.stringify({
          planReady: false,
          source: "deterministic",
          weekStart,
          weekEnd,
          reason: "unconfirmed_effort",
          capacity,
          confirmedDemandHours: 0,
          excludedGoals,
          message: "Confirm weekly effort on at least one goal before AI builds the week.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (effectiveCapacity !== null && confirmedDemandHours > effectiveCapacity + 0.01) {
      return new Response(
        JSON.stringify({
          planReady: false,
          source: "deterministic",
          weekStart,
          weekEnd,
          reason: "capacity_conflict",
          capacity,
          confirmedDemandHours,
          alreadyScheduledHours,
          excludedGoals,
          conflict: {
            demandHours: confirmedDemandHours,
            capacityHours: effectiveCapacity,
            overByHours: confirmedDemandHours - effectiveCapacity,
            goals: goalDemand.map((item) => ({
              id: item.goal.id,
              title: item.goal.title,
              priority: item.goal.priority,
              hours: item.hours,
            })),
          },
          message: "Your confirmed commitments do not fit the capacity you entered. Adjust workload, dates, goal status, or capacity before generating a weekly plan.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const goalsToPlan = goalDemand.filter((item) => item.remainingMinutes > 0);

    if (!goalsToPlan.length) {
      return new Response(
        JSON.stringify({
          planReady: true,
          source: "deterministic",
          weekStart,
          weekEnd,
          capacity,
          confirmedDemandHours,
          alreadyScheduledHours,
          excludedGoals,
          proposal: {
            summary: "This week's confirmed workload is already covered by your existing scheduled tasks.",
            warnings: [],
            actions: [],
            reviewPrompt: "Review the existing tasks and adjust them manually if needed.",
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiContext = goalsToPlan.map((item) => {
      const goal = item.goal;
      const allowedStart = goal.start_date && goal.start_date > weekStart ? goal.start_date : weekStart;
      const allowedEnd = goal.end_date && goal.end_date < weekEnd ? goal.end_date : weekEnd;
      const goalMilestones = milestones.filter((milestone) => milestone.goal_id === goal.id);
      const goalExistingActions = existingActions.filter((action) => action.goal_id === goal.id);
      const goalExistingTasks = existingTasks.filter((task) => task.goal_id === goal.id);

      return {
        id: goal.id,
        title: goal.title,
        description: goal.description,
        lifeArea: goal.life_area,
        priority: goal.priority,
        successDefinition: goal.success_definition,
        allowedStart,
        allowedEnd,
        weeklyCommitmentMinutes: item.commitmentMinutes,
        alreadyScheduledMinutes: item.alreadyScheduledMinutes,
        remainingMinutes: item.remainingMinutes,
        coachingContext: goal.coaching_context,
        milestones: goalMilestones,
        existingActions: goalExistingActions,
        existingTasks: goalExistingTasks,
      };
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are the DYP Weekly Execution Planner.

You are planning ONE WEEK across MULTIPLE independent goals for one person.

WEEK: ${weekStart} through ${weekEnd}

CORE RULES:
- Respect the user's confirmed weekly workload for every goal. The remainingMinutes field is the maximum additional task time you may schedule for that goal this week.
- Do not silently reduce, postpone, or drop a goal to make the week fit.
- Do not decide that one goal matters more than another. Priority values were chosen by the user and may guide sequencing, but all supplied goals remain valid commitments.
- Never create tasks outside each goal's allowedStart and allowedEnd.
- Do not invent clock times. scheduledTime must be null because fixed calendar availability has not been supplied.
- Preserve exact user frequencies and commitments. Never turn "5 days/week" into "daily".
- For habit or routine goals, create the appropriate number of concrete sessions when the goal text/coaching context specifies a frequency.
- For project/outcome goals, use milestones and deadlines to choose the next meaningful work.
- If a decision is unresolved, make validation/research/selection the task instead of pretending the decision is settled.
- Use coachingContext execution insights such as obstacles, safeguards, resources, constraints, backup routines, and review rhythms when they materially improve execution.
- Do not create subjective pseudo-metrics for spiritual, relational, or personal growth. Track concrete practices, reviews, deliverables, or user-defined indicators.
- Avoid duplicate work already present in existingActions or existingTasks.
- Keep tasks concrete and executable. Prefer 15-120 minute tasks unless the goal genuinely requires a longer block.
- The sum of task minutes for each goal must not exceed its remainingMinutes.
- Create 1-3 weekly actions per goal when useful. Each action should contain its executable tasks.
- Notes may mention a relevant safeguard or fallback but should stay brief.

Return ONLY valid JSON with this exact shape:
{
  "summary": "brief overview",
  "warnings": ["only meaningful caveats"],
  "actions": [
    {
      "goalId": "uuid from supplied goal",
      "milestoneId": "uuid from supplied milestone or null",
      "title": "weekly action",
      "notes": "brief execution note",
      "tasks": [
        {
          "title": "concrete task",
          "scheduledDate": "YYYY-MM-DD",
          "scheduledTime": null,
          "estimatedMinutes": 30,
          "notes": "brief note"
        }
      ]
    }
  ],
  "reviewPrompt": "brief reminder of what the user should check before applying"
}`;

    const userPrompt = `Build a realistic weekly execution proposal from this verified portfolio context.

Capacity context:
${JSON.stringify(capacity)}

Goals to plan:
${JSON.stringify(aiContext, null, 2)}

Return only the JSON proposal.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI planning is busy. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI planning credits are unavailable right now." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.error("plan-week AI error:", response.status, await response.text());
      throw new Error("AI weekly planning failed");
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== "string") throw new Error("AI returned an empty weekly plan");

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
    } catch {
      console.error("Invalid plan-week JSON:", raw);
      throw new Error("AI returned invalid weekly planning format");
    }

    const TaskSchema = z.object({
      title: z.string().trim().min(1).max(240),
      scheduledDate: DateString,
      scheduledTime: z.null().optional(),
      estimatedMinutes: z.number().int().min(0).max(1440),
      notes: z.string().max(4000).default(""),
    });

    const ActionSchema = z.object({
      goalId: z.string().uuid(),
      milestoneId: z.string().uuid().nullable().optional(),
      title: z.string().trim().min(1).max(240),
      notes: z.string().max(4000).default(""),
      tasks: z.array(TaskSchema).min(1).max(50),
    });

    const ProposalSchema = z.object({
      summary: z.string().trim().min(1).max(4000),
      warnings: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
      actions: z.array(ActionSchema).max(50),
      reviewPrompt: z.string().trim().min(1).max(2000),
    });

    const validated = ProposalSchema.safeParse(parsedJson);
    if (!validated.success) {
      console.error("plan-week schema validation failed:", validated.error.flatten());
      throw new Error("AI returned an invalid weekly plan");
    }

    const allowedByGoal = new Map(aiContext.map((goal) => [goal.id, goal]));
    const milestoneGoal = new Map(milestones.map((milestone) => [milestone.id, milestone.goal_id]));
    const existingTaskKeys = new Set(
      existingTasks.map((task) => `${task.goal_id}|${lower(task.title)}`)
    );

    const sanitizedActions = validated.data.actions
      .filter((action) => allowedByGoal.has(action.goalId))
      .map((action) => {
        const goal = allowedByGoal.get(action.goalId)!;
        const validMilestoneId =
          action.milestoneId && milestoneGoal.get(action.milestoneId) === action.goalId
            ? action.milestoneId
            : null;

        const seen = new Set<string>();
        const tasks = action.tasks.filter((task) => {
          if (task.scheduledDate < goal.allowedStart || task.scheduledDate > goal.allowedEnd) return false;
          const key = `${action.goalId}|${lower(task.title)}`;
          if (existingTaskKeys.has(key) || seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        return {
          goalId: action.goalId,
          milestoneId: validMilestoneId,
          title: action.title,
          notes: action.notes,
          estimatedMinutes: tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
          tasks,
        };
      })
      .filter((action) => action.tasks.length > 0);

    const minutesByGoal = new Map<string, number>();
    for (const action of sanitizedActions) {
      minutesByGoal.set(
        action.goalId,
        (minutesByGoal.get(action.goalId) ?? 0) + action.estimatedMinutes,
      );
    }

    for (const goal of aiContext) {
      const planned = minutesByGoal.get(goal.id) ?? 0;
      if (planned > goal.remainingMinutes + 1) {
        throw new Error(`AI planned more time than the confirmed remaining workload for ${goal.title}`);
      }
    }

    const allocationWarnings = [...validated.data.warnings];
    for (const goal of aiContext) {
      const planned = minutesByGoal.get(goal.id) ?? 0;
      const unallocated = goal.remainingMinutes - planned;
      if (unallocated >= 30) {
        allocationWarnings.push(
          `${goal.title}: ${unallocated} confirmed minutes remain unscheduled this week.`,
        );
      }
    }

    return new Response(
      JSON.stringify({
        planReady: true,
        source: "ai",
        weekStart,
        weekEnd,
        capacity,
        confirmedDemandHours,
        alreadyScheduledHours,
        excludedGoals,
        proposal: {
          ...validated.data,
          warnings: allocationWarnings,
          actions: sanitizedActions,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in plan-week:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Weekly planning failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
