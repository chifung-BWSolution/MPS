import { Resend } from "npm:resend";

export const RESEND_PLACEHOLDER_API_KEY = "re_xxxxxxxxx";
export const DEFAULT_RESEND_FROM = "MPS <onboarding@resend.dev>";

export type SendResendEmailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  idempotencyKey?: string;
};

export function isResendApiKeyConfigured(apiKey?: string | null): boolean {
  const key = String(apiKey ?? "").trim();
  return Boolean(key) && key !== RESEND_PLACEHOLDER_API_KEY;
}

export function getResendApiKey(): string | null {
  return Deno.env.get("RESEND_API_KEY")?.trim() || null;
}

export function defaultFromEmail(): string {
  return Deno.env.get("RESEND_FROM_EMAIL")?.trim() || DEFAULT_RESEND_FROM;
}

export function normalizeAddresses(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => String(item).trim()).filter(Boolean);
}

export function resendStatus() {
  return {
    configured: isResendApiKeyConfigured(getResendApiKey()),
    from: defaultFromEmail(),
  };
}

/** Single send path for every Edge Function. */
export async function sendResendEmail(input: SendResendEmailInput) {
  const apiKey = getResendApiKey();
  if (!isResendApiKeyConfigured(apiKey)) {
    throw new Error(
      "RESEND_API_KEY is not configured. Replace re_xxxxxxxxx with your real API key, then run: supabase secrets set RESEND_API_KEY=re_xxx",
    );
  }

  const to = normalizeAddresses(input.to);
  const subject = String(input.subject ?? "").trim();
  const html = input.html ? String(input.html) : undefined;
  const text = input.text ? String(input.text) : undefined;
  const from = String(input.from ?? "").trim() || defaultFromEmail();
  const cc = normalizeAddresses(input.cc);
  const bcc = normalizeAddresses(input.bcc);
  const replyTo = normalizeAddresses(input.replyTo);

  if (!to.length) throw new Error("to is required");
  if (!subject) throw new Error("subject is required");
  if (!html && !text) throw new Error("html or text is required");

  const payload: {
    from: string;
    to: string[];
    subject: string;
    html?: string;
    text?: string;
    cc?: string[];
    bcc?: string[];
    replyTo?: string[];
  } = { from, to, subject };
  if (html) payload.html = html;
  if (text) payload.text = text;
  if (cc.length) payload.cc = cc;
  if (bcc.length) payload.bcc = bcc;
  if (replyTo.length) payload.replyTo = replyTo;

  const idempotencyKey = String(input.idempotencyKey ?? "").trim().slice(0, 256);
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send(
    payload,
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  if (error) {
    throw new Error(error.message || "Resend API error");
  }

  return {
    id: data?.id ?? null,
    from,
    to,
    subject,
  };
}
