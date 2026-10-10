// Shared, dependency-free email logic used by the notification worker and
// admin email function. Kept pure so it can be unit tested with a mock fetch.

export const RESEND_GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
export const MAX_EMAIL_ATTEMPTS = 5;

/** Constant-time string comparison for secrets. */
export function safeEqual(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * Worker authorization. Never trusts a decoded (unverified) JWT role:
 * the bearer token must equal the real service-role key, or the
 * x-cron-secret header must equal the configured cron secret.
 */
export function isTrustedWorkerRequest(
  req: Request,
  serviceRoleKey: string | undefined,
  cronSecret: string | undefined,
) {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  return safeEqual(bearer, serviceRoleKey) || safeEqual(req.headers.get("x-cron-secret"), cronSecret);
}

/** Bounded exponential backoff: 5, 10, 20, 40 min ... capped at 6h. */
export function backoffMinutes(attempt: number) {
  return Math.min(5 * 2 ** Math.max(0, attempt - 1), 360);
}

export function nextRetryState(attemptCount: number, now = new Date()) {
  if (attemptCount >= MAX_EMAIL_ATTEMPTS) return { status: "failed" as const, nextAttemptAt: null };
  return {
    status: "pending" as const,
    nextAttemptAt: new Date(now.getTime() + backoffMinutes(attemptCount) * 60_000).toISOString(),
  };
}

/** Errors that will never succeed on retry (bad sender/domain, invalid input). */
export function isPermanentProviderError(status: number) {
  return status === 400 || status === 401 || status === 403 || status === 422;
}

export type EmailPrefs = {
  program_emails_enabled: boolean;
  session_reminders_enabled: boolean;
  accountability_reminders_enabled: boolean;
  referral_updates_enabled: boolean;
} | null;

/** Mirrors queue_user_notification preference rules; rechecked right before send. */
export function emailAllowedByPrefs(type: string, prefs: EmailPrefs) {
  if (!prefs) return true;
  if (!prefs.program_emails_enabled) return false;
  if (type.startsWith("referral_")) return prefs.referral_updates_enabled;
  if (type.startsWith("accountability_") || type.startsWith("coach_")) return prefs.accountability_reminders_enabled;
  if (type.startsWith("session_")) return prefs.session_reminders_enabled;
  return true;
}

/** Sender config. Returns null until a verified-domain sender is configured. */
export function resolveSender(emailFrom: string | undefined) {
  const value = (emailFrom ?? "").trim();
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  const address = (match ? match[1] : value).trim().toLowerCase();
  const domain = address.split("@")[1] ?? "";
  if (!domain || domain === "resend.dev") return null; // sandbox sender only reaches the account owner
  return { from: value, address, domain };
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Branded, accessible, responsive email shell. bodyHtml must already be escaped. */
export function renderEmail(opts: {
  appUrl: string;
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaPath: string;
  preheader?: string;
}) {
  const href = new URL(opts.ctaPath.startsWith("/") ? opts.ctaPath : "/journey", opts.appUrl).toString();
  const prefs = new URL("/profile#notifications", opts.appUrl).toString();
  const title = escapeHtml(opts.title);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:#1A2422;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(opts.preheader ?? opts.title)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border:1px solid #E4EEEC;border-radius:16px;">
          <tr><td style="background:#2C5F5D;border-radius:16px 16px 0 0;padding:18px 24px;">
            <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">DYP GOALS</p>
          </td></tr>
          <tr><td style="padding:28px 24px;">
            <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1B3F3E;">${title}</h1>
            <div style="font-size:16px;line-height:1.6;color:#1A2422;">${opts.bodyHtml}</div>
            <p style="margin:24px 0 0;">
              <a href="${href}" style="display:inline-block;background:#2C5F5D;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:8px;font-weight:700;font-size:16px;">${escapeHtml(opts.ctaLabel)}</a>
            </p>
            <p style="margin:16px 0 0;font-size:13px;color:#5C6E6C;">Or open: <a href="${href}" style="color:#2C5F5D;">${escapeHtml(href)}</a></p>
          </td></tr>
          <tr><td style="padding:16px 24px;border-top:1px solid #E4EEEC;font-size:12px;line-height:1.5;color:#5C6E6C;">
            You receive this because of activity on your DYP GOALS account.
            <a href="${prefs}" style="color:#2C5F5D;">Manage email preferences</a>.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export class ProviderError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Send through the Resend connector gateway with a provider idempotency key. */
export async function sendViaResend(
  args: {
    lovableApiKey?: string;
    resendApiKey?: string;
    from: string;
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
    replyTo?: string;
  },
  fetchImpl: typeof fetch = fetch,
) {
  if (!args.lovableApiKey) throw new ProviderError(0, "LOVABLE_API_KEY is not configured");
  if (!args.resendApiKey) throw new ProviderError(0, "Resend connection key is not configured");
  const response = await fetchImpl(`${RESEND_GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.lovableApiKey}`,
      "X-Connection-Api-Key": args.resendApiKey,
      "Idempotency-Key": args.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({
      from: args.from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      ...(args.replyTo ? { reply_to: args.replyTo } : {}),
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new ProviderError(response.status, `Resend [${response.status}]: ${text.slice(0, 1500)}`);
  }
  let id: string | null = null;
  try {
    id = JSON.parse(text)?.id ?? null;
  } catch { /* ignore */ }
  return { providerMessageId: id };
}
