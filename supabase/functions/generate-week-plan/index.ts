import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const GoalSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  description: z.string().max(8000).default(""),
  lifeArea: z.string().max(80).default("Other"),
  priority: z.enum(["primary", "maintenance", "later"]),
  startDate: DateString.nullable(),
  endDate: DateString.nullable(),
  weeklyHours: z.number().min(0).max(168),
  coachingContext: z.unknown().optional(),
});

const MilestoneSchema = z.object({
  id: z.string().uuid(),
  goalId: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  dueDate: DateString.nullable(),
  status: z.string().max(40),
});

const ExistingActionSchema = z.object({
  goalId: z.string().uuid(),
  milestoneId: z.string().uuid().nullable(),
  title: z.string().max(240),
  estimatedMinutes: z.number().min(0).max(10080),
});

const ExistingTaskSchema = z.object({
  goalId: z.string().uuid(),
  title: z.string().max(240),
  scheduledDate: DateString.nullable(),
  estimatedMinutes: z.number().min(0).max(1440),
  status: z.enum(["planned", "completed", "deferred", "skipped"]),
});

const ReviewSchema = z.object({
  weekStart: DateString,
  plannedMinutes: z.number().min(0),
  completedMinutes: z.number().min(0),
  blockers: z.string().max(6000).default(""),
  adjustments: z.string().max(6000).default(""),
});

const RequestSchema = z.object({
  weekStart: DateString,
  weekEnd: DateString,
  capacityHours: z.number().min(0).max(168),
  goals: z.array(GoalSchema).min(1).max(30),
  milestones: z.array(MilestoneSchema).max(200),
  existingActions: z.array(ExistingActionSchema).max(200).default([]),
  existingTasks: z.array(ExistingTaskSchema).max(400).default([]),
  recentReviews: z.array(ReviewSchema).max(4).default([]),
}).refine((value) => value.weekEnd >= value.weekStart, {
  message: "Week end cannot be before week start",
});

const TaskSchema = z.object({
  title: z.string().trim().min(1).max(240),
  scheduledDate: DateString,
  estimatedMinutes: z.number().int().min(5).max(1440),
  notes: z.string().max(1200).default(""),
});

const ActionSchema = z.object({
  goalId: z.string().uuid(),
  milestoneId: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(240),
  estimatedMinutes: z.number().int().min(5).max(10080),
  notes: z.string().max(1200).default(""),
  tasks: z.array(TaskSchema).min(1).max(20),
});

