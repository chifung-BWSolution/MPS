import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/google-gsc.ts";
import { hktDate, isEmailMeFormSender, normalizeFccBody, resolveFccGmailOAuthClient } from "../_shared/fcc-asana-mail.ts";
import { attachMailImages, collectFormImageUrls } from "../_shared/asana-mail-images.ts";
import { bwInquiryAlreadyOpened, bwSkipReason, matchBwRoute, parseBwInquiry, type BwRouteRule } from "../_shared/bw-asana-mail.ts";

const PROVIDER = "gmail_bw";
const RULE = "bw";
const ASANA_API = "https://app.asana.com/api/1.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

type SettingsRow = {
  enabled: boolean;
  gmail_address: string;
  workspace_gid: string;
  match_mode: string;
  min_match_words: number;
  skip_subjects: string[] | null;
  collaborator_gids: string[] | null;
  not_before: string | null;
};

type RouteRow = {
  keyword: string;
  assignee_email: string;
  project_gid: string;
  enabled: boolean;
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

function admin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bw_asana_mail_settings?select=code&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (res.ok) return null;
  return json(401, { error: "Invalid session" });
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

type GmailPart = { mimeType?: string; filename?: string; body?: { data?: string; attachmentId?: string; size?: number }; parts?: GmailPart[] };

function partText(part: GmailPart | undefined): string {
  if (!part?.body?.data) return "";
  return decodeB64Url(part.body.data);
}

function mailBody(part: GmailPart | undefined): string {
  const plain: string[] = [];
  const html: string[] = [];
  const walk = (node: GmailPart | undefined) => {
    if (!node) return;
    const text = partText(node);
    if (node.mimeType === "text/plain" && text) plain.push(text);
    else if (node.mimeType === "text/html" && text) html.push(text);
    for (const child of node.parts || []) walk(child);
  };
  walk(part);
  const plainText = plain.join("\n").trim();
  if (plainText && !/<[a-z][^>]*>/i.test(plainText)) return plainText;
  return html.join("\n") || plainText;
}

async function gmailGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await res.json() as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(payload.error?.message || `Gmail ${path} failed`);
  return payload;
}

function asanaToken(): string {
  return Deno.env.get("ASANA_FCC_ACCESS_TOKEN")?.trim() || Deno.env.get("ASANA_ACCESS_TOKEN")?.trim() || "";
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
  const token = asanaToken();
  if (!token) throw new Error("未設定 Asana token，不會開 task");
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
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  const payload = await res.json() as { data?: { gid?: string }; errors?: Array<{ message?: string }> };
  if (!res.ok || !payload.data?.gid) throw new Error(payload.errors?.[0]?.message || "建立 Asana task 失敗");
  return payload.data.gid;
}

