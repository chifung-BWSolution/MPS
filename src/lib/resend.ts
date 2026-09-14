/** Placeholder from the Resend dashboard snippet. Never send with this value. */
export const RESEND_PLACEHOLDER_API_KEY = 're_xxxxxxxxx';

export const DEFAULT_RESEND_FROM = 'MPS <onboarding@resend.dev>';
export const DEFAULT_TEST_TO = 'brandingworks.online@gmail.com';

export type SendEmailInput = {
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
  const key = String(apiKey ?? '').trim();
  return Boolean(key) && key !== RESEND_PLACEHOLDER_API_KEY;
}

export function normalizeAddresses(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => String(item).trim()).filter(Boolean);
}

export function resolveFromAddress(from?: string | null, fallback = DEFAULT_RESEND_FROM): string {
  return String(from ?? '').trim() || fallback;
}

/** First-email payload from the Resend getting-started snippet. */
export function buildHelloWorldEmail(
  to: string = DEFAULT_TEST_TO,
  now = new Date(),
): SendEmailInput {
  const recipient = String(to).trim() || DEFAULT_TEST_TO;
  return {
    from: 'onboarding@resend.dev',
    to: recipient,
    subject: 'Hello World',
    html: '<p>Congrats on sending your <strong>first email</strong>!</p>',
    text: 'Congrats on sending your first email!',
    idempotencyKey: `hello-world/${recipient}/${now.toISOString().slice(0, 13)}`,
  };
}
