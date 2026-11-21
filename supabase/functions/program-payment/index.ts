import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { rateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const RequestSchema = z.object({
  action: z.enum(["initialize", "verify", "prepare-proof-upload", "submit-proof"]),
  portalToken: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  reference: z.string().min(6).max(120).optional(),
  returnUrl: z.string().url().optional(),
  fileName: z.string().min(1).max(180).optional(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
  fileSize: z.number().int().positive().max(8 * 1024 * 1024).optional(),
  proofPath: z.string().min(1).max(300).optional(),
  manualReference: z.string().min(3).max(180).optional(),
});

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const hasExpectedImageSignature = async (blob: Blob, contentType: string) => {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
};

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

    if (!secret && (parsed.data.action === "initialize" || parsed.data.action === "verify")) {
      return respond({ error: "Paystack is not configured yet." }, 503);
    }

    const body = parsed.data;
    let sessionToken: string | undefined;

    if (body.portalToken) {
      const tokenDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.portalToken.toLowerCase()));
      const tokenHash = hex(tokenDigest);
      const { data: portal, error: portalError } = await admin.rpc("get_applicant_portal_state", { p_token_hash: tokenHash });
      if (portalError) throw portalError;
      if (!portal?.valid || !portal?.sessionToken) return respond({ error: "Applicant portal link is invalid, expired or revoked." }, 401);
      sessionToken = portal.sessionToken;
      const tokenLimit = await rateLimit(req, "program-payment-portal-token", 20, 60, tokenHash);
      if (!tokenLimit.allowed) return rateLimitResponse(tokenLimit.retryAfterSeconds, corsHeaders);
    }

    if (!sessionToken) {
      return respond({ error: "A valid applicant portal token is required." }, 400);
    }

    if (body.action === "prepare-proof-upload") {
      if (!sessionToken || !body.fileName || !body.contentType || !body.fileSize) {
        return respond({ error: "Missing payment proof upload details." }, 400);
      }
      if (body.fileSize < 20 * 1024) {
        return respond({ error: "Payment proof image must be at least 20 KB." }, 400);
      }

      const { data: session } = await admin
        .from("program_form_sessions")
        .select("id,form_id,completed_at")
        .eq("session_token", sessionToken)
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

      const { data: existingPayment, error: existingPaymentError } = await admin
        .from("program_payments")
        .select("status")
        .eq("submission_id", submission.id)
        .maybeSingle();

      if (existingPaymentError) throw existingPaymentError;
      if (existingPayment?.status === "paid") {
        return respond({ error: "This payment has already been verified; proof cannot be replaced." }, 409);
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

    if (body.action === "submit-proof") {
      if (!body.proofPath || !body.manualReference || !body.contentType) {
        return respond({ error: "Missing payment proof details." }, 400);
      }

      const extensionByType: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
      };
      const { data: proofSession, error: proofSessionError } = await admin
        .from("program_form_sessions")
        .select("id")
        .eq("session_token", sessionToken)
        .maybeSingle();
      if (proofSessionError) throw proofSessionError;
      const { data: proofSubmission, error: proofSubmissionError } = proofSession
        ? await admin.from("program_form_submissions").select("id").eq("session_id", proofSession.id).maybeSingle()
        : { data: null, error: null };
      if (proofSubmissionError) throw proofSubmissionError;
      if (!proofSubmission) return respond({ error: "Registration submission not found." }, 404);

      const expectedPath = new RegExp(
        "^" + proofSubmission.id + "/[0-9a-f-]{36}\\.(jpg|png|webp)$",
        "i",
      );
      if (!expectedPath.test(body.proofPath)) {
        return respond({ error: "Invalid payment proof path." }, 400);
      }

      const { data: proofObject, error: proofDownloadError } = await admin.storage
        .from("payment-proofs")
        .download(body.proofPath);
      if (proofDownloadError || !proofObject) {
        return respond({ error: "Payment proof upload was not found. Please upload it again." }, 400);
      }
      const expectedExtension = extensionByType[body.contentType];
      const actualExtension = body.proofPath.split(".").pop()?.toLowerCase();
      if (
        proofObject.size < 20 * 1024 ||
        proofObject.size > 8 * 1024 * 1024 ||
        proofObject.type !== body.contentType ||
        actualExtension !== expectedExtension ||
        !(await hasExpectedImageSignature(proofObject, body.contentType))
      ) {
        return respond({ error: "Uploaded proof does not match the allowed file type or size." }, 400);
      }

      const { data: result, error: submitError } = await admin.rpc("submit_manual_program_payment_with_proof", {
        p_session_token: sessionToken,
        p_manual_reference: body.manualReference,
        p_proof_path: body.proofPath,
        p_proof_content_type: body.contentType,
      });
      if (submitError) return respond({ error: submitError.message }, 400);
      return respond({ payment: result ?? null });
    }

    if (body.action === "initialize") {
      if (!sessionToken || !body.returnUrl) {
        return respond({ error: "Missing registration payment details." }, 400);
      }

      const { data: session } = await admin
        .from("program_form_sessions")
        .select("id,form_id,completed_at")
        .eq("session_token", sessionToken)
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

    const { data: verifiedSession, error: sessionError } = await admin
      .from("program_form_sessions")
      .select("id")
      .eq("session_token", sessionToken)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!verifiedSession) return respond({ error: "Applicant registration could not be verified." }, 404);

    const { data: verifiedSubmission, error: submissionError } = await admin
      .from("program_form_submissions")
      .select("id")
      .eq("session_id", verifiedSession.id)
      .maybeSingle();

    if (submissionError) throw submissionError;
    if (!verifiedSubmission) return respond({ error: "Applicant submission could not be verified." }, 404);

    const { data: payment, error: paymentLookupError } = await admin
      .from("program_payments")
      .select("submission_id,form_id,amount_minor,currency,status")
      .eq("provider_reference", body.reference)
      .eq("submission_id", verifiedSubmission.id)
      .maybeSingle();

    if (paymentLookupError) throw paymentLookupError;
    if (!payment) {
      return respond({ error: "Payment reference not found for this applicant." }, 404);
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

    const { data: admission } = await admin
      .from("program_application_admissions")
      .select("status")
      .eq("submission_id", payment.submission_id)
      .maybeSingle();

    const mayReceiveProgrammeAccess = !admission || admission.status === "admitted";
    const { data: settings } = mayReceiveProgrammeAccess
      ? await admin
          .from("program_payment_settings")
          .select("whatsapp_group_url")
          .eq("form_id", payment.form_id)
          .maybeSingle()
      : { data: null };

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
