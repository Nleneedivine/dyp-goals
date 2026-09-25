import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { z } from "npm:zod@3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
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

    console.log('Authenticated user:', user.id);

    const limit = await rateLimit(req, "analyze-goals", 10, 60, user.id);\n    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds, corsHeaders);\n\n    const { goals } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Analyzing goals with AI...');

    const systemPrompt = `You are the DYP AI Coach - an expert goal-setting assistant specializing in helping youth and young adults create SMART goals (Specific, Measurable, Achievable, Relevant, Time-bound).

Your task is to analyze the user's goals and provide structured feedback in JSON format.

Return a JSON object with this exact structure:
{
  "overallScore": <number 0-100>,
  "goals": [
    {
      "originalGoal": "<the goal as user wrote it>",
      "score": <number 0-100>,
      "feedback": "<specific constructive feedback>",
      "questions": ["<question 1>", "<question 2>", "<question 3>"],
      "improvedVersion": "<SMART rewritten version>"
    }
  ],
  "generalAdvice": "<2-3 sentences of encouraging advice>"
}

IMPORTANT: 
- Return ONLY valid JSON, no markdown, no explanations
- Be encouraging and youth-friendly
- Provide 2-3 specific questions per goal
- Make improved versions actionable and inspiring`;

    const userPrompt = `Analyze these goals and return structured JSON as specified:\n\n${goals}`;

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
      throw new Error('AI analysis failed');
    }

    const data = await response.json();
    const analysisText = data.choices[0].message.content;
    
    // Parse the JSON response from AI
    let analysis;
    try {
      // Remove markdown code blocks if present
      const cleanedText = analysisText.replace(/```json\n?|\n?```/g, '').trim();
      analysis = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', analysisText);
      throw new Error('AI returned invalid format');
    }

    const AnalysisSchema = z.object({\n      overallScore: z.number().min(0).max(100),\n      goals: z.array(z.object({ originalGoal: z.string(), score: z.number().min(0).max(100), feedback: z.string(), questions: z.array(z.string()).max(3), improvedVersion: z.string() })),\n      generalAdvice: z.string(),\n    });\n    const validated = AnalysisSchema.safeParse(analysis);\n    if (!validated.success) throw new Error("AI returned an invalid goal analysis");\n\n    console.log("Analysis complete");

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in analyze-goals:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to analyze goals';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});