import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function rateLimit(
  req: Request,
  bucket: string,
  limit: number,
  windowSeconds: number,
  identity?: string,
) {
  const rawIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  const subject = identity ?? rawIp + "|" + userAgent;
  const rateKey = bucket + ":" + await sha256(subject);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await admin.rpc("consume_edge_rate_limit", {
    p_rate_key: rateKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("Rate limit check failed:", error);
    throw new Error("Rate limit service unavailable");
  }

  const result = data?.[0];
  return {
    allowed: result?.allowed === true,
    remaining: Number(result?.remaining ?? 0),
    retryAfterSeconds: Number(result?.retry_after_seconds ?? windowSeconds),
  };
}

export function rateLimitResponse(retryAfterSeconds: number, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(Math.max(1, retryAfterSeconds)),
      },
    },
  );
}
