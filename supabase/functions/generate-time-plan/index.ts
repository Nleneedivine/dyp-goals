import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuestionnaireData {
  goal: string;
  specificOutcomes: string;
  deadline: string;
  milestones: string;
  hoursPerWeek: number;
  dailyWeeklyActivities: string;
  constraints: string;
  wakeTime: string;
  sleepTime: string;
  weekendPreference: 'light' | 'same' | 'intense';
}

interface RegenerateSectionRequest {
  sectionType: 'yearly' | 'monthly' | 'weekly' | 'daily';
  currentData: unknown;
  feedback: string;
  goal: string;
}

const QuestionnaireSchema = z.object({
  goal: z.string().trim().min(3).max(12000),
  specificOutcomes: z.string().trim().max(12000),
  deadline: z.string().trim().min(1).max(120),
  milestones: z.string().trim().max(12000),
  hoursPerWeek: z.number().positive().max(168),
  dailyWeeklyActivities: z.string().trim().max(12000),
  constraints: z.string().trim().max(12000),
  wakeTime: z.string().trim().min(1).max(40),
  sleepTime: z.string().trim().min(1).max(40),
  weekendPreference: z.enum(["light", "same", "intense"]),
});

const RegenerateSectionSchema = z.object({
  sectionType: z.enum(["yearly", "monthly", "weekly", "daily"]),
  currentData: z.unknown(),
  feedback: z.string().trim().min(1).max(4000),
  goal: z.string().trim().min(3).max(12000),
});

function parseClockMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();

  if (minute > 59 || hour > 23) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem === "pm") hour += 12;
  }

  return hour * 60 + minute;
}