async function renameTask(taskGid: string, name: string): Promise<void> {
  const token = asanaToken();
  if (!token) throw new Error("未設定 Asana token，未能補上電話");
  const res = await fetch(`${ASANA_API}/tasks/${taskGid}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { name } }),
  });
  const payload = await res.json() as { errors?: Array<{ message?: string }> };
  if (!res.ok) throw new Error(payload.errors?.[0]?.message || "更新 Asana 標題失敗");
}

async function repairMissingPhones(
  supabase: ReturnType<typeof admin>,
  receivedOn: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("asana_mail_jobs")
    .select("id, subject, task_name, notes, asana_task_gid")
    .eq("rule_code", RULE)
    .eq("status", "created")
    .eq("received_on", receivedOn);
  if (error) throw new Error(error.message);
  let renamed = 0;
  for (const job of data || []) {
    const taskGid = String(job.asana_task_gid || "").trim();
    if (!taskGid) continue;
    const parsed = parseBwInquiry(String(job.notes || ""), String(job.subject || ""));
    const stored = String(job.task_name || "").trim();
    if (parsed.title && parsed.title !== stored) {
      try {
        await renameTask(taskGid, parsed.title);
        const { error: updateErr } = await supabase.from("asana_mail_jobs").update({ task_name: parsed.title }).eq("id", job.id);
        if (updateErr) throw new Error(updateErr.message);
        renamed += 1;
      } catch {
        // Leave the stored title unchanged so the next check can try again.
      }
    }
    const token = asanaToken();
    if (token && collectFormImageUrls(String(job.notes || "")).length) {
      try {
        await attachMailImages(token, taskGid, { text: String(job.notes || "") });
      } catch {
        // The next check lists existing attachments and uploads only the missing ones.
      }
    }
  }
  return renamed;
}

async function listPeople(workspaceGid: string): Promise<Array<{ gid: string; email: string }>> {
  const token = asanaToken();
  if (!token) return [];
  const people: Array<{ gid: string; email: string }> = [];
  let offset = "";
  for (let page = 0; page < 20; page += 1) {
    const qs = new URLSearchParams({ opt_fields: "gid,email", limit: "100" });
    if (offset) qs.set("offset", offset);
    const res = await fetch(`${ASANA_API}/workspaces/${workspaceGid}/users?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await res.json() as {
      data?: Array<{ gid?: string; email?: string }>;
      next_page?: { offset?: string } | null;
      errors?: Array<{ message?: string }>;
    };
    if (!res.ok) throw new Error(payload.errors?.[0]?.message || "讀取 Asana 成員失敗");
    for (const user of payload.data || []) {
      const gid = String(user.gid || "").trim();
      if (gid) people.push({ gid, email: String(user.email || "").trim() });
    }
    offset = payload.next_page?.offset || "";
    if (!offset) break;
  }
  return people;
}

