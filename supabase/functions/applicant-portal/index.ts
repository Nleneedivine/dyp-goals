import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const RequestSchema = z.object({\n  token: z.string().regex(/^[a-f0-9]{64}$/i),\n  action: z.enum(["resolve", "payment-state", "referral-code"]).default("resolve"),\n});
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ valid: false }, 405);
  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) return respond({ valid: false }, 400);
    const tokenHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parsed.data.token.toLowerCase()));
    const hashHex = Array.from(new Uint8Array(tokenHash), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const ipLimit = await rateLimit(req, "applicant-portal-resolve-ip", 30, 60);
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterSeconds, corsHeaders);
    const tokenLimit = await rateLimit(req, "applicant-portal-resolve-token", 20, 60, hashHex);
    if (!tokenLimit.allowed) return rateLimitResponse(tokenLimit.retryAfterSeconds, corsHeaders);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: portal, error } = await admin.rpc("get_applicant_portal_state", { p_token_hash: hashHex });
    if (error) throw error;
    if (!portal?.valid || !portal?.sessionToken) return respond({ valid: false }, 404);

    if (parsed.data.action === "resolve") {
      // Never return the underlying form session token to the browser.
      const { sessionToken: _sessionToken, ...safePortal } = portal;
      return respond(safePortal);
    }

    if (parsed.data.action === "payment-state") {
      const { data: payment, error: paymentError } = await admin.rpc("get_program_payment_state", {
        p_session_token: portal.sessionToken,
      });
      if (paymentError) throw paymentError;
      return respond({ valid: true, payment: payment ?? null });
    }

    const { data: referral, error: referralError } = await admin.rpc("get_program_referral_code", {
      p_session_token: portal.sessionToken,
    });
    if (referralError) throw referralError;
    return respond({ valid: true, referralCode: typeof referral === "string" ? referral : null });
  } catch {
    return respond({ valid: false }, 400);
  }
});
