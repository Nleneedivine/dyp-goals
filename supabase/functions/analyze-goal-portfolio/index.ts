import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const MilestoneSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  dueDate: DateString.nullable(),
  status: z.string().max(40),
});

const GoalSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  description: z.string().max(8000).default(""),
  lifeArea: z.string().max(80).default("Other"),
  priority: z.enum(["primary", "maintenance", "later"]),
  status: z.string().max(40),
  startDate: DateString.nullable(),
  endDate: DateString.nullable(),
  weeklyHours: z.number().min(0).max(168),
  effortSource: z.enum(["unknown", "user_confirmed", "ai_estimate_confirmed"]),
  successDefinition: z.string().max(4000).default(""),
  milestones: z.array(MilestoneSchema).max(30).default([]),
  coachingContext: z.unknown().optional(),
});

const CapacityWindowSchema = z.object({
  label: z.string().max(120),
  startDate: DateString,
  endDate: DateString,
  capacityHours: z.number().min(0).max(168),
  demandHours: z.number().min(0).max(5000),
  marginHours: z.number().min(-5000).max(5000),
  overloaded: z.boolean(),
});

const RequestSchema = z.object({
  goals: z.array(GoalSchema).min(2).max(30),
  capacityWindows: z.array(CapacityWindowSchema).max(100).default([]),
});

const FindingSchema = z.object({
  type: z.enum([
    "possible_duplicate",
    "dependency",
    "sequence",
    "deadline_tension",
    "scope_overlap",
    "clarity_gap",
    "resource_assumption",
    "capacity_signal",
  ]),
  requiresDecision: z.boolean(),
  goalIds: z.array(z.string().uuid()).min(1).max(10),
  title: z.string().min(1).max(220),
  observation: z.string().min(1).max(1800),
  whyItMatters: z.string().min(1).max(1800),
  questions: z.array(z.string().min(1).max(600)).max(4).default([]),
  options: z.array(z.string().min(1).max(800)).max(4).default([]),
});

const ResponseSchema = z.object({
  summary: z.string().min(1).max(3000),
  findings: z.array(FindingSchema).max(30),
  strengths: z.array(z.string().min(1).max(1000)).max(10).default([]),
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

    const limit = await rateLimit(req, "analyze-goal-portfolio", 5, 60, user.id);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds, corsHeaders);

    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      console.error("Invalid portfolio review request:", parsed.error.flatten());
      return new Response(JSON.stringify({ error: "Invalid portfolio review input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const input = parsed.data;
    const goalIds = new Set(input.goals.map((goal) => goal.id));
    const overloadedWindows = input.capacityWindows.filter((window) => window.overloaded);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are the DYP portfolio coach. Review a user's MULTI-GOAL portfolio for interactions that are easy to miss when each goal is viewed alone.

ROLE:
- Surface possible duplicates, dependencies, sequencing issues, deadline tensions, scope overlap, unresolved clarity gaps, resource assumptions, and relevant capacity signals.
- Help the user make decisions. Do NOT make priority decisions for them.
- Do NOT tell the user which goal to drop, pause, postpone, or sacrifice.
- Do NOT convert "primary / maintenance / later" into a ranking recommendation. Those labels are user-provided context only.
- Do NOT invent dependencies or certainty. Use "possible", "appears", or a question when evidence is incomplete.
- Do NOT re-score SMART quality. Individual goal coaching already handles that.
- Do NOT recalculate capacity. CAPACITY WINDOWS are deterministic application output. If a window says overloaded, you may explain the interaction but must preserve the supplied numbers exactly.
- If there is no real cross-goal issue, say so rather than manufacturing findings.
- A finding can require a user decision when there is an unresolved choice, sequencing question, overlap, dependency, or capacity pressure.
- "strengths" should be descriptive portfolio structure that is already present, not praise or a score.
- Return ONLY valid JSON.

FINDING TYPES:
- possible_duplicate: goals may substantially represent the same outcome.
- dependency: one goal may need an output/resource from another.
- sequence: order may matter even if neither goal is inherently more important.
- deadline_tension: dates create a practical collision or compressed window.
- scope_overlap: goals share work/resources without necessarily being duplicates.
- clarity_gap: a cross-goal decision remains unspecified.
- resource_assumption: simultaneous goals appear to assume the same scarce resource or prerequisite.
- capacity_signal: refer only to deterministic capacity windows supplied by the app.

JSON:
{
  "summary": "portfolio-level description",
  "strengths": ["descriptive structural fact"],
  "findings": [
    {
      "type": "possible_duplicate | dependency | sequence | deadline_tension | scope_overlap | clarity_gap | resource_assumption | capacity_signal",
      "requiresDecision": true,
      "goalIds": ["uuid"],
      "title": "short title",
      "observation": "what the supplied portfolio shows",
      "whyItMatters": "practical execution consequence",
      "questions": ["optional user decision question"],
      "options": ["neutral options the user could consider without choosing for them"]
    }
  ]
}`;

    const userPrompt = `GOALS:
${JSON.stringify(input.goals, null, 2)}

DETERMINISTIC CAPACITY WINDOWS:
${JSON.stringify(input.capacityWindows, null, 2)}

OVERLOADED WINDOW COUNT: ${overloadedWindows.length}

Review only meaningful cross-goal interactions. Do not repeat individual-goal coaching.`;

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
      console.error("Portfolio review AI error:", response.status, await response.text());
      throw new Error("AI portfolio review failed");
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (typeof raw !== "string") throw new Error("AI returned an empty portfolio review");

    let decoded: unknown;
    try {
      decoded = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
    } catch {
      console.error("Invalid portfolio review JSON:", raw);
      throw new Error("AI returned invalid portfolio review JSON");
    }

    const validated = ResponseSchema.safeParse(decoded);
    if (!validated.success) {
      console.error("Portfolio review schema failure:", validated.error.flatten());
      throw new Error("AI returned invalid portfolio findings");
    }

    const seenSignatures = new Set<string>();

    for (const finding of validated.data.findings) {
      if (finding.goalIds.some((goalId) => !goalIds.has(goalId))) {
        throw new Error("AI referenced a goal outside the submitted portfolio");
      }

      const signature = [
        finding.type,
        [...finding.goalIds].sort().join(","),
        finding.title.toLowerCase(),
      ].join("|");

      if (seenSignatures.has(signature)) {
        throw new Error("AI returned duplicate portfolio findings");
      }
      seenSignatures.add(signature);

      if (finding.type === "capacity_signal" && !input.capacityWindows.length) {
        throw new Error("AI created a capacity finding without deterministic capacity data");
      }
    }

    return new Response(JSON.stringify({ review: validated.data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in analyze-goal-portfolio:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Failed to review goal portfolio",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
