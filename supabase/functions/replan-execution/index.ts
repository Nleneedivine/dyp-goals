import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const QueueTaskSchema = z.object({
  id: z.string().uuid(),
  goalId: z.string().uuid(),
  milestoneId: z.string().uuid().nullable(),
  weeklyActionId: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(240),
  estimatedMinutes: z.number().min(0).max(1440),
  status: z.enum(["planned", "deferred"]),
  scheduledDate: DateString.nullable(),
  deferredFromDate: DateString.nullable(),
});

const GoalSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(240),
  description: z.string().max(8000).default(""),
  priority: z.enum(["primary", "maintenance", "later"]),
  endDate: DateString.nullable(),
  coachingContext: z.unknown().optional(),
});

const MilestoneSchema = z.object({
  id: z.string().uuid(),
  goalId: z.string().uuid(),
  title: z.string().min(1).max(240),
  dueDate: DateString.nullable(),
  status: z.string().max(40),
});

const EventSchema = z.object({
  taskId: z.string().uuid().nullable(),
  goalId: z.string().uuid(),
  eventType: z.string().max(40),
  fromScheduledDate: DateString.nullable(),
  toScheduledDate: DateString.nullable(),
  occurredAt: z.string().max(80),
});

const ReviewSchema = z.object({
  weekStart: DateString,
  plannedMinutes: z.number().min(0),
  completedMinutes: z.number().min(0),
  blockers: z.string().max(6000),
  adjustments: z.string().max(6000),
});

const UpcomingTaskSchema = z.object({
  id: z.string().uuid(),
  goalId: z.string().uuid(),
  title: z.string().max(240),
  scheduledDate: DateString.nullable(),
  estimatedMinutes: z.number().min(0).max(1440),
  status: z.string().max(40),
});

const RequestSchema = z.object({
  currentDate: DateString,
  queueTasks: z.array(QueueTaskSchema).min(1).max(30),
  goals: z.array(GoalSchema).min(1).max(30),
  milestones: z.array(MilestoneSchema).max(200),
  recentEvents: z.array(EventSchema).max(120),
  recentReviews: z.array(ReviewSchema).max(4),
  upcomingTasks: z.array(UpcomingTaskSchema).max(200),
});

const OptionSchema = z.object({
  type: z.enum(["reschedule", "split", "fallback", "review_workload"]),
  label: z.string().min(1).max(180),
  rationale: z.string().min(1).max(1200),
  suggestedDate: DateString.nullable().optional(),
  splitTasks: z.array(z.object({
    title: z.string().min(1).max(240),
    estimatedMinutes: z.number().int().min(5).max(1440),
  })).max(6).optional(),
  fallbackTask: z.object({
    title: z.string().min(1).max(240),
    estimatedMinutes: z.number().int().min(5).max(1440),
    suggestedDate: DateString,
  }).optional(),
});

const SuggestionSchema = z.object({
  taskId: z.string().uuid(),
  observation: z.string().min(1).max(1200),
  options: z.array(OptionSchema).min(1).max(3),
});

