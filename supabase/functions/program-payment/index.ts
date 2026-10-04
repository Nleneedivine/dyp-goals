import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const RequestSchema = z.object({
  action: z.enum(["initialize", "verify", "prepare-proof-upload"]),
  sessionToken: z.string().uuid().optional(),
  reference: z.string().min(6).max(120).optional(),
  returnUrl: z.string().url().optional(),
  fileName: z.string().min(1).max(180).optional(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
});

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const verifyPaystackSignature = async (
  rawBody: Uint8Array,
  signature: string,
  secret: string,
) => {
  const secretBytes = new TextEncoder().encode(secret);
  const secretBuffer = secretBytes.buffer.slice(
    secretBytes.byteOffset,
    secretBytes.byteOffset + secretBytes.byteLength,
  ) as ArrayBuffer;
  const payloadBuffer = rawBody.buffer.slice(
    rawBody.byteOffset,
    rawBody.byteOffset + rawBody.byteLength,
  ) as ArrayBuffer;

  const key = await crypto.subtle.importKey(
    "raw",
    secretBuffer,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, payloadBuffer);
  return hex(digest).toLowerCase() === signature.toLowerCase();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const secret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const signature = req.headers.get("x-paystack-signature");

    // Paystack webhook: verify cryptographic signature before trusting the event.
    if (signature) {
      if (!secret) return respond({ error: "Paystack is not configured." }, 503);
      const raw = new Uint8Array(await req.arrayBuffer());
      if (!(await verifyPaystackSignature(raw, signature, secret))) {
        return respond({ error: "Invalid webhook signature." }, 401);
      }

      const event = JSON.parse(new TextDecoder().decode(raw));
      if (event?.event !== "charge.success") {
        return respond({ received: true });
      }

      const reference = String(event?.data?.reference ?? "");
      const amount = Number(event?.data?.amount ?? 0);
      const currency = String(event?.data?.currency ?? "");

      const { data: payment } = await admin
        .from("program_payments")
        .select("submission_id,amount_minor,currency,status")
        .eq("provider_reference", reference)
        .maybeSingle();

      if (
        payment &&
        payment.status !== "paid" &&
        Number(payment.amount_minor) === amount &&
        payment.currency === currency
      ) {
        await admin
          .from("program_payments")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("submission_id", payment.submission_id);
      }

      return respond({ received: true });
    }

    const limit = await rateLimit(req, "program-payment", 30, 600);
    if (!limit.allowed) {
      return rateLimitResponse(limit.retryAfterSeconds, corsHeaders);
    }

    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return respond({ error: "Invalid payment request." }, 400);
    }

    if (!secret) {
      return respond({ error: "Paystack is not configured yet." }, 503);
    }

    const body = parsed.data;

    if (body.action === "prepare-proof-upload") {
      if (!body.sessionToken || !body.fileName || !body.contentType) {
        return respond({ error: "Missing payment proof upload details." }, 400);
      }

      const { data: session } = await admin
        .from("program_form_sessions")
        .select("id,form_id,completed_at")
        .eq("session_token", body.sessionToken)
        .maybeSingle();

      if (!session?.completed_at) {
        return respond({ error: "Complete registration before uploading payment proof." }, 409);
      }

      const { data: submission } = await admin
        .from("program_form_submissions")
        .select("id,form_id")
        .eq("session_id", session.id)
        .maybeSingle();

      if (!submission) {
        return respond({ error: "Registration submission not found." }, 404);
      }

      const { data: settings } = await admin
        .from("program_payment_settings")
        .select("manual_enabled")
        .eq("form_id", submission.form_id)
        .maybeSingle();

      if (!settings?.manual_enabled) {
        return respond({ error: "Manual payment is not enabled." }, 409);
      }

      const extension =
        body.contentType === "image/png"
          ? "png"
          : body.contentType === "image/webp"
            ? "webp"
            : "jpg";
      const path = `${submission.id}/${crypto.randomUUID()}.${extension}`;

      const { data: signedUpload, error: signedUploadError } = await admin.storage
        .from("payment-proofs")
        .createSignedUploadUrl(path);

      if (signedUploadError || !signedUpload?.token) {
        return respond(
          { error: signedUploadError?.message ?? "Unable to prepare payment proof upload." },
          500,
        );
      }

      return respond({
        path,
        token: signedUpload.token,
      });
    }

    if (body.action === "initialize") {
      if (!body.sessionToken || !body.returnUrl) {
        return respond({ error: "Missing registration payment details." }, 400);
      }

      const { data: session } = await admin
        .from("program_form_sessions")
        .select("id,form_id,completed_at")
        .eq("session_token", body.sessionToken)
        .maybeSingle();

      if (!session?.completed_at) {
        return respond({ error: "Complete registration before payment." }, 409);
      }

      const { data: submission } = await admin
        .from("program_form_submissions")
        .select("id,form_id")
        .eq("session_id", session.id)
        .maybeSingle();

      if (!submission) {
        return respond({ error: "Registration submission not found." }, 404);
      }

      const { data: settings } = await admin
        .from("program_payment_settings")
        .select("amount_minor,currency,paystack_enabled")
        .eq("form_id", submission.form_id)
        .maybeSingle();

      if (!settings?.paystack_enabled) {
        return respond({ error: "Paystack payment is not enabled." }, 409);
      }

      const { data: existing } = await admin
        .from("program_payments")
        .select("status,provider_reference")
        .eq("submission_id", submission.id)
        .maybeSingle();

      if (existing?.status === "paid") {
        return respond({ error: "This registration is already paid." }, 409);
      }

      const { data: form } = await admin
        .from("program_forms")
        .select("slug")
        .eq("id", submission.form_id)
        .single();

      if (!form?.slug) {
        return respond({ error: "Registration form configuration was not found." }, 500);
      }

      const { data: emailField } = await admin
        .from("program_form_fields")
        .select("id")
        .eq("form_id", submission.form_id)
        .eq("field_type", "email")
        .order("display_order")
        .limit(1)
        .maybeSingle();

      const { data: emailAnswer } = emailField
        ? await admin
            .from("program_form_answers")
            .select("answer")
            .eq("submission_id", submission.id)
            .eq("field_id", emailField.id)
            .maybeSingle()
        : { data: null };

      const email =
        typeof emailAnswer?.answer === "string"
          ? emailAnswer.answer
          : String(emailAnswer?.answer ?? "").replace(/^"|"$/g, "");

      if (!email || !email.includes("@")) {
        return respond({ error: "A valid registration email is required for Paystack." }, 400);
      }

      const reference =
        existing?.provider_reference ||
        `DYP-${Date.now()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;

      const callback = new URL(body.returnUrl);
      callback.searchParams.set("payment_reference", reference);

      const initResponse = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: String(settings.amount_minor),
          currency: settings.currency,
          reference,
          callback_url: callback.toString(),
          metadata: JSON.stringify({
            submission_id: submission.id,
            form_id: submission.form_id,
            form_slug: form.slug,
          }),
        }),
      });

      const initPayload = await initResponse.json();
      if (!initResponse.ok || !initPayload?.status || !initPayload?.data?.authorization_url) {
        return respond(
          { error: initPayload?.message ?? "Unable to initialize Paystack payment." },
          502,
        );
      }

      await admin.from("program_payments").upsert(
        {
          submission_id: submission.id,
          form_id: submission.form_id,
          method: "paystack",
          status: "pending",
          amount_minor: settings.amount_minor,
          currency: settings.currency,
          provider_reference: reference,
          manual_reference: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "submission_id" },
      );

      return respond({
        authorizationUrl: initPayload.data.authorization_url,
        reference,
      });
    }

    if (!body.reference) {
      return respond({ error: "Missing Paystack reference." }, 400);
    }

    const { data: payment } = await admin
      .from("program_payments")
      .select("submission_id,form_id,amount_minor,currency,status")
      .eq("provider_reference", body.reference)
      .maybeSingle();

    if (!payment) {
      return respond({ error: "Payment reference not found." }, 404);
    }

    const verifyResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(body.reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const verifyPayload = await verifyResponse.json();

    const verified =
      verifyResponse.ok &&
      verifyPayload?.status === true &&
      verifyPayload?.data?.status === "success" &&
      String(verifyPayload?.data?.reference) === body.reference &&
      Number(verifyPayload?.data?.amount) === Number(payment.amount_minor) &&
      String(verifyPayload?.data?.currency) === payment.currency;

    if (!verified) {
      return respond({
        paid: false,
        status: verifyPayload?.data?.status ?? "pending",
      });
    }

    await admin
      .from("program_payments")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("submission_id", payment.submission_id);

    const { data: settings } = await admin
      .from("program_payment_settings")
      .select("whatsapp_group_url")
      .eq("form_id", payment.form_id)
      .maybeSingle();

    return respond({
      paid: true,
      whatsappGroupUrl: settings?.whatsapp_group_url ?? "",
    });
  } catch (error) {
    return respond(
      { error: error instanceof Error ? error.message : "Unable to process payment." },
      500,
    );
  }
});