async function findExistingTask(workspace: string, project: string, phone: string, title: string, notes: string): Promise<string | null> {
  const token = asanaToken();
  if (!token) throw new Error("缺少 Asana token，未能先檢查是否已有 task");
  const digits = phone.replace(/\D/g, "");
  const qs = new URLSearchParams({
    text: digits || title,
    "projects.any": project,
    opt_fields: "name,gid,notes",
    limit: "50",
  });
  const res = await fetch(`${ASANA_API}/workspaces/${workspace}/tasks/search?${qs}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const payload = await res.json() as { data?: Array<{ gid?: string; name?: string; notes?: string }>; errors?: Array<{ message?: string }> };
  if (!res.ok) throw new Error(payload.errors?.[0]?.message || "檢查 Asana 現有 task 失敗");
  const hit = (payload.data || []).find((task) => bwInquiryAlreadyOpened(String(task.name || ""), String(task.notes || ""), title, notes));
  return hit?.gid ? String(hit.gid) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const denied = await requireCaller(req);
  if (denied) return denied;

  const supabase = admin();
  const { data: settings, error: settingsErr } = await supabase
    .from("bw_asana_mail_settings")
    .select("enabled, gmail_address, workspace_gid, match_mode, min_match_words, skip_subjects, collaborator_gids, not_before")
    .eq("code", RULE)
    .maybeSingle();
  if (settingsErr) return json(500, { error: settingsErr.message });
  if (!settings) return json(404, { error: "尚未設定 BW 規則" });
  const row = settings as SettingsRow;
  if (!row.enabled) return json(200, { success: true, skipped: "disabled", created: 0 });
  if (!asanaToken()) return json(200, { success: false, error: "未設定 Asana token，不會開 task" });

  const { data: routeRows, error: routeErr } = await supabase
    .from("bw_asana_mail_routes")
    .select("keyword, assignee_email, project_gid, enabled")
    .order("sort_order", { ascending: true });
  if (routeErr) return json(500, { error: routeErr.message });
  const routes: BwRouteRule[] = ((routeRows || []) as RouteRow[]).map((route) => ({
    keyword: route.keyword,
    assigneeEmail: route.assignee_email,
    projectGid: route.project_gid,
    enabled: route.enabled,
  }));

  const { data: tokenRow } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token")
    .eq("provider", PROVIDER)
    .maybeSingle();
  const refresh = String(tokenRow?.refresh_token || "").trim();
  if (!refresh) return json(200, { success: false, error: "尚未連接 brandingworks.services@gmail.com" });

  try {
    const token = await accessToken(refresh);
    const profile = await gmailGet<{ emailAddress?: string }>(token, "/profile");
    const mailbox = String(profile.emailAddress || "").toLowerCase();
    if (mailbox && mailbox !== String(row.gmail_address || "").toLowerCase()) {
      return json(200, { success: false, error: `授權信箱是 ${mailbox}，規則要求 ${row.gmail_address}` });
    }
    const people = await listPeople(row.workspace_gid);
    const renamed = await repairMissingPhones(supabase, hktDate(Date.now()));
    const listed = await gmailGet<{ messages?: Array<{ id: string }> }>(
      token,
      `/messages?q=${encodeURIComponent("from:emailmeform.com in:inbox")}&maxResults=20`,
    );
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    const mode = row.match_mode === "words" ? "words" : "phrase";
    const minWords = Math.max(1, Number(row.min_match_words) || 3);
    const followers = (row.collaborator_gids || []).map((gid) => gid.trim()).filter(Boolean);

    for (const item of listed.messages || []) {
      if (!item.id) continue;
      const { data: existing, error: existingErr } = await supabase
        .from("asana_mail_jobs")
        .select("status, asana_task_gid")
        .eq("rule_code", RULE)
        .eq("gmail_message_id", item.id)
        .maybeSingle();
      if (existingErr) return json(500, { error: existingErr.message });
      if (existing?.asana_task_gid || (existing && existing.status !== "error")) {
        skipped += 1;
        continue;
      }
      const message = await gmailGet<{
        id: string;
        internalDate?: string;
        payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
      }>(token, `/messages/${item.id}?format=full`);
      const headers = message.payload?.headers || [];
      const subject = headers.find((header) => header.name.toLowerCase() === "subject")?.value || "";
      const fromHeader = headers.find((header) => header.name.toLowerCase() === "from")?.value || "";
      const rawBody = mailBody(message.payload);
      const emailText = normalizeFccBody(rawBody).slice(0, 8000);
      const receivedMs = Number(message.internalDate || Date.now());
      const received = hktDate(receivedMs);
      const skip = async (reason: string) => {
        await supabase.from("asana_mail_jobs").upsert({
          rule_code: RULE,
          gmail_message_id: item.id,
          subject,
          received_on: received,
          status: "skipped",
          notes: emailText,
          error: reason,
        }, { onConflict: "rule_code,gmail_message_id" });
        skipped += 1;
      };
      if (!isEmailMeFormSender(fromHeader)) {
        await skip("不是 EmailMeForm 寄出，不開 task");
        continue;
      }
      if (row.not_before && receivedMs < new Date(row.not_before).getTime()) {
        await skip("早過開始時間，不補開舊郵件");
        continue;
      }
      const blocked = bwSkipReason(subject, row.skip_subjects || []);
      if (blocked) {
        await skip(blocked);
        continue;
      }
      const matched = matchBwRoute(subject, routes, mode, minWords);
      if (!matched) {
        await skip("主旨對不上關鍵字，不開 task");
        continue;
      }
      if (!matched.assigneeEmail.trim() || !matched.projectGid.trim()) {
        await skip("對上的一行未填負責人電郵或專案，不開 task");
        continue;
      }
      const assignee = people.find((person) => person.email.toLowerCase() === matched.assigneeEmail.trim().toLowerCase())?.gid || "";
      if (!assignee) {
        await skip("負責人電郵對不上 Asana 用戶，不開 task");
        continue;
      }
      const parsed = parseBwInquiry(rawBody, subject);
      if (!parsed.notes && !parsed.name && !parsed.phone) {
        await skip("讀唔到查詢內容，不開 task");
        continue;
      }
      let existingTaskGid: string | null = null;
      try {
        const { data: history, error: historyErr } = await supabase
          .from("asana_mail_jobs")
          .select("gmail_message_id, task_name, notes, status")
          .eq("rule_code", RULE)
          .in("status", ["created", "skipped", "processing"]);
        if (historyErr) throw new Error(historyErr.message);
        const alreadyOpened = (history || []).some((job) => {
          if (String(job.gmail_message_id || "") === item.id) return false;
          return bwInquiryAlreadyOpened(String(job.task_name || ""), String(job.notes || ""), parsed.title, parsed.notes);
        });
        existingTaskGid = alreadyOpened ? "opened" : await findExistingTask(row.workspace_gid, matched.projectGid, parsed.phone, parsed.title, parsed.notes);
        if (alreadyOpened || existingTaskGid) {
          await supabase.from("asana_mail_jobs").upsert({
            rule_code: RULE,
            gmail_message_id: item.id,
            subject,
            received_on: received,
            status: "skipped",
            asana_task_gid: existingTaskGid === "opened" ? null : existingTaskGid,
            asana_project_gid: matched.projectGid,
            task_name: parsed.title,
            notes: parsed.notes,
            error: "同一查詢已開過，不重開",
          }, { onConflict: "rule_code,gmail_message_id" });
          skipped += 1;
          continue;
        }
      } catch (err) {
        const messageText = err instanceof Error ? err.message : String(err);
        errors.push(`${item.id}: ${messageText}`);
        await supabase.from("asana_mail_jobs").upsert({
          rule_code: RULE,
          gmail_message_id: item.id,
          subject,
          received_on: received,
          status: "error",
          asana_project_gid: matched.projectGid,
          task_name: parsed.title,
          notes: parsed.notes,
          error: messageText,
        }, { onConflict: "rule_code,gmail_message_id" });
        continue;
      }
      try {
        const taskGid = await createTask({
          workspace: row.workspace_gid,
          project: matched.projectGid,
          name: parsed.title,
          notes: parsed.notes,
          dueOn: received,
          assignee,
          followers: followers.filter((gid) => gid !== assignee),
        });
        let imageError: string | null = null;
        try {
          const images = await attachMailImages(asanaToken(), taskGid, {
            text: `${rawBody}\n${parsed.notes}`,
            payload: message.payload,
            loadGmailAttachment: async (attachmentId) => {
              const loaded = await gmailGet<{ data?: string }>(token, `/messages/${item.id}/attachments/${attachmentId}`);
              return loaded.data || "";
            },
          });
          if (images.failed) imageError = `task 已開，${images.failed} 張圖片未能上傳`;
        } catch (err) {
          imageError = err instanceof Error ? err.message : String(err);
        }
        await supabase.from("asana_mail_jobs").upsert({
          rule_code: RULE,
          gmail_message_id: item.id,
          subject,
          received_on: received,
          status: "created",
          asana_task_gid: taskGid,
          asana_project_gid: matched.projectGid,
          task_name: parsed.title,
          notes: parsed.notes,
          error: imageError,
        }, { onConflict: "rule_code,gmail_message_id" });
        created += 1;
      } catch (err) {
        const messageText = err instanceof Error ? err.message : String(err);
        errors.push(`${item.id}: ${messageText}`);
        await supabase.from("asana_mail_jobs").upsert({
          rule_code: RULE,
          gmail_message_id: item.id,
          subject,
          received_on: received,
          status: "error",
          asana_project_gid: matched.projectGid,
          task_name: parsed.title,
          notes: parsed.notes,
          error: messageText,
        }, { onConflict: "rule_code,gmail_message_id" });
      }
    }
    return json(200, { success: errors.length === 0, created, skipped, renamed, errors });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
