import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { resolveSender, sendViaResend } from "../_shared/emailCore.ts";
import { z } from "npm:zod@3";

const DIRECT_API_KEY = Deno.env.get("RESEND_DIRECT_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_1") ?? Deno.env.get("RESEND_API_KEY");
const TO_ADDRESS = "discoverpurpose1@gmail.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(1).max(300),
  message: z.string().trim().min(1).max(5000),
});

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const limit = await rateLimit(req, "send-contact-email", 5, 3600);
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds, corsHeaders);

    if (!DIRECT_API_KEY && !LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!DIRECT_API_KEY && !RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const parsed = ContactSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid contact request" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const { name, email, subject, message } = parsed.data;

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#a78bfa;margin:0 0 16px;">New Contact Form Message</h2>
        <p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
        <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <hr style="border:none;border-top:1px solid #ddd;margin:16px 0;" />
        <p style="white-space:pre-wrap;line-height:1.6;">${escapeHtml(message)}</p>
      </div>`;

    const sender = resolveSender(Deno.env.get("EMAIL_FROM"));
    if (!sender) return new Response(JSON.stringify({ error: "Contact email is temporarily unavailable. Please email discoverpurpose1@gmail.com directly." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    await sendViaResend({ directApiKey: DIRECT_API_KEY, lovableApiKey: LOVABLE_API_KEY, resendApiKey: RESEND_API_KEY, from: sender.from,
      to: TO_ADDRESS, replyTo: email, subject: `[Contact] ${subject}`, html, idempotencyKey: `contact:${crypto.randomUUID()}` });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending contact email:", error);
    return new Response(JSON.stringify({ error: "Unable to send your message. Please email discoverpurpose1@gmail.com directly." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
