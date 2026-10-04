import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_TARGETS = {
  "journey-progress": { route: "/journey", label: "Journey progress" },
  "program-access": { route: "/journey", label: "Program Access" },
  vision: { route: "/vision", label: "Vision" },
  "my-goals": { route: "/my-goals", label: "My GOALS" },
  planner: { route: "/plan", label: "Plan" },
  today: { route: "/todo", label: "Today" },
  progress: { route: "/progress", label: "Progress" },
  accountability: { route: "/journey", label: "Accountability Lab" },
} as const;

type TargetId = keyof typeof ALLOWED_TARGETS;

const RequestSchema = z.object({
  question: z.string().trim().min(2).max(1200),
});

const ReplySchema = z.object({
  answer: z.string().trim().min(1).max(1200),
  target: z.enum([
    "journey-progress",
    "program-access",
    "vision",
    "my-goals",
    "planner",
    "today",
    "progress",
    "accountability",
  ]),
  ctaLabel: z.string().trim().min(1).max(60).default("Show me"),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const limit = await rateLimit(req, "goals-guide", 20, 60, user.id);
    if (!limit.allowed) {
      return rateLimitResponse(limit.retryAfterSeconds, corsHeaders);
    }

    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid question" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: context, error: contextError } = await supabase.rpc(
      "get_goals_guide_context",
    );

    if (contextError) {
      throw new Error("Could not load the participant journey context");
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const targetCatalogue = Object.entries(ALLOWED_TARGETS)
      .map(([id, value]) => `- ${id}: ${value.label} (${value.route})`)
      .join("\n");

    const systemPrompt = `You are the DYP GOALS Guide, a simple product-navigation assistant for youth and young adults using the DYP GOALS platform.

Your job is not to coach the person's life or rewrite their goals. Your job is to:
1. answer questions about where something is in the platform,
2. explain a platform feature in plain language,
3. recommend the next useful platform area based on the supplied journey state,
4. select exactly one APPROVED UI target that the frontend can spotlight.

PARTICIPANT JOURNEY STATE:
${JSON.stringify(context)}

APPROVED UI TARGETS:
${targetCatalogue}

RULES:
- You MUST choose exactly one target from the approved list.
- Never invent a route, selector, button or feature.
- Keep the answer to 1-3 short sentences.
- Use simple language. No jargon.
- If the user asks where referral earnings, WhatsApp, payment or program access is, choose program-access.
- If the user asks about purpose/vision/direction, choose vision.
- If the user asks about goals or AI goal refinement, choose my-goals.
- If the user asks about planning, weekly actions or scheduling, choose planner.
- If the user asks what to do today or tasks, choose today.
- If the user asks about reviews, progress or execution performance, choose progress.
- If the user asks about groups/accountability, choose accountability.
- If the user asks what to do next, use the journey state:
  * no vision -> vision
  * no goals -> my-goals
  * goals but no plan -> planner
  * plan but no accountability group -> accountability
  * no review yet -> progress
  * otherwise -> journey-progress.
- Mentorship is optional deeper support; do not present it as the same thing as Accountability Lab.
- Return ONLY valid JSON with this shape:
{
  "answer": "short explanation",
  "target": "one approved target id",
  "ctaLabel": "short button label"
}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: parsed.data.question },
          ],
          response_format: { type: "json_object" },
          temperature: 0.15,
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Please wait a moment and ask again." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      throw new Error("GOALS Guide AI request failed");
    }

    const payload = await response.json();
    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error("GOALS Guide returned no answer");

    let raw: unknown;
    try {
      raw = JSON.parse(text.replace(/\`\`\`json\n?|\n?\`\`\`/g, "").trim());
    } catch {
      throw new Error("GOALS Guide returned invalid JSON");
    }

    const validated = ReplySchema.parse(raw);
    const target = validated.target as TargetId;

    return new Response(
      JSON.stringify({
        answer: validated.answer,
        target,
        route: ALLOWED_TARGETS[target].route,
        ctaLabel: validated.ctaLabel,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("GOALS Guide error:", error);
    const message =
      error instanceof Error ? error.message : "GOALS Guide is unavailable";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
