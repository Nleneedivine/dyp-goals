import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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

    const limit = await rateLimit(req, "clarify-goal", 15, 60, user.id);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds, corsHeaders);

    const HistoryItemSchema = z.object({
      question: z.string().trim().min(1).max(1500),
      answer: z.string().trim().min(1).max(4000),
      kind: z.enum(["essential", "development"]),
    });

    const GoalSchema = z.object({
      title: z.string().trim().min(1).max(240),
      description: z.string().trim().max(8000).optional(),
      lifeArea: z.string().trim().min(1).max(80).optional(),
      startDate: DateString.nullable().optional(),
      endDate: DateString.nullable().optional(),
      priority: z.enum(["primary", "maintenance", "later"]).optional(),
      estimatedHoursPerWeek: z.number().min(0).max(168).optional(),
      successDefinition: z.string().trim().max(4000).optional(),
    }).refine(
      (value) => !value.startDate || !value.endDate || value.endDate >= value.startDate,
      { message: "Goal end date cannot be before start date" },
    );

    const RequestSchema = z.object({
      goal: GoalSchema,
      phase: z.enum(["core", "deeper"]),
      roundNumber: z.number().int().min(1).max(3),
      history: z.array(HistoryItemSchema).max(30).default([]),
    });

    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      console.error("Invalid clarify-goal request:", parsed.error.flatten());
      return new Response(
        JSON.stringify({ error: "Invalid goal clarification input" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { goal, phase, roundNumber, history } = parsed.data;
    const currentDate = new Date().toISOString().slice(0, 10);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const historyText = history.length
      ? history.map((item, index) =>
          `${index + 1}. [${item.kind}] Q: ${item.question}\n   A: ${item.answer}`
        ).join("\n")
      : "No previous clarification answers.";

    const systemPrompt = `You are the DYP AI Coach. Your job is not merely to rewrite goals; it is to help the user think clearly enough to execute them.

CURRENT DATE: ${currentDate}
CLARIFICATION PHASE: ${phase}
QUESTION ROUND: ${roundNumber} of 3

SAVED GOAL:
${JSON.stringify(goal, null, 2)}

PREVIOUS CLARIFICATION:
${historyText}

GENERAL RULES:
- Never repeat, lightly paraphrase, or ask again for information already present in the saved goal or previous answers.
- Ask only questions whose answers would materially improve the quality, realism, or executability of the goal.
- Keep questions concrete and easy to answer.
- Do not ask for sensitive personal information.
- Do not make priority decisions for the user.
- Preserve explicit start and end dates as user constraints unless you are asking whether the user wants to change them.
- Return ONLY valid JSON. Do not use markdown formatting characters in string values.

CORE PHASE:
- Decide whether the goal has enough information to produce a useful structured plan.
- If essential uncertainty remains, set readyToPlan=false and ask 1-3 highest-leverage ESSENTIAL questions.
- Essential means the plan would otherwise be materially generic, misleading, or poorly scoped.
- Examples include: what outcome counts as done, what is being produced/offered, who/what the goal concerns, key constraints, or a missing deadline when timing is necessary.
- If the goal is already sufficiently clear, set readyToPlan=true and return no questions.
- Do not ask development questions in the core phase.

DEEPER PHASE:
- The user already has enough information to build a plan.
- Set readyToPlan=true.
- Ask 1-4 OPTIONAL DEVELOPMENT questions only if they would help the user think more strategically.
- Development questions can explore audience, resources, risks, distribution/customer acquisition, dependencies, skills, tradeoffs, measurement, or likely obstacles depending on the goal.
- These questions are for coaching depth, not because the plan is blocked.
- If additional questions would add little value, return an empty questions array.

Return exactly:
{
  "feedback": "<brief assessment of what is already clear and what still matters>",
  "readyToPlan": <boolean>,
  "questions": [
    {
      "question": "<question>",
      "reason": "<one short sentence explaining why this matters>"
    }
  ],
  "coachNote": "<brief encouraging coaching note>"
}`;

    const userPrompt = phase === "core"
      ? "Assess whether this goal needs more essential clarification before planning. Ask only what is truly necessary."
      : "Offer a deeper coaching round. Ask optional strategic questions that would materially strengthen the user's thinking without blocking plan creation.";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI service requires payment. Please contact support." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error("Goal clarification failed");
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== "string") throw new Error("AI returned an empty clarification");

    let result;
    try {
      const cleaned = raw.replace(/```(?:json)?\n?|\n?```/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end <= start) throw new Error("No JSON object found");
      result = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      console.error("Failed to parse clarify-goal response:", raw);
      throw new Error("AI returned invalid clarification format");
    }

    const ResultSchema = z.object({
      feedback: z.string().min(1).max(3000),
      readyToPlan: z.boolean(),
      questions: z.array(z.object({
        question: z.string().min(1).max(1500),
        reason: z.string().min(1).max(1000),
      })).max(phase === "core" ? 3 : 4),
      coachNote: z.string().min(1).max(2000),
    });

    const validated = ResultSchema.safeParse(result);
    if (!validated.success) {
      console.error("clarify-goal schema validation failed:", validated.error.flatten());
      throw new Error("AI returned invalid clarification data");
    }

    if (phase === "core" && validated.data.questions.length > 0) {
      validated.data.readyToPlan = false;
    }
    if (phase === "core" && validated.data.readyToPlan) {
      validated.data.questions = [];
    }
    if (phase === "deeper") {
      validated.data.readyToPlan = true;
    }

    const previousQuestions = new Set(history.map((item) => item.question.trim().toLowerCase()));
    validated.data.questions = validated.data.questions.filter(
      (item) => !previousQuestions.has(item.question.trim().toLowerCase()),
    );

    return new Response(
      JSON.stringify({ clarification: validated.data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in clarify-goal:", error);
    const message = error instanceof Error ? error.message : "Failed to clarify goal";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
