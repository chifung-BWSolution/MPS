#!/usr/bin/env node
/**
 * Send a test email through the deployed send-email Edge Function.
 *
 * Usage:
 *   node scripts/send-test-email.mjs brandingworks.online@gmail.com
 *
 * Env:
 *   MPS_URL or SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   MPS_ANON or SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   MPS_SERVICE (optional, preferred for script auth)
 */

const to = process.argv[2] || 'brandingworks.online@gmail.com';
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
  console.error('Missing MPS_URL/SUPABASE_URL or MPS_SERVICE/anon key env vars.');
  process.exit(1);
}

const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/send-email`;
const body = {
  to,
  subject: 'MPS Resend test',
  html: `<p>This is a test email from <strong>MPS</strong> via Resend.</p><p>If you received this, the Resend integration is working.</p>`,
  text: 'This is a test email from MPS via Resend. If you received this, the Resend integration is working.',
  idempotencyKey: `mps-test-email/${to}/${new Date().toISOString()}`,
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
