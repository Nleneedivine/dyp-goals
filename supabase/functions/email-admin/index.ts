import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { resolveSender, renderEmail, sendViaResend } from "../_shared/emailCore.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ error: "Sign in required" }, 401);
    const { data: allowed, error: roleError } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (roleError || allowed !== true) return json({ error: "Admin role required" }, 403);
    const body = await req.json();
    const sender = resolveSender(Deno.env.get("EMAIL_FROM"));
    const directApiKey = Deno.env.get("RESEND_DIRECT_API_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY_1") ?? Deno.env.get("RESEND_API_KEY");
    if (body.action === "status") return json({ sender_configured: !!sender, sender: sender?.from ?? null, provider_configured: !!directApiKey || (!!lovableApiKey && !!resendApiKey), provider: directApiKey ? "Resend" : "Resend via Lovable", domain_verification: "Verify the domain in the provider dashboard; sender configuration does not prove DNS verification" });
    if (body.action !== "test") return json({ error: "Unknown action" }, 400);
    const limit = await rateLimit(req, "email-admin-test", 3, 3600, user.id);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds, cors);
    if (!sender || (!directApiKey && (!lovableApiKey || !resendApiKey))) return json({ error: "Set up a verified sending domain and provider first" }, 409);
    if (!user.email || !user.email_confirmed_at) return json({ error: "Your admin account needs a confirmed email" }, 409);
    // Recipient is derived from the verified JWT, never client-supplied.
    const receipt = await sendViaResend({ directApiKey, lovableApiKey, resendApiKey, from: sender.from, to: user.email,
      subject: "DYP GOALS email system test", html: renderEmail({ appUrl: "https://dyp-goals.lovable.app", title: "Your email system test", bodyHtml: "<p>You requested this test from Admin.</p>", ctaLabel: "Open Email system", ctaPath: "/admin/email" }), idempotencyKey: `admin-test:${user.id}:${Math.floor(Date.now() / 60_000)}` });
    return json({ accepted: true, provider_message_id: receipt.providerMessageId, delivery_confirmed: false });
  } catch (error) {
    console.error("Email admin request failed", error);
    return json({ error: "Email action failed. Check sender setup and backend logs." }, 500);
  }
});
