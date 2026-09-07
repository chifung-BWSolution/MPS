import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  disableStaffAuth,
  provisionAllStaffAuth,
  provisionOneStaffAuth,
} from "../_shared/provisionStaffAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY") || "";

type Body = {
  mode?: "provision" | "disable" | "all";
  staff_id?: string;
  users_id?: string;
  auth_user_id?: string;
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
  if (!token) return false;
  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1] || ""));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "Missing SUPABASE_URL or service role key" });
  }

  const token = bearerToken(req);
  const isServiceRole = isServiceRoleToken(token);

  if (!isServiceRole) {
    if (!token || !SUPABASE_ANON_KEY) {
      return json(401, { error: "Missing authorization" });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json(401, { error: "Invalid session" });
    }
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const mode = body.mode || "provision";
  if (mode === "all" && !isServiceRole) {
    return json(403, { error: "Full backfill requires the service role" });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (mode === "all") {
      const results = await provisionAllStaffAuth(admin);
      return json(200, { ok: true, results });
    }
    if (mode === "disable") {
      const result = await disableStaffAuth(admin, {
        staffId: body.staff_id,
        usersId: body.users_id,
        authUserId: body.auth_user_id,
      });
      return json(200, { ok: true, result });
    }
    if (!body.staff_id && !body.users_id) {
      return json(400, { error: "staff_id or users_id is required" });
    }
    const result = await provisionOneStaffAuth(admin, {
      staffId: body.staff_id,
      usersId: body.users_id,
    });
    return json(200, { ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[provision-staff-auth]", message);
    return json(500, { error: message });
  }
});
