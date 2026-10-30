import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Logged-in proxy for the PMS BWA projects API.
 * The key stays in the BWA_PROJECTS_API_KEY secret and is never returned to the browser.
 * Docs: https://bwteam-project.com/bwa-projects-api
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UPSTREAM = "https://bwteam-project.com/api/bwa-projects";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

type Body = {
  action?: string;
  id?: string;
  youtube_url?: unknown;
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearerToken(req: Request): string {
  const header = req.headers.get("Authorization") || "";
  return header.replace(/^Bearer\s+/i, "").trim();
}

function isServiceRoleToken(token: string): boolean {
  return !!token && !!SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY;
}

async function requireUser(req: Request): Promise<Response | null> {
  const token = bearerToken(req);
  if (!token) return json(401, { ok: false, code: "invalid_session", error: "Missing authorization" });
  if (isServiceRoleToken(token)) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json(500, { ok: false, code: "internal_error", error: "Missing Supabase auth configuration" });
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) {
    return json(401, { ok: false, code: "invalid_session", error: "Invalid session" });
  }
  return null;
}

async function forward(url: string, init: RequestInit) {
  const apiKey = Deno.env.get("BWA_PROJECTS_API_KEY")?.trim() || "";
  if (!apiKey) {
    return json(503, {
      ok: false,
      code: "service_unavailable",
      error: "BWA_PROJECTS_API_KEY is not configured",
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      ...init,
      headers: {
        "X-App-Key": apiKey,
        Accept: "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (error) {
    console.error("[bwa-projects] upstream fetch failed:", (error as Error).message);
    return json(502, { ok: false, code: "internal_error", error: "無法連線 BWA 項目 API" });
  }

  const text = await upstream.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      console.error("[bwa-projects] upstream returned non-JSON", upstream.status);
      return json(502, { ok: false, code: "internal_error", error: "BWA 項目 API 回應無法讀取" });
    }
  }
  return json(upstream.status, payload);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  const authError = await requireUser(req);
  if (authError) return authError;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { ok: false, code: "invalid_json", error: "Invalid JSON" });
  }

  if (body.action === "list") {
    return forward(UPSTREAM, { method: "GET" });
  }

  if (body.action === "update_youtube") {
    const id = (body.id || "").trim();
    if (!UUID_RE.test(id)) {
      return json(400, { ok: false, code: "invalid_json", error: "Project id must be a UUID" });
    }
    if (!(body.youtube_url === null || typeof body.youtube_url === "string")) {
      return json(400, { ok: false, code: "invalid_youtube_url", error: "youtube_url must be a string or null" });
    }
    return forward(`${UPSTREAM}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtube_url: body.youtube_url }),
    });
  }

  return json(400, { ok: false, code: "invalid_json", error: "Unknown action" });
});
