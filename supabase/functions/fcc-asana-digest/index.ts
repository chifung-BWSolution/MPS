import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rescheduleFccAsanaDigest, sendFccAsanaDigestIfDue, sendFccAsanaDigestTest } from "../_shared/fcc-asana-digest-send.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jwtPayload(token: string): { role?: string; ref?: string } | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const pad = part.length % 4 === 0 ? "" : "=".repeat(4 - (part.length % 4));
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/") + pad));
  } catch {
    return null;
  }
}

function bearer(req: Request): string {
  return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

async function serviceAllowed(token: string): Promise<boolean> {
  if (!token) return false;
  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) return true;
  const payload = jwtPayload(token);
  if (payload?.role !== "service_role") return false;
  const ref = String(payload.ref || "");
  if (ref && SUPABASE_URL && !SUPABASE_URL.includes(ref)) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/asana_mail_rules?select=code&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

async function userAllowed(token: string): Promise<boolean> {
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  return !error && Boolean(data.user);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Missing SUPABASE_URL or service role key" });
  const token = bearer(req);
  const body = await req.json().catch(() => ({})) as { action?: string; to?: string };
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    if (body.action === "test" || body.action === "reschedule") {
      if (!await userAllowed(token)) return json(401, { error: "Invalid session" });
      if (body.action === "test") return json(200, await sendFccAsanaDigestTest(supabase, String(body.to || "")));
      return json(200, await rescheduleFccAsanaDigest(supabase));
    }
    if (!await serviceAllowed(token)) return json(401, { error: "Invalid session" });
    return json(200, await sendFccAsanaDigestIfDue(supabase));
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