const ResponseSchema = z.object({
  planNote: z.string().min(1).max(3000),
  warnings: z.array(z.string().min(1).max(1000)).max(10).default([]),
  actions: z.array(ActionSchema).max(40),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const limit = await rateLimit(req, "generate-week-plan", 6, 60, user.id);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds, corsHeaders);

    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      console.error("Invalid week-plan request:", parsed.error.flatten());
      return new Response(JSON.stringify({ error: "Invalid week planning input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const input = parsed.data;
    const goalById = new Map(input.goals.map((goal) => [goal.id, goal]));
    const milestoneById = new Map(input.milestones.map((milestone) => [milestone.id, milestone]));

    const committedMinutes = input.goals.reduce(
      (sum, goal) => sum + Math.round(goal.weeklyHours * 60),
      0,
    );
    const capacityMinutes = Math.round(input.capacityHours * 60);

    if (committedMinutes > capacityMinutes + 1) {
      return new Response(JSON.stringify({
        error: "PORTFOLIO_OVER_CAPACITY",
        message: "Confirmed goal commitments exceed the weekly capacity you entered. Resolve the portfolio pressure before asking AI to turn it into a schedule.",
        committedMinutes,
        capacityMinutes,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingMinutesByGoal = new Map<string, number>();
    for (const task of input.existingTasks) {
      if (task.status !== "planned" && task.status !== "completed") continue;
      existingMinutesByGoal.set(
        task.goalId,
        (existingMinutesByGoal.get(task.goalId) ?? 0) + task.estimatedMinutes,
      );
    }

    const goalsWithBudget = input.goals.map((goal) => {
      const committed = Math.round(goal.weeklyHours * 60);
      const existing = existingMinutesByGoal.get(goal.id) ?? 0;
      return {
        ...goal,
        committedMinutes: committed,
        existingScheduledMinutes: existing,
        remainingMinutes: Math.max(0, committed - existing),
      };
    });

    const existingScheduledMinutes = Array.from(existingMinutesByGoal.values())
      .reduce((sum, minutes) => sum + minutes, 0);
    const remainingCapacityMinutes = Math.max(0, capacityMinutes - existingScheduledMinutes);
    const totalRemainingGoalMinutes = goalsWithBudget
      .reduce((sum, goal) => sum + goal.remainingMinutes, 0);

    if (totalRemainingGoalMinutes > remainingCapacityMinutes + 1) {
      return new Response(JSON.stringify({
        error: "EXISTING_SCHEDULE_OVER_CAPACITY",
        message: "Existing scheduled work leaves less room than your remaining confirmed goal commitments. Review the current week before asking AI to fill the remaining plan.",
        remainingGoalMinutes: totalRemainingGoalMinutes,
        remainingCapacityMinutes,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (totalRemainingGoalMinutes === 0 || remainingCapacityMinutes === 0) {
      return new Response(JSON.stringify({
        plan: {
          planNote: totalRemainingGoalMinutes === 0
            ? "This week's confirmed goal workload is already fully represented by scheduled tasks."
            : "No weekly capacity remains for additional scheduled goal tasks.",
          warnings: [],
          actions: [],
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recentExecution = input.recentReviews.length
      ? input.recentReviews.map((review) => ({
          weekStart: review.weekStart,
          completionRate: review.plannedMinutes > 0
            ? Math.round((review.completedMinutes / review.plannedMinutes) * 100)
            : null,
          blockers: review.blockers,
          adjustments: review.adjustments,
        }))
      : [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are the DYP execution-planning coach. Turn a user's already-confirmed portfolio commitments into a practical draft for ONE week.

NON-NEGOTIABLE RULES:
- Do not choose which goal the user should abandon, reduce, postpone, or treat as more important.
- Every goal with remainingMinutes > 0 should receive useful execution work when feasible.
- Never exceed remainingMinutes for any goal.
- Never exceed the remaining weekly capacity.
- Existing actions/tasks are already planned; do not duplicate them.
- Use the user's milestones, coaching safeguards, resources, constraints, and review lessons when they materially improve the plan.
- Preserve explicit frequencies and commitments. Do not intensify them.
- Keep tasks concrete and executable.
- Schedule only a DATE, not an exact clock time. Fixed commitments and detailed time-slotting are handled separately.
- Every task date must fall between WEEK START and WEEK END inclusive.
- Use priorities only as context for sequencing and attention, not as permission to omit another confirmed goal.
- If recent execution shows under-execution, prefer fewer, clearer tasks rather than silently reducing the confirmed weekly commitment. Add a warning that the user may want to review workload/capacity if appropriate.
- If an unresolved decision exists in coaching context, turn it into a research/decision task instead of pretending it is resolved.
- For habits, create realistic repeated practice tasks that match the user's stated frequency and any fallback routine.
- For projects/outcomes, work backward from upcoming milestones.
- The estimatedMinutes on a weekly action should approximately equal the total estimatedMinutes of its tasks.
- Return ONLY valid JSON.

Return:
{
  "planNote": "brief explanation",
  "warnings": ["optional factual planning warnings"],
  "actions": [
    {
      "goalId": "uuid",
      "milestoneId": "uuid or null",
      "title": "weekly action",
      "estimatedMinutes": 120,
      "notes": "",
      "tasks": [
        {
          "title": "concrete task",
          "scheduledDate": "YYYY-MM-DD",
          "estimatedMinutes": 45,
          "notes": ""
        }
      ]
    }
  ]
}`;

    const userPrompt = `WEEK START: ${input.weekStart}
WEEK END: ${input.weekEnd}
TOTAL CAPACITY: ${capacityMinutes} minutes
EXISTING SCHEDULED TASK TIME: ${existingScheduledMinutes} minutes
REMAINING CAPACITY: ${remainingCapacityMinutes} minutes

GOALS WITH REMAINING BUDGET:
${JSON.stringify(goalsWithBudget, null, 2)}

MILESTONES:
${JSON.stringify(input.milestones, null, 2)}

EXISTING WEEKLY ACTIONS:
${JSON.stringify(input.existingActions, null, 2)}

EXISTING TASKS:
${JSON.stringify(input.existingTasks, null, 2)}

RECENT EXECUTION REVIEWS:
${JSON.stringify(recentExecution, null, 2)}

Draft only the missing execution work for this week.`;

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
        return new Response(JSON.stringify({ error: "AI_RATE_LIMITED" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI_CREDITS_REQUIRED" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("Week planning AI error:", response.status, await response.text());
      throw new Error("AI week planning failed");
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== "string") throw new Error("AI returned an empty week plan");

    let decoded: unknown;
    try {
      decoded = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
    } catch {
      console.error("Invalid week plan JSON:", raw);
      throw new Error("AI returned invalid week plan JSON");
    }

    const validated = ResponseSchema.safeParse(decoded);
    if (!validated.success) {
      console.error("Week plan schema failure:", validated.error.flatten());
      throw new Error("AI returned an invalid week plan");
    }

    const remainingByGoal = new Map(
      goalsWithBudget.map((goal) => [goal.id, goal.remainingMinutes]),
    );
    const generatedByGoal = new Map<string, number>();
    let generatedTotal = 0;

    for (const action of validated.data.actions) {
      const goal = goalById.get(action.goalId);
      if (!goal) throw new Error("AI referenced an unknown goal");

      if (action.milestoneId) {
        const milestone = milestoneById.get(action.milestoneId);
        if (!milestone || milestone.goalId !== action.goalId) {
          throw new Error("AI referenced an invalid milestone");
        }
      }

      const taskMinutes = action.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
      if (Math.abs(taskMinutes - action.estimatedMinutes) > 30) {
        throw new Error("AI weekly action effort does not match its task effort");
      }

      for (const task of action.tasks) {
        if (task.scheduledDate < input.weekStart || task.scheduledDate > input.weekEnd) {
          throw new Error("AI scheduled a task outside the selected week");
        }
      }

      generatedByGoal.set(
        action.goalId,
        (generatedByGoal.get(action.goalId) ?? 0) + taskMinutes,
      );
      generatedTotal += taskMinutes;
    }

    for (const [goalId, minutes] of generatedByGoal) {
      if (minutes > (remainingByGoal.get(goalId) ?? 0) + 1) {
        throw new Error("AI exceeded a goal's confirmed remaining weekly commitment");
      }
    }

    const omittedGoal = goalsWithBudget.find(
      (goal) => goal.remainingMinutes > 0 && !generatedByGoal.has(goal.id),
    );
    if (omittedGoal) {
      throw new Error("AI omitted a confirmed goal that still has weekly execution budget");
    }

    if (generatedTotal > remainingCapacityMinutes + 1) {
      throw new Error("AI exceeded remaining weekly capacity");
    }

    return new Response(JSON.stringify({ plan: validated.data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-week-plan:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Failed to generate week plan",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