function templateGoalHours(template: { timeBlocks: Array<{ startTime: string; endTime: string; isGoalWork?: boolean }> }) {
  return template.timeBlocks.reduce((total, block) => {
    if (!block.isGoalWork) return total;
    const start = parseClockMinutes(block.startTime);
    const end = parseClockMinutes(block.endTime);
    if (start === null || end === null) return total;
    const durationMinutes = end >= start ? end - start : (24 * 60 - start) + end;
    return total + durationMinutes / 60;
  }, 0);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const limit = await rateLimit(req, "generate-time-plan", 10, 60, user.id);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds, corsHeaders);

    const body = await req.json();
    
    // Check if this is a section regeneration request
    if (body?.regenerateSection) {
      const parsedRegeneration = RegenerateSectionSchema.safeParse(body.regenerateSection);
      if (!parsedRegeneration.success) {
        return new Response(
          JSON.stringify({ error: "Invalid section regeneration request" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return handleSectionRegeneration(parsedRegeneration.data);
    }
    
    // Otherwise, handle full plan generation
    const parsedQuestionnaire = QuestionnaireSchema.safeParse(body?.questionnaireData);
    if (!parsedQuestionnaire.success) {
      return new Response(
        JSON.stringify({ error: "Invalid time-plan questionnaire" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return handleFullPlanGeneration(parsedQuestionnaire.data);
    
  } catch (error) {
    console.error("Error generating time plan:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleSectionRegeneration(request: RegenerateSectionRequest) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const sectionSchemas: Record<string, string> = {
    yearly: `{
      "mainGoal": "string",
      "quarters": [
        {
          "quarter": 1,
          "period": "<Month YYYY - Month YYYY>",
          "focus": "string",
          "milestones": ["string"],
          "keyDeadlines": ["string"]
        }
      ],
      "annualTargets": ["string"]
    }`,
    monthly: `{
      "months": [
        {
          "month": "<Month YYYY>",
          "focus": "string",
          "goals": ["string"],
          "weeklyHours": number,
          "keyTasks": ["string"]
        }
      ]
    }`,
    weekly: `{
      "totalHoursPerWeek": number,
      "weekdayHours": number,
      "weekendHours": number,
      "sampleWeeks": [
        {
          "weekNumber": 1,
          "theme": "string",
          "tasks": [
            {
              "day": "Monday",
              "activities": ["string"],
              "hours": number
            }
          ],
          "weeklyGoal": "string"
        }
      ]
    }`,
    daily: `{
      "weekdayTemplate": {
        "wakeTime": "string",
        "sleepTime": "string",
        "timeBlocks": [
          {
            "startTime": "string",
            "endTime": "string",
            "activity": "string",
            "category": "string",
            "notes": "string",
            "isGoalWork": true
          }
        ]
      },
      "weekendTemplate": {
        "wakeTime": "string",
        "sleepTime": "string",
        "timeBlocks": [
          {
            "startTime": "string",
            "endTime": "string",
            "activity": "string",
            "category": "string",
            "notes": "string",
            "isGoalWork": true
          }
        ]
      }
    }`,
  };

  const currentDate = new Date().toISOString().slice(0, 10);

  const systemPrompt = `You are an expert productivity coach. You need to regenerate a specific section of a time plan based on user feedback.

CURRENT DATE: ${currentDate}
Never introduce milestones, months, or deadlines before the current date unless the current plan explicitly describes completed historical work.

You MUST respond with valid JSON only. No markdown, no explanations outside the JSON structure.

Regenerate the ${request.sectionType} plan section based on the user's feedback while keeping it aligned with the overall goal.

The output must match this exact schema:
${sectionSchemas[request.sectionType]}`;

  const userPrompt = `GOAL: ${request.goal}

CURRENT ${request.sectionType.toUpperCase()} PLAN:
${JSON.stringify(request.currentData, null, 2)}

USER FEEDBACK:
${request.feedback}

Please regenerate the ${request.sectionType} plan section incorporating the user's feedback. Keep the same structure but modify the content based on the feedback.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const errorText = await response.text();
    console.error("AI gateway error:", response.status, errorText);
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const aiResponse = await response.json();
  const content = aiResponse.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No response from AI");
  }

  // Clean and parse JSON
  let cleanedContent = content.trim();
  if (cleanedContent.startsWith("```json")) {
    cleanedContent = cleanedContent.slice(7);
  }
  if (cleanedContent.startsWith("```")) {
    cleanedContent = cleanedContent.slice(3);
  }
  if (cleanedContent.endsWith("```")) {
    cleanedContent = cleanedContent.slice(0, -3);
  }
  cleanedContent = cleanedContent.trim();

  const sectionData = JSON.parse(cleanedContent);

  const timeBlockSchema = z.object({
    startTime: z.string().min(1),
    endTime: z.string().min(1),
    activity: z.string().min(1),
    category: z.string().min(1),
    notes: z.string(),
    isGoalWork: z.boolean().optional(),
  });
  const sectionValidators = {
    yearly: z.object({
      mainGoal: z.string().min(1),
      quarters: z.array(z.object({
        quarter: z.number(),
        period: z.string().optional(),
        focus: z.string().min(1),
        milestones: z.array(z.string()),
        keyDeadlines: z.array(z.string()),
      })),
      annualTargets: z.array(z.string()),
    }),
    monthly: z.object({
      months: z.array(z.object({
        month: z.string().min(1),
        focus: z.string().min(1),
        goals: z.array(z.string()),
        weeklyHours: z.number().nonnegative(),
        keyTasks: z.array(z.string()),
      })),
    }),
    weekly: z.object({
      totalHoursPerWeek: z.number().nonnegative(),
      weekdayHours: z.number().nonnegative(),
      weekendHours: z.number().nonnegative(),
      sampleWeeks: z.array(z.object({
        weekNumber: z.number(),
        theme: z.string().min(1),
        tasks: z.array(z.object({
          day: z.string().min(1),
          activities: z.array(z.string()),
          hours: z.number().nonnegative(),
        })),
        weeklyGoal: z.string().min(1),
      })),
    }),
    daily: z.object({
      weekdayTemplate: z.object({
        wakeTime: z.string().min(1),
        sleepTime: z.string().min(1),
        timeBlocks: z.array(timeBlockSchema),
      }),
      weekendTemplate: z.object({
        wakeTime: z.string().min(1),
        sleepTime: z.string().min(1),
        timeBlocks: z.array(timeBlockSchema),
      }),
    }),
  } as const;

  const validatedSection = sectionValidators[request.sectionType].safeParse(sectionData);
  if (!validatedSection.success) {
    console.error("AI regenerated section failed schema validation:", validatedSection.error.flatten());
    throw new Error("AI returned an invalid regenerated plan section");
  }

  return new Response(
    JSON.stringify({ sectionData: validatedSection.data }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleFullPlanGeneration(questionnaireData: QuestionnaireData) {
  const currentDate = new Date().toISOString().slice(0, 10);
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const systemPrompt = `You are an expert productivity coach and time management specialist for DYP (Discover Your Purpose). Your role is to create comprehensive, actionable time plans based on user goals and constraints.

You MUST respond with valid JSON only. No markdown, no explanations outside the JSON structure.

DATE RULES:
- Today's date is ${currentDate}.
- Planning starts today. Never create future tasks, milestones, months, or deadlines dated before today.
- Respect the user's stated deadline exactly; do not invent an earlier starting year or describe a longer project duration than the actual remaining time.
- Monthly plans must include only months from the current month through the deadline, formatted as "Month YYYY".
- Quarterly sections are planning phases within the remaining time, not automatically Jan-Mar/Apr-Jun/Jul-Sep/Oct-Dec. Include a human-readable "period" for each phase.

TIME-BUDGET RULES:
- The requested weekly commitment is a hard cap and target.
- weeklyPlan.totalHoursPerWeek must equal the user's available hours.
- weekdayHours + weekendHours must equal totalHoursPerWeek.
- Each sample week's task hours must add up to the weekly commitment.
- Do not count sleep, meals, classes, leisure, routines, or other life obligations as goal-work hours.
- In daily time blocks, set "isGoalWork": true only for blocks that directly advance the user's goal; otherwise false.
- The daily schedule is a realistic template and must not imply more goal-work time than the weekly plan.

Based on the user's goal, questionnaire responses, and constraints, generate a detailed time plan with four tiers:

1. YEARLY PLAN: Major milestones, quarterly goals, key deadlines
2. MONTHLY PLAN: Monthly targets, breakdown of yearly goals into monthly chunks
3. WEEKLY PLAN: Week-by-week structure (at least 4 sample weeks), specific tasks and hours
4. DAILY PLAN: Hour-by-hour schedule template (for weekday and weekend), incorporating wake/sleep times

Consider:
- User's available hours per week
- Wake and sleep times
- Constraints (work, school, etc.)
- Weekend preference (light/same/intense)
- Daily/weekly recurring activities

Response format:
{
  "yearlyPlan": {
    "mainGoal": "string",
    "quarters": [
      {
        "quarter": 1,
        "period": "<Month YYYY - Month YYYY>",
        "focus": "string",
        "milestones": ["string"],
        "keyDeadlines": ["string"]
      }
    ],
    "annualTargets": ["string"]
  },
  "monthlyPlan": {
    "months": [
      {
        "month": "<Month YYYY>",
        "focus": "string",
        "goals": ["string"],
        "weeklyHours": number,
        "keyTasks": ["string"]
      }
    ]
  },
  "weeklyPlan": {
    "totalHoursPerWeek": number,
    "weekdayHours": number,
    "weekendHours": number,
    "sampleWeeks": [
      {
        "weekNumber": 1,
        "theme": "string",
        "tasks": [
          {
            "day": "Monday",
            "activities": ["string"],
            "hours": number
          }
        ],
        "weeklyGoal": "string"
      }
    ]
  },
  "dailyPlan": {
    "weekdayTemplate": {
      "wakeTime": "string",
      "sleepTime": "string",
      "timeBlocks": [
        {
          "startTime": "string",
          "endTime": "string",
          "activity": "string",
          "category": "string",
          "notes": "string",
          "isGoalWork": true
        }
      ]
    },
    "weekendTemplate": {
      "wakeTime": "string",
      "sleepTime": "string",
      "timeBlocks": [
        {
          "startTime": "string",
          "endTime": "string",
          "activity": "string",
          "category": "string",
          "notes": "string",
          "isGoalWork": true
        }
      ]
    }
  },
  "summary": {
    "totalWeeklyCommitment": number,
    "estimatedCompletionDate": "string",
    "keySuccessFactors": ["string"],
    "potentialChallenges": ["string"],
    "recommendations": ["string"]
  }
}`;

  const userPrompt = `Create a comprehensive time plan for the following goal and constraints:

CURRENT DATE: ${currentDate}
GOAL: ${questionnaireData.goal}

QUESTIONNAIRE RESPONSES:
1. Specific Outcomes: ${questionnaireData.specificOutcomes}
2. Deadline: ${questionnaireData.deadline}
3. Milestones/Sub-tasks: ${questionnaireData.milestones}
4. Available Hours Per Week: ${questionnaireData.hoursPerWeek}
5. Daily/Weekly Activities: ${questionnaireData.dailyWeeklyActivities}
6. Constraints: ${questionnaireData.constraints}
7. Wake Time: ${questionnaireData.wakeTime}
8. Sleep Time: ${questionnaireData.sleepTime}
9. Weekend Preference: ${questionnaireData.weekendPreference}

Generate a detailed, realistic, and actionable time plan that:
- Respects the user's constraints and available time
- Breaks down the goal into manageable chunks
- Provides clear daily schedules
- Accounts for rest and breaks
- Is achievable within the deadline
- Starts from the current date, never from a past month
- Uses the exact weekly-hour commitment consistently across summary, monthly, weekly, and daily views`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (response.status === 402) {
      return new Response(
        JSON.stringify({ error: "Payment required. Please add credits." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const errorText = await response.text();
    console.error("AI gateway error:", response.status, errorText);
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const aiResponse = await response.json();
  const content = aiResponse.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No response from AI");
  }

  // Clean and parse JSON
  let cleanedContent = content.trim();
  if (cleanedContent.startsWith("```json")) {
    cleanedContent = cleanedContent.slice(7);
  }
  if (cleanedContent.startsWith("```")) {
    cleanedContent = cleanedContent.slice(3);
  }
  if (cleanedContent.endsWith("```")) {
    cleanedContent = cleanedContent.slice(0, -3);
  }
  cleanedContent = cleanedContent.trim();

  const timePlan = JSON.parse(cleanedContent);

  const TimePlanSchema = z.object({
    yearlyPlan: z.object({
      mainGoal: z.string(),
      quarters: z.array(z.object({
        quarter: z.number(),
        period: z.string().optional(),
        focus: z.string(),
        milestones: z.array(z.string()),
        keyDeadlines: z.array(z.string()),
      })),
      annualTargets: z.array(z.string()),
    }),
    monthlyPlan: z.object({
      months: z.array(z.object({
        month: z.string(),
        focus: z.string(),
        goals: z.array(z.string()),
        weeklyHours: z.number().nonnegative(),
        keyTasks: z.array(z.string()),
      })),
    }),
    weeklyPlan: z.object({
      totalHoursPerWeek: z.number().nonnegative(),
      weekdayHours: z.number().nonnegative(),
      weekendHours: z.number().nonnegative(),
      sampleWeeks: z.array(z.object({
        weekNumber: z.number(),
        theme: z.string(),
        tasks: z.array(z.object({
          day: z.string(),
          activities: z.array(z.string()),
          hours: z.number().nonnegative(),
        })),
        weeklyGoal: z.string(),
      })),
    }),
    dailyPlan: z.object({
      weekdayTemplate: z.object({
        wakeTime: z.string(),
        sleepTime: z.string(),
        timeBlocks: z.array(z.object({
          startTime: z.string(),
          endTime: z.string(),
          activity: z.string(),
          category: z.string(),
          notes: z.string(),
          isGoalWork: z.boolean().optional(),
        })),
      }),
      weekendTemplate: z.object({
        wakeTime: z.string(),
        sleepTime: z.string(),
        timeBlocks: z.array(z.object({
          startTime: z.string(),
          endTime: z.string(),
          activity: z.string(),
          category: z.string(),
          notes: z.string(),
          isGoalWork: z.boolean().optional(),
        })),
      }),
    }),
    summary: z.object({
      totalWeeklyCommitment: z.number().nonnegative(),
      estimatedCompletionDate: z.string(),
      keySuccessFactors: z.array(z.string()),
      potentialChallenges: z.array(z.string()),
      recommendations: z.array(z.string()),
    }),
  });
  const parsedPlan = TimePlanSchema.safeParse(timePlan);
  if (!parsedPlan.success) {
    console.error("AI time plan failed schema validation:", parsedPlan.error.flatten());
    throw new Error("AI returned an invalid time plan");
  }
  const tolerance = 0.01;
  const expectedWeeklyHours = questionnaireData.hoursPerWeek;
  const weekly = parsedPlan.data.weeklyPlan;

  if (Math.abs(parsedPlan.data.summary.totalWeeklyCommitment - expectedWeeklyHours) > tolerance) {
    throw new Error("AI generated a summary with an inconsistent weekly commitment");
  }
  if (Math.abs(weekly.totalHoursPerWeek - expectedWeeklyHours) > tolerance) {
    throw new Error("AI generated a weekly plan with an inconsistent weekly commitment");
  }
  if (Math.abs((weekly.weekdayHours + weekly.weekendHours) - expectedWeeklyHours) > tolerance) {
    throw new Error("AI generated weekday/weekend hours that do not match the weekly commitment");
  }
  for (const sampleWeek of weekly.sampleWeeks) {
    const taskHours = sampleWeek.tasks.reduce((sum, task) => sum + task.hours, 0);
    if (Math.abs(taskHours - expectedWeeklyHours) > tolerance) {
      throw new Error(`AI generated Week ${sampleWeek.weekNumber} with ${taskHours} hours instead of ${expectedWeeklyHours}`);
    }
  }

  const weekdayGoalHours = templateGoalHours(parsedPlan.data.dailyPlan.weekdayTemplate);
  const weekendGoalHours = templateGoalHours(parsedPlan.data.dailyPlan.weekendTemplate);
  const impliedDailyTemplateHours = weekdayGoalHours * 5 + weekendGoalHours * 2;
  if (impliedDailyTemplateHours > 0 && Math.abs(impliedDailyTemplateHours - expectedWeeklyHours) > 0.25) {
    throw new Error(
      `AI daily templates imply ${impliedDailyTemplateHours.toFixed(2)} goal-work hours per week instead of ${expectedWeeklyHours}`,
    );
  }
  const currentMonthStart = Date.parse(`${currentDate.slice(0, 7)}-01T00:00:00Z`);
  const deadline = Date.parse(questionnaireData.deadline);
  const deadlineDate = Number.isFinite(deadline) ? new Date(deadline) : null;
  const deadlineMonthStart = deadlineDate
    ? Date.UTC(deadlineDate.getUTCFullYear(), deadlineDate.getUTCMonth(), 1)
    : null;

  for (const month of parsedPlan.data.monthlyPlan.months) {
    if (month.weeklyHours - expectedWeeklyHours > tolerance) {
      throw new Error(`AI generated ${month.month} above the available weekly hours`);
    }

    const monthStart = Date.parse(`1 ${month.month} UTC`);
    if (Number.isFinite(monthStart) && monthStart < currentMonthStart) {
      throw new Error(`AI generated a past planning month: ${month.month}`);
    }
    if (deadlineMonthStart !== null && Number.isFinite(monthStart) && monthStart > deadlineMonthStart) {
      throw new Error(`AI generated ${month.month} after the user's deadline`);
    }
  }

  const estimated = Date.parse(parsedPlan.data.summary.estimatedCompletionDate);
  const today = Date.parse(currentDate);
  if (Number.isFinite(estimated) && estimated < today) {
    throw new Error("AI generated an estimated completion date in the past");
  }
  if (Number.isFinite(deadline) && Number.isFinite(estimated) && estimated > deadline) {
    throw new Error("AI generated an estimated completion date after the user's deadline");
  }

  return new Response(
    JSON.stringify({ timePlan: parsedPlan.data }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
