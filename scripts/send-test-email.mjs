#!/usr/bin/env node
/**
 * Send the Resend Hello World email.
 *
 * Direct SDK (replace re_xxxxxxxxx with your real API key):
 *   RESEND_API_KEY=re_xxxxxxxxx node scripts/send-test-email.mjs
 *
 * Deployed Edge Function fallback:
 *   node scripts/send-test-email.mjs brandingworks.online@gmail.com
 *
 * Env for Edge Function fallback:
 *   MPS_URL or SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   MPS_SERVICE or MPS_ANON / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY
 */
import { Resend } from 'resend';

const to = process.argv[2] || 'brandingworks.online@gmail.com';
const apiKey = String(process.env.RESEND_API_KEY || '').trim();

if (apiKey === 're_xxxxxxxxx') {
  console.error('Replace re_xxxxxxxxx with your real API key from https://resend.com/api-keys');
  process.exit(1);
}

if (apiKey) {
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send(
    {
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to,
      subject: 'Hello World',
      html: '<p>Congrats on sending your <strong>first email</strong>!</p>',
      text: 'Congrats on sending your first email!',
    },
    { idempotencyKey: `hello-world/${to}/${new Date().toISOString().slice(0, 13)}` },
  );

  if (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }

  console.log('Sent:', data);
  process.exit(0);
}

const supabaseUrl =
  process.env.MPS_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const key =
  process.env.MPS_SERVICE ||
  process.env.MPS_ANON ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

if (!supabaseUrl || !key) {
  console.error(
    'Set RESEND_API_KEY=re_xxxxxxxxx (then replace with your real key), or set MPS_URL + MPS_SERVICE for the Edge Function.',
  );
  process.exit(1);
}

const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/send-email`;
const body = {
  from: 'onboarding@resend.dev',
  to,
  subject: 'Hello World',
  html: '<p>Congrats on sending your <strong>first email</strong>!</p>',
  text: 'Congrats on sending your first email!',
  idempotencyKey: `hello-world/${to}/${new Date().toISOString().slice(0, 13)}`,
};

const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    apikey: key,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const json = await res.json().catch(() => ({}));
if (!res.ok || json.error) {
  console.error('Failed:', res.status, json);
  process.exit(1);
}

console.log('Sent:', json);
