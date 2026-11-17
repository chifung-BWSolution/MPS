import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/google-gsc.ts";
import { hktDate, parseFccInquiry, resolveFccGmailOAuthClient, type FccMailRule } from "../_shared/fcc-asana-mail.ts";

const PROVIDER = "gmail_fcc";
const ASANA_API = "https://app.asana.com/api/1.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

type MailRuleRow = {
  code: string;
  enabled: boolean;
  gmail_address: string;
  gmail_label_id: string;
  workspace_gid: string;
  assignee_gid: string;
  collaborator_gids: string[] | null;
  lunch_project_gid: string;
  lunch_title_prefix: string;
  catering_project_gid: string;
  catering_title_prefix: string;
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

async function requireCaller(req: Request): Promise<Response | null> {
  const token = bearer(req);
  if (!token) return json(401, { error: "Missing authorization" });
  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) return json(401, { error: "Invalid session" });
  return null;
}

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function accessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = resolveFccGmailOAuthClient();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = await res.json() as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "無法更新 Gmail access token");
  }
  return payload.access_token;
}

function decodeB64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };

function plainText(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeB64Url(part.body.data);
  for (const child of part.parts || []) {
    const text = plainText(child);
    if (text) return text;
  }
  if (part.body?.data) return decodeB64Url(part.body.data);
  return "";
}

async function gmailGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await res.json() as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(payload.error?.message || `Gmail ${path} failed`);
  return payload;
}

async function createTask(input: {
  workspace: string;
  project: string;
  name: string;
  notes: string;
  dueOn: string;
  assignee: string;
  followers: string[];
}): Promise<string> {
  const token = Deno.env.get("ASANA_ACCESS_TOKEN")?.trim();
  if (!token) throw new Error("Missing ASANA_ACCESS_TOKEN");
  const data: Record<string, unknown> = {
    workspace: input.workspace,
    projects: [input.project],
    name: input.name,
    notes: input.notes,
    due_on: input.dueOn,
  };
  if (input.assignee) data.assignee = input.assignee;
  if (input.followers.length) data.followers = input.followers;
  const res = await fetch(`${ASANA_API}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data }),
  });
  const payload = await res.json() as { data?: { gid?: string }; errors?: Array<{ message?: string }> };
  if (!res.ok || !payload.data?.gid) {
    throw new Error(payload.errors?.[0]?.message || "建立 Asana task 失敗");
  }
  return payload.data.gid;
}

function toRule(row: MailRuleRow): FccMailRule {
  return {
    lunchProjectGid: row.lunch_project_gid,
    cateringProjectGid: row.catering_project_gid,
    lunchTitlePrefix: row.lunch_title_prefix || "FC Lunch Box",
    cateringTitlePrefix: row.catering_title_prefix || "FC Catering",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const denied = await requireCaller(req);
  if (denied) return denied;

  const supabase = admin();
  const { data: rule, error: ruleErr } = await supabase
    .from("asana_mail_rules")
    .select("*")
    .eq("code", "fcc")
    .maybeSingle();
  if (ruleErr) return json(500, { error: ruleErr.message });
  if (!rule) return json(404, { error: "尚未設定 FCC 規則" });
  const row = rule as MailRuleRow;
  if (!row.enabled) return json(200, { success: true, skipped: "disabled", created: 0 });

  const { data: tokenRow } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token")
    .eq("provider", PROVIDER)
    .maybeSingle();
  const refresh = String(tokenRow?.refresh_token || "").trim();
  if (!refresh) return json(200, { success: false, error: "尚未連接 foodchannels.plan@gmail.com" });

  try {
    const token = await accessToken(refresh);
    const profile = await gmailGet<{ emailAddress?: string }>(token, "/profile");
    const mailbox = String(profile.emailAddress || "").toLowerCase();
    if (mailbox && mailbox !== row.gmail_address.toLowerCase()) {
      return json(200, { success: false, error: `授權信箱是 ${mailbox}，規則要求 ${row.gmail_address}` });
    }
    const listed = await gmailGet<{ messages?: Array<{ id: string }> }>(
      token,
      `/messages?labelIds=${encodeURIComponent(row.gmail_label_id)}&maxResults=15`,
    );
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const item of listed.messages || []) {
      const { data: existing } = await supabase
        .from("asana_mail_jobs")
        .select("status")
        .eq("rule_code", "fcc")
        .eq("gmail_message_id", item.id)
        .maybeSingle();
      if (existing && existing.status !== "error") {
        skipped += 1;
        continue;
      }
      const message = await gmailGet<{
        id: string;
        internalDate?: string;
        payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
      }>(token, `/messages/${item.id}?format=full`);
      const subject = message.payload?.headers?.find((header) => header.name.toLowerCase() === "subject")?.value || "";
      const received = hktDate(Number(message.internalDate || Date.now()));
      const parsed = parseFccInquiry(plainText(message.payload), toRule(row));
      if (!parsed.ok) {
        await supabase.from("asana_mail_jobs").upsert({
          rule_code: "fcc",
          gmail_message_id: item.id,
          subject,
          received_on: received,
          status: "skipped",
          error: parsed.reason,
        }, { onConflict: "rule_code,gmail_message_id" });
        skipped += 1;
        continue;
      }
      try {
        const taskGid = await createTask({
          workspace: row.workspace_gid,
          project: parsed.mail.projectGid,
          name: parsed.mail.title,
          notes: parsed.mail.notes,
          dueOn: received,
          assignee: row.assignee_gid.trim(),
          followers: (row.collaborator_gids || []).map((gid) => gid.trim()).filter(Boolean),
        });
        await supabase.from("asana_mail_jobs").upsert({
          rule_code: "fcc",
          gmail_message_id: item.id,
          subject,
          received_on: received,
          status: "created",
          route: parsed.mail.route,
          asana_task_gid: taskGid,
          asana_project_gid: parsed.mail.projectGid,
          task_name: parsed.mail.title,
          error: null,
        }, { onConflict: "rule_code,gmail_message_id" });
        created += 1;
      } catch (err) {
        const messageText = err instanceof Error ? err.message : String(err);
        errors.push(`${item.id}: ${messageText}`);
        await supabase.from("asana_mail_jobs").upsert({
          rule_code: "fcc",
          gmail_message_id: item.id,
          subject,
          received_on: received,
          status: "error",
          route: parsed.mail.route,
          task_name: parsed.mail.title,
          error: messageText,
        }, { onConflict: "rule_code,gmail_message_id" });
      }
    }
    return json(200, { success: errors.length === 0, created, skipped, errors });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
