import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const RequestSchema = z.object({
  action: z.enum(["start", "track", "upload", "submit"]),
  formId: z.string().uuid(),
  sessionToken: z.string().uuid().nullable().optional(),
  deviceType: z.enum(["mobile", "tablet", "desktop", "unknown"]).optional(),
  browserFamily: z.string().max(80).optional(),
  fieldId: z.string().uuid().nullable().optional(),
  eventType: z.enum(["view", "focus", "first_input", "change", "blur", "submit"]).optional(),
  elapsedMs: z.number().int().min(0).max(86400000).optional(),
  answers: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])).optional(),
  timings: z.record(z.object({ firstInputDelayMs: z.number().int().min(0).nullable(), activeTimeMs: z.number().int().min(0).nullable() })).optional(),
  fileName: z.string().trim().min(1).max(180).optional(),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]).optional(),
});

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) return respond({ error: "Invalid form request." }, 400);
    const body = parsed.data;
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: form } = await admin.from("program_forms").select("*").eq("id", body.formId).eq("status", "published").maybeSingle();
    const now = Date.now();
    if (!form || (form.opens_at && Date.parse(form.opens_at) > now) || (form.closes_at && Date.parse(form.closes_at) <= now) || (form.submission_deadline && Date.parse(form.submission_deadline) <= now)) return respond({ error: "This form is not accepting responses." }, 403);

    if (body.action === "start") {
      const { data, error } = await admin.from("program_form_sessions").insert({ form_id: form.id, device_type: body.deviceType ?? "unknown", browser_family: body.browserFamily ?? "unknown" }).select("session_token").single();
      if (error) throw error;
      return respond({ sessionToken: data.session_token });
    }
    if (!body.sessionToken) return respond({ error: "Missing form session." }, 400);
    const { data: session } = await admin.from("program_form_sessions").select("id,started_at,completed_at").eq("form_id", form.id).eq("session_token", body.sessionToken).maybeSingle();
    if (!session || session.completed_at) return respond({ error: "This form session is no longer active." }, 409);

    if (body.action === "upload") {
      if (!body.fieldId || !body.fileName || !body.contentType) return respond({ error: "Missing file details." }, 400);
      const { data: uploadField } = await admin.from("program_form_fields").select("id,field_type").eq("id", body.fieldId).eq("form_id", form.id).maybeSingle();
      if (!uploadField || uploadField.field_type !== "file") return respond({ error: "This upload field is not valid." }, 400);
      const extension = body.fileName.includes(".") ? body.fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "file";
      const path = `${form.id}/${session.id}/${body.fieldId}-${crypto.randomUUID()}.${extension || "file"}`;
      const { data, error } = await admin.storage.from("program-form-uploads").createSignedUploadUrl(path);
      if (error) throw error;
      return respond({ path, token: data.token });
    }

    if (body.action === "track") {
      if (!body.eventType) return respond({ error: "Missing interaction type." }, 400);
      await admin.from("program_form_events").insert({ form_id: form.id, session_id: session.id, field_id: body.fieldId ?? null, event_type: body.eventType, elapsed_ms: body.elapsedMs ?? 0 });
      await admin.from("program_form_sessions").update({ last_activity_at: new Date().toISOString() }).eq("id", session.id);
      return respond({ success: true });
    }

    const { count } = await admin.from("program_form_submissions").select("id", { count: "exact", head: true }).eq("form_id", form.id);
    if (form.response_limit && (count ?? 0) >= form.response_limit) return respond({ error: "This form has reached its response limit." }, 409);
    const { data: fields, error: fieldsError } = await admin.from("program_form_fields").select("*").eq("form_id", form.id).order("display_order");
    if (fieldsError) throw fieldsError;
    const answers = body.answers ?? {};
    for (const field of fields ?? []) {
      if (field.field_type === "section") continue;
      const value = answers[field.id];
      if (field.required && (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0))) return respond({ error: `${field.label} is required.` }, 400);
      if (field.field_type === "email" && typeof value === "string" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return respond({ error: `${field.label} must be a valid email address.` }, 400);
      const maxLength = Number((field.validation_rules as Record<string, unknown>)?.maxLength ?? 5000);
      if (typeof value === "string" && value.length > maxLength) return respond({ error: `${field.label} is too long.` }, 400);
    }
    const completionTime = Math.max(0, Date.now() - Date.parse(session.started_at));
    const { data: submission, error: submissionError } = await admin.from("program_form_submissions").insert({ form_id: form.id, session_id: session.id, completion_time_ms: completionTime }).select("id").single();
    if (submissionError) throw submissionError;
    const rows = (fields ?? []).filter((field) => field.field_type !== "section" && answers[field.id] !== undefined).map((field) => ({ submission_id: submission.id, field_id: field.id, answer: answers[field.id], first_input_delay_ms: body.timings?.[field.id]?.firstInputDelayMs ?? null, active_time_ms: body.timings?.[field.id]?.activeTimeMs ?? null }));
    if (rows.length) {
      const { error } = await admin.from("program_form_answers").insert(rows);
      if (error) throw error;
    }
    const completedAt = new Date().toISOString();
    await admin.from("program_form_sessions").update({ completed_at: completedAt, last_activity_at: completedAt }).eq("id", session.id);
    await admin.from("program_form_events").insert({ form_id: form.id, session_id: session.id, event_type: "submit", elapsed_ms: completionTime });
    return respond({ success: true, confirmationMessage: form.confirmation_message });
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : "Unable to process this form." }, 500);
  }
});