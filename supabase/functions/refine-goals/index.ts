import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { z } from "npm:zod@3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const limit = await rateLimit(req, "refine-goals", 10, 60, user.id);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds, corsHeaders);

    const currentYear = new Date().getUTCFullYear();

    const PortfolioGoalSchema = z.object({
      title: z.string().trim().min(1).max(240),
      description: z.string().trim().max(8000).optional(),
      lifeArea: z.string().trim().min(1).max(80).optional(),
      startDate: DateString.nullable().optional(),
      endDate: DateString.nullable().optional(),
      priority: z.enum(['primary', 'maintenance', 'later']).optional(),
      estimatedHoursPerWeek: z.number().min(0).max(168).optional(),
      successDefinition: z.string().trim().max(4000).optional(),
    }).refine(
      (value) => !value.startDate || !value.endDate || value.endDate >= value.startDate,
      { message: "Portfolio goal end date cannot be before start date" },
    );

    const RequestSchema = z.object({
      originalGoals: z.string().trim().min(3).max(12000),
      questions: z.array(z.string().trim().min(1).max(1500)).max(100),
      responses: z.array(z.string().trim().min(1).max(4000)).max(100),
      targetYear: z.number().int().min(currentYear).max(currentYear + 10).optional(),
      planningStartDate: DateString.optional(),
      portfolioGoal: PortfolioGoalSchema.optional(),
    }).refine((value) => value.questions.length === value.responses.length, {
      message: "Each clarification question must have a response",
    });

    const parsedRequest = RequestSchema.safeParse(await req.json());
    if (!parsedRequest.success) {
      console.error("Invalid refinement request:", parsedRequest.error.flatten());
      return new Response(
        JSON.stringify({ error: 'Invalid refinement input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { originalGoals, questions, responses, targetYear, planningStartDate, portfolioGoal } = parsedRequest.data;
    const currentDate = new Date().toISOString().slice(0, 10);

    if (planningStartDate && planningStartDate < currentDate) {
      return new Response(
        JSON.stringify({ error: 'Preferred start date cannot be in the past' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const portfolioContext = portfolioGoal
      ? `
PORTFOLIO GOAL CONTEXT:
${JSON.stringify(portfolioGoal, null, 2)}

PORTFOLIO RULES:
- This is one saved goal in a larger portfolio.
- Preserve explicit user-supplied start and end dates unless a clarification response explicitly changes them.
- A saved start date may be before CURRENT DATE because the goal may already be underway. That historical start is valid.
- New milestones and action steps must not be scheduled in the past.
- Suggest a realistic weekly effort. Do not inflate effort merely because the deadline is close.
- Milestones must fall inside the goal's planning window when start/end dates are known.
- Effort periods may overlap with other goals; do not decide which goal is more important than another.
- Return a structured goal object that can be saved directly into the portfolio.
`
      : "";

    const systemPrompt = `You are the DYP AI Coach - an expert at helping youth create comprehensive, actionable SMART goals.

CURRENT DATE: ${currentDate}
TARGET YEAR: ${targetYear ?? "not explicitly selected"}
PREFERRED PLANNING START DATE: ${planningStartDate ?? "not specified; choose a realistic future start"}
${portfolioContext}

Based on the original goals and the user's responses to your questions, create a refined, comprehensive goal plan.

DATE RULES:
- Never create a new action step, milestone, or deadline in the past relative to CURRENT DATE.
- A future goal may intentionally begin later than CURRENT DATE.
- If PREFERRED PLANNING START DATE is provided, the first new execution step must be on or after that date.
- If no preferred start date is provided, choose a realistic future execution start when needed; do not automatically force the first step into the current month.
- If the user supplied a deadline, preserve it unless their clarification explicitly changes it.
- If TARGET YEAR is supplied, keep the plan aligned with that year while still respecting any explicit deadline the user wrote.
- Do not fabricate historical work.
- Sequence steps realistically within the available planning window.
- Use ISO dates (YYYY-MM-DD) for structured date fields.

Return a JSON object with this structure:
{
  "refinedGoals": [
    {
      "title": "<goal title>",
      "description": "<detailed SMART goal description>",
      "actionSteps": ["<step 1>", "<step 2>", "<step 3>"],
      "timeline": "<human-readable timeline>",
      "successMetrics": ["<metric 1>", "<metric 2>"],
      "lifeArea": "<life area when known>",
      "startDate": "<YYYY-MM-DD or null>",
      "endDate": "<YYYY-MM-DD or null>",
      "priority": "<primary, maintenance, or later>",
      "estimatedHoursPerWeek": <number>,
      "successDefinition": "<clear finish line>",
      "milestones": [
        { "title": "<milestone>", "dueDate": "<YYYY-MM-DD or null>" }
      ],
      "effortPeriods": [
        {
          "label": "<phase label>",
          "startDate": "<YYYY-MM-DD>",
          "endDate": "<YYYY-MM-DD>",
          "hoursPerWeek": <number>
        }
      ]
    }
  ],
  "nextSteps": "<encouraging message about implementing these goals>"
}

For normal non-portfolio refinement, the structured portfolio fields may still be supplied when confidently inferable.
For portfolio refinement, provide the structured fields and 2-8 meaningful milestones when appropriate.
Effort periods should reflect changing intensity only when useful; otherwise one period covering the goal window is enough.
Return ONLY valid JSON. Do not use markdown formatting characters such as **, __, or backticks inside JSON string values.`;

    const userPrompt = `Current date: ${currentDate}
Target year: ${targetYear ?? "not explicitly selected"}
Preferred planning start date: ${planningStartDate ?? "not specified"}

Original goals: ${originalGoals}

Questions asked: ${JSON.stringify(questions)}
User responses: ${JSON.stringify(responses)}
${portfolioGoal ? `Saved portfolio goal: ${JSON.stringify(portfolioGoal)}` : ""}

Create comprehensive refined goals based on this information.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service requires payment. Please contact support.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error('AI refinement failed');
    }

    const data = await response.json();
    const refinedText = data.choices?.[0]?.message?.content;
    if (typeof refinedText !== "string") throw new Error("AI returned an empty refinement");

    let refined;
    try {
      const cleanedText = refinedText.replace(/\`\`\`json\n?|\n?\`\`\`/g, '').trim();
      refined = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', refinedText);
      throw new Error('AI returned invalid format');
    }

    const MilestoneSchema = z.object({
      title: z.string().min(1).max(240),
      dueDate: DateString.nullable().optional(),
    });

    const EffortPeriodSchema = z.object({
      label: z.string().max(120),
      startDate: DateString,
      endDate: DateString,
      hoursPerWeek: z.number().min(0).max(168),
    }).refine((value) => value.endDate >= value.startDate, {
      message: "Effort period end date cannot be before start date",
    });

    const RefinedGoalSchema = z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      actionSteps: z.array(z.string().min(1)).min(1),
      timeline: z.string().min(1),
      successMetrics: z.array(z.string().min(1)).min(1),
      lifeArea: z.string().max(80).optional(),
      startDate: DateString.nullable().optional(),
      endDate: DateString.nullable().optional(),
      priority: z.enum(['primary', 'maintenance', 'later']).optional(),
      estimatedHoursPerWeek: z.number().min(0).max(168).optional(),
      successDefinition: z.string().max(4000).optional(),
      milestones: z.array(MilestoneSchema).max(20).optional(),
      effortPeriods: z.array(EffortPeriodSchema).max(24).optional(),
    }).refine(
      (value) => !value.startDate || !value.endDate || value.endDate >= value.startDate,
      { message: "Refined goal end date cannot be before start date" },
    );

    const RefinementSchema = z.object({
      refinedGoals: z.array(RefinedGoalSchema).min(1).max(30),
      nextSteps: z.string().min(1),
    });

    const validated = RefinementSchema.safeParse(refined);
    if (!validated.success) {
      console.error("AI refinement failed schema validation:", validated.error.flatten());
      throw new Error("AI returned invalid refined goals");
    }

    if (portfolioGoal) {
      const first = validated.data.refinedGoals[0];
      const effectiveStart = first.startDate ?? portfolioGoal.startDate ?? null;
      const effectiveEnd = first.endDate ?? portfolioGoal.endDate ?? null;

      if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
        throw new Error("AI returned an invalid portfolio date window");
      }

      if (first.milestones) {
        first.milestones = first.milestones.filter((milestone) => {
          if (!milestone.dueDate) return true;
          if (milestone.dueDate < currentDate) return false;
          if (effectiveStart && milestone.dueDate < effectiveStart && effectiveStart >= currentDate) return false;
          if (effectiveEnd && milestone.dueDate > effectiveEnd) return false;
          return true;
        });
      }

      if (first.effortPeriods) {
        first.effortPeriods = first.effortPeriods.filter((period) => {
          if (period.endDate < currentDate) return false;
          if (effectiveEnd && period.startDate > effectiveEnd) return false;
          return true;
        });
      }
    }

    return new Response(
      JSON.stringify({ refined: validated.data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in refine-goals:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to refine goals';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
