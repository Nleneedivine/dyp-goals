import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { originalGoals, questions, responses } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Refining goals with user responses...');

    const systemPrompt = `You are the DYP AI Coach - an expert at helping youth create comprehensive, actionable SMART goals.

Based on the original goals and the user's responses to your questions, create a refined, comprehensive goal plan.

Return a JSON object with this structure:
{
  "refinedGoals": [
    {
      "title": "<goal title>",
      "description": "<detailed SMART goal description>",
      "actionSteps": ["<step 1>", "<step 2>", "<step 3>"],
      "timeline": "<suggested timeline>",
      "successMetrics": ["<metric 1>", "<metric 2>"]
    }
  ],
  "nextSteps": "<encouraging message about implementing these goals>"
}

Be specific, actionable, and inspiring. Focus on making goals achievable for youth and young adults.`;

    const userPrompt = `Original goals: ${originalGoals}

Questions asked: ${JSON.stringify(questions)}

User responses: ${JSON.stringify(responses)}

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
    const refinedText = data.choices[0].message.content;
    
    // Parse the JSON response
    let refined;
    try {
      const cleanedText = refinedText.replace(/```json\n?|\n?```/g, '').trim();
      refined = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', refinedText);
      throw new Error('AI returned invalid format');
    }

    console.log('Refinement complete');

    return new Response(
      JSON.stringify({ refined }),
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