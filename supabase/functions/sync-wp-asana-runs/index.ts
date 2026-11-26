import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/google-gsc.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";
const WPP_URL = (Deno.env.get("WPP_SUPABASE_URL") || "https://fvnfvopeqzyfhruuikvo.supabase.co").replace(/\/$/, "");
const WPP_KEY = Deno.env.get("WPP_SERVICE_ROLE_KEY") || "";
const PAGE = 200;

type WpRun = {
  gmail_message_id: string | null;
  subject: string | null;
  task_name: string | null;
  status: string | null;
  detail: string | null;
  created_at: string | null;
  received_on: string | null;
  route: string | null;
  asana_task_gid: string | null;
  asana_project_gid: string | null;
  task_notes: string | null;
  b2b_event_url: string | null;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearer(req: Request): string {
  return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

function mapStatus(status: string | null): string {
  if (status === "failed") return "error";
  if (status === "created" || status === "skipped" || status === "error" || status === "processing") return status;
  return "error";
}

function blank(value: string | null | undefined): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function toJob(row: WpRun) {
  return {
    rule_code: "wp",
    gmail_message_id: String(row.gmail_message_id),
    subject: row.subject || "",
    received_on: blank(row.received_on),
    status: mapStatus(row.status),
    route: blank(row.route),
    asana_task_gid: blank(row.asana_task_gid),
    asana_project_gid: blank(row.asana_project_gid),
    task_name: blank(row.task_name),
    notes: row.task_notes || "",
    error: blank(row.detail),
    b2b_event_url: blank(row.b2b_event_url),
    created_at: row.created_at || new Date().toISOString(),
  };
}

async function requireCaller(req: Request): Promise<Response | null> {
  const token = bearer(req);
  if (!token) return json(401, { error: "Missing authorization" });
  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (!error && data.user) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/asana_mail_jobs?select=id&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (res.ok) return null;
  return json(401, { error: "Invalid session" });
}

async function pullPage(offset: number): Promise<WpRun[]> {
  const params = new URLSearchParams({
    select: "gmail_message_id,subject,task_name,status,detail,created_at,received_on,route,asana_task_gid,asana_project_gid,task_notes,b2b_event_url",
    order: "created_at.asc",
    limit: String(PAGE),
    offset: String(offset),
  });
  const res = await fetch(`${WPP_URL}/rest/v1/wp_asana_task_runs?${params}`, {
    headers: { apikey: WPP_KEY, Authorization: `Bearer ${WPP_KEY}` },
  });
  if (!res.ok) throw new Error(`讀取 WP 紀錄失敗 (${res.status})`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("WP 紀錄格式不正確");
  return rows as WpRun[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireCaller(req);
  if (denied) return denied;
  if (!WPP_KEY) return json(500, { error: "未設定 WP 資料庫權限" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let offset = 0;
  let upserted = 0;
  let linked = 0;
  try {
    for (;;) {
      const rows = await pullPage(offset);
      const jobs = rows.filter((row) => blank(row.gmail_message_id)).map(toJob);
      if (jobs.length > 0) {
        const { error } = await admin.from("asana_mail_jobs").upsert(jobs, { onConflict: "rule_code,gmail_message_id" });
        if (error) throw new Error(error.message);
        upserted += jobs.length;
        linked += jobs.filter((job) => job.b2b_event_url).length;
      }
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : String(error) });
  }
  return json(200, { upserted, linked });
});
