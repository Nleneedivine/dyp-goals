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
  currentData: any;
  feedback: string;
  goal: string;
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
    if (body.regenerateSection) {
      return handleSectionRegeneration(body.regenerateSection);
    }
    
    // Otherwise, handle full plan generation
    const { questionnaireData } = body as { questionnaireData: QuestionnaireData };
    return handleFullPlanGeneration(questionnaireData);
    
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
          "month": "January",
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
            "notes": "string"
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
            "notes": "string"
          }
        ]
      }
    }`,
  };

  const systemPrompt = `You are an expert productivity coach. You need to regenerate a specific section of a time plan based on user feedback.

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

  return new Response(
    JSON.stringify({ sectionData }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleFullPlanGeneration(questionnaireData: QuestionnaireData) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const systemPrompt = `You are an expert productivity coach and time management specialist for DYP (Discover Your Purpose). Your role is to create comprehensive, actionable time plans based on user goals and constraints.

You MUST respond with valid JSON only. No markdown, no explanations outside the JSON structure.

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
        "month": "January",
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
          "notes": "string"
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
          "notes": "string"
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
- Is achievable within the deadline`;

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

  return new Response(
    JSON.stringify({ timePlan }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
