import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  createAsanaTaskComment,
  formatAsanaCaseClosedComment,
  formatAsanaCaseReopenedComment,
  getAsanaMe,
  updateAsanaTask,
} from "../_shared/asana-pitching.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

type RequestBody = {
  asana_task_gid?: string;
  case_closed_reason?: string | null;
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

async function resolveStaffDisplayName(token: string): Promise<string> {
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return "";
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const authUserId = userData.user?.id;
  if (!authUserId) return "";

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userRow } = await admin
    .from("users")
    .select("staff_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  const staffId = (userRow?.staff_id || "").trim();
  if (!staffId) return userData.user?.email || "";

  const { data: staff } = await admin
    .from("staffs")
    .select("display_name")
    .eq("id", staffId)
    .maybeSingle();
  return (staff?.display_name || "").trim() || userData.user?.email || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL or service role key");
    }

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const taskGid = (body.asana_task_gid || "").trim();
    const reason = (body.case_closed_reason || "").trim();
    if (!taskGid) {
      return json(400, { error: "缺少 Asana 任務" });
    }

    const staffName = await resolveStaffDisplayName(bearerToken(req));
    const closing = Boolean(reason);
    const comment = closing
      ? formatAsanaCaseClosedComment(reason, staffName)
      : formatAsanaCaseReopenedComment(staffName);

    const actor = await getAsanaMe().catch(() => null);
    await updateAsanaTask(taskGid, { completed: closing });
    await createAsanaTaskComment(taskGid, comment);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("asana_synced_tasks")
      .update({
        case_closed_reason: reason || null,
        updated_at: now,
      })
      .eq("asana_task_gid", taskGid);
    if (updateErr) throw new Error(`儲存放棄原因失敗：${updateErr.message}`);

    return json(200, {
      success: true,
      asana_task_gid: taskGid,
      case_closed_reason: reason || null,
      asana_completed: closing,
      asana_comment: comment,
      asana_actor_name: actor?.name || null,
      asana_actor_email: actor?.email || null,
      staff_name: staffName || null,
    });
  } catch (e) {
    return json(500, { success: false, error: (e as Error).message });
  }
});