const ResponseSchema = z.object({
  summary: z.string().min(1).max(2500),
  suggestions: z.array(SuggestionSchema).min(1).max(30),
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

    const limit = await rateLimit(req, "replan-execution", 6, 60, user.id);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds, corsHeaders);

    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      console.error("Invalid replanning request:", parsed.error.flatten());
      return new Response(JSON.stringify({ error: "Invalid replanning input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const input = parsed.data;
    const queueById = new Map(input.queueTasks.map((task) => [task.id, task]));
    const goalIds = new Set(input.goals.map((goal) => goal.id));

    for (const task of input.queueTasks) {
      if (!goalIds.has(task.goalId)) {
        return new Response(JSON.stringify({ error: "Queue task references an unavailable goal" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are the DYP adaptive execution coach. Help a user decide what to do with MISSED OR DEFERRED goal tasks.

CURRENT DATE: ${input.currentDate}

ROLE BOUNDARIES:
- Give options; do not make the user's priority, deadline, or workload decision for them.
- Do not silently reduce or abandon a confirmed goal.
- Do not claim to know why the user missed something unless the supplied execution history or user reflection supports it.
- Distinguish an observation from a possible explanation.
- Use preserved coaching safeguards, fallback routines, resources and constraints when relevant.
- If repeated under-execution is visible, you may suggest that the user REVIEW workload, deadline, capacity or priority. Do not choose which one to change.
- A reschedule suggestion must use a date on or after CURRENT DATE.
- Do not suggest dates after a goal's known deadline unless the option is explicitly "review_workload".
- Avoid simply pushing every missed task to tomorrow. Consider upcoming workload and milestones.
- "fallback" means using an already-grounded safeguard/minimum routine from coaching context; do not invent a personal safeguard as if the user chose it. When you offer fallback, include fallbackTask with a concrete smaller task, its realistic duration, and a date on or after CURRENT DATE.
- A fallback task must not be longer than the original task when the original task has a positive duration.
- "split" may break a large task into smaller concrete pieces, but the total estimated minutes should stay approximately equal to the original.
- Return 1 to 3 genuinely different options per queue task.
- Return ONLY valid JSON.

Schema:
{
  "summary": "brief portfolio-level execution observation",
  "suggestions": [
    {
      "taskId": "uuid",
      "observation": "what the supplied data shows about this task",
      "options": [
        {
          "type": "reschedule | split | fallback | review_workload",
          "label": "short option label",
          "rationale": "why this option may help",
          "suggestedDate": "YYYY-MM-DD or null",
          "splitTasks": [
            {"title": "smaller task", "estimatedMinutes": 20}
          ],
          "fallbackTask": {
            "title": "grounded minimum-version task",
            "estimatedMinutes": 15,
            "suggestedDate": "YYYY-MM-DD"
          }
        }
      ]
    }
  ]
}`;

    const userPrompt = `QUEUE TASKS:
${JSON.stringify(input.queueTasks, null, 2)}

GOALS INCLUDING COACHING CONTEXT:
${JSON.stringify(input.goals, null, 2)}

MILESTONES:
${JSON.stringify(input.milestones, null, 2)}

RECENT TASK EXECUTION EVENTS:
${JSON.stringify(input.recentEvents, null, 2)}

RECENT WEEKLY REVIEWS:
${JSON.stringify(input.recentReviews, null, 2)}

UPCOMING SCHEDULED TASKS:
${JSON.stringify(input.upcomingTasks, null, 2)}

Give reviewable replanning options for every queue task.`;

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
      console.error("Replanning AI error:", response.status, await response.text());
      throw new Error("AI replanning failed");
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== "string") throw new Error("AI returned an empty replanning response");

    let decoded: unknown;
    try {
      decoded = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
    } catch {
      console.error("Invalid replanning JSON:", raw);
      throw new Error("AI returned invalid replanning JSON");
    }

    const validated = ResponseSchema.safeParse(decoded);
    if (!validated.success) {
      console.error("Replanning schema failure:", validated.error.flatten());
      throw new Error("AI returned invalid replanning options");
    }

    const returnedTaskIds = new Set<string>();
    for (const suggestion of validated.data.suggestions) {
      const task = queueById.get(suggestion.taskId);
      if (!task) throw new Error("AI referenced a task outside the replanning queue");
      if (returnedTaskIds.has(suggestion.taskId)) throw new Error("AI duplicated a replanning task");
      returnedTaskIds.add(suggestion.taskId);

      const goal = input.goals.find((item) => item.id === task.goalId);
      for (const option of suggestion.options) {
        if (option.suggestedDate) {
          if (option.type !== "reschedule") {
            option.suggestedDate = null;
          } else {
            if (option.suggestedDate < input.currentDate) {
              throw new Error("AI suggested a replanning date in the past");
            }
            if (goal?.endDate && option.suggestedDate > goal.endDate) {
              throw new Error("AI suggested a reschedule after the goal deadline");
            }
          }
        }

        if (option.type === "fallback") {
          if (!option.fallbackTask) {
            throw new Error("AI fallback option is missing a concrete fallback task");
          }
          if (option.fallbackTask.suggestedDate < input.currentDate) {
            throw new Error("AI suggested a fallback task in the past");
          }
          if (goal?.endDate && option.fallbackTask.suggestedDate > goal.endDate) {
            throw new Error("AI suggested a fallback task after the goal deadline");
          }
          if (
            task.estimatedMinutes > 0 &&
            option.fallbackTask.estimatedMinutes > task.estimatedMinutes
          ) {
            throw new Error("AI fallback increased the original task workload");
          }
        } else if (option.fallbackTask) {
          option.fallbackTask = undefined;
        }

        if (option.type === "split" && option.splitTasks?.length) {
          const splitMinutes = option.splitTasks.reduce(
            (sum, item) => sum + item.estimatedMinutes,
            0,
          );
          if (task.estimatedMinutes > 0 && Math.abs(splitMinutes - task.estimatedMinutes) > 30) {
            throw new Error("AI split changed the task workload materially");
          }
        }
      }
    }

    if (returnedTaskIds.size !== input.queueTasks.length) {
      throw new Error("AI did not return replanning options for every queue task");
    }

    return new Response(JSON.stringify({ replan: validated.data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in replan-execution:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Failed to generate replanning options",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
