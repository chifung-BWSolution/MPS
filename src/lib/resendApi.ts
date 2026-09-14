import { supabase } from '@/lib/supabase';
import {
  buildHelloWorldEmail,
  type SendEmailInput,
} from '@/lib/resend';

export type { SendEmailInput };

export type SendEmailResult = {
  success: boolean;
  id: string | null;
  from: string;
  to: string[];
  subject: string;
};

export type ResendStatus = {
  configured: boolean;
  from: string;
};

type EdgeFunctionResponse = SendEmailResult & ResendStatus & {
  error?: string;
  details?: unknown;
};

async function invokeSendEmailFunction(
  method: 'GET' | 'POST',
  body?: SendEmailInput,
): Promise<EdgeFunctionResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token || supabaseAnonKey;
  const url = `${supabaseUrl}/functions/v1/send-email`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json().catch(() => ({}))) as EdgeFunctionResponse;
  if (!res.ok || json.error) {
    throw new Error(String(json.error || `${res.status} ${res.statusText}`));
  }
  return json;
}

export async function getResendStatus(): Promise<ResendStatus> {
  const json = await invokeSendEmailFunction('GET');
  return {
    configured: Boolean(json.configured),
    from: json.from,
  };
}

/** Send a transactional email via the Resend-backed Edge Function. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const json = await invokeSendEmailFunction('POST', input);
  return {
    success: Boolean(json.success),
    id: json.id ?? null,
    from: json.from,
    to: json.to,
    subject: json.subject,
  };
}

/** Resend Hello World test email. */
export function sendTestEmail(to: string) {
  return sendEmail(buildHelloWorldEmail(to));
}
