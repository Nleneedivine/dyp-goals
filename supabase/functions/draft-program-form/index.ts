import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const BodySchema = z.object({ description: z.string().trim().min(20).max(4000) });

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Sign in as an administrator to use AI drafting." }, 401);
    const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return jsonResponse({ error: "Your session has expired." }, 401);
    const { data: isAdmin } = await client.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return jsonResponse({ error: "Administrator access is required." }, 403);
    const limit = await rateLimit(req, "draft-program-form", 10, 60, user.id);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds, corsHeaders);
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return jsonResponse({ error: "Describe the program in at least 20 characters." }, 400);
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return jsonResponse({ error: "Lovable AI is not configured." }, 401);

    const prompt = `Create a concise application form draft for this program: ${parsed.data.description}
Return only JSON with this shape: {"title":"string","description":"string","fields":[{"field_type":"text|textarea|email|phone|number|date|dropdown|multi_select|checkbox|radio|file|rating|section","label":"string","helper_text":"string","placeholder":"string","required":true,"options":["string"]}]}. Use 6-12 purposeful fields. Every object property must be present. Use [] for options when not applicable.`;
    const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({ model: "openai/gpt-6-astra", input: prompt, stream: true, reasoning: { effort: "medium", summary: "auto" }, include: ["reasoning.encrypted_content"], text: { format: { type: "json_object" } } }),
    });
    if (!response.ok) {
      const message = await response.text();
      return jsonResponse({ error: message || "AI drafting failed." }, response.status);
    }
    const reader = response.body?.getReader();
    if (!reader) return jsonResponse({ error: "AI returned no response." }, 500);
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("
");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const event = JSON.parse(data);
          if (event.type === "response.output_text.delta" && typeof event.delta === "string") text += event.delta;
        } catch { /* partial event */ }
      }
    }
    if (!text) return jsonResponse({ error: "AI completed without a form draft." }, 502);
    const DraftSchema = z.object({
      title: z.string().trim().min(1).max(160),
      description: z.string().max(3000),
      fields: z.array(z.object({
        field_type: z.enum(["text","textarea","email","phone","number","date","dropdown","multi_select","checkbox","radio","file","rating","section"]),
        label: z.string().trim().min(1).max(180),
        helper_text: z.string().max(500),
        placeholder: z.string().max(300),
        required: z.boolean(),
        options: z.array(z.string().max(180)).max(30),
      })).min(1).max(20),
    });
    const draft = DraftSchema.safeParse(JSON.parse(text));
    if (!draft.success) {
      console.error("AI form draft failed schema validation:", draft.error.flatten());
      return jsonResponse({ error: "AI returned an invalid form draft." }, 502);
    }
    return jsonResponse({ draft: draft.data });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unable to draft the form." }, 500);
  }
});