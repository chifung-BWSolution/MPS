import { supabase } from '@/lib/supabase';

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

export type SendEmailResult = {
  success: boolean;
  id: string | null;
  from: string;
  to: string[];
  subject: string;
};

type EdgeFunctionResponse = SendEmailResult & {
  error?: string;
  details?: unknown;
};

async function invokeSendEmail(body: SendEmailInput): Promise<SendEmailResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token || supabaseAnonKey;
  const url = `${supabaseUrl}/functions/v1/send-email`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as EdgeFunctionResponse;
  if (!res.ok || json.error) {
    throw new Error(String(json.error || `${res.status} ${res.statusText}`));
  }

  return {
    success: Boolean(json.success),
    id: json.id ?? null,
    from: json.from,
    to: json.to,
    subject: json.subject,
  };
}

/** Send a transactional email via the Resend-backed Edge Function. */
export function sendEmail(input: SendEmailInput) {
  return invokeSendEmail(input);
}

/** Convenience helper for a one-off MPS test email. */
export function sendTestEmail(to: string) {
  return sendEmail({
    to,
    subject: 'MPS Resend test',
    html: `
      <div style="font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.5;">
        <p>This is a test email from <strong>MPS</strong> via Resend.</p>
        <p>If you received this, the Resend integration is working.</p>
      </div>
    `,
    text: 'This is a test email from MPS via Resend. If you received this, the Resend integration is working.',
    idempotencyKey: `mps-test-email/${to}/${new Date().toISOString().slice(0, 13)}`,
  });
}
