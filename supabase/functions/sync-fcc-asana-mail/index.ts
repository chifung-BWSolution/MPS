import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/google-gsc.ts";
import { hktDate, inquiryAlreadyOpened, normalizeFccBody, parseFccInquiry, resolveFccGmailOAuthClient, type FccMailRule } from "../_shared/fcc-asana-mail.ts";

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
  not_before: string | null;
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

function jwtPayload(token: string): { role?: string; iss?: string; ref?: string } | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const pad = part.length % 4 === 0 ? "" : "=".repeat(4 - (part.length % 4));
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/") + pad));
  } catch {
    return null;
  }
}

async function isServiceRoleJwt(token: string): Promise<boolean> {
  const payload = jwtPayload(token);
  if (payload?.role !== "service_role") return false;
  const ref = String(payload.ref || "");
  if (ref && SUPABASE_URL && !SUPABASE_URL.includes(ref)) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/asana_mail_rules?select=code&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

async function requireCaller(req: Request): Promise<Response | null> {
  const token = bearer(req);
  if (!token) return json(401, { error: "Missing authorization" });
  if (SUPABASE_SERVICE_ROLE_KEY && token === SUPABASE_SERVICE_ROLE_KEY) return null;
  if (await isServiceRoleJwt(token)) return null;
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

async function createTask(input: {
  workspace: string;
  project: string;
  name: string;
  notes: string;
  dueOn: string;
  assignee: string;
  followers: string[];
}): Promise<string> {
  const token = Deno.env.get("ASANA_FCC_ACCESS_TOKEN")?.trim();
  if (!token) throw new Error("未設定 ASANA_FCC_ACCESS_TOKEN，不會用而家的 Asana 帳號開 task");
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

type AsanaPerson = { gid: string; name: string; email: string };

async function asanaGet(path: string, token = Deno.env.get("ASANA_ACCESS_TOKEN")?.trim() || ""): Promise<{ data?: Array<Record<string, unknown>>; next_page?: { offset?: string } | null; errors?: Array<{ message?: string }> }> {
  if (!token) throw new Error("缺少 ASANA_ACCESS_TOKEN");
  const res = await fetch(`${ASANA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await res.json() as {
    data?: Array<Record<string, unknown>> | Record<string, unknown>;
    next_page?: { offset?: string } | null;
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok) throw new Error(payload.errors?.[0]?.message || "讀取 Asana 成員失敗");
  const data = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
  return { data, next_page: payload.next_page };
}

async function listWorkspacePeople(workspaceGid: string): Promise<AsanaPerson[]> {
  const people: AsanaPerson[] = [];
  let offset = "";
  for (let page = 0; page < 20; page += 1) {
    const qs = new URLSearchParams({ opt_fields: "gid,name,email", limit: "100" });
    if (offset) qs.set("offset", offset);
    const payload = await asanaGet(`/workspaces/${workspaceGid}/users?${qs}`);
    for (const user of payload.data || []) {
      const gid = String(user.gid || "").trim();
      if (!gid) continue;
      people.push({
        gid,
        name: String(user.name || "").trim(),
        email: String(user.email || "").trim(),
      });
    }
    offset = payload.next_page?.offset || "";
    if (!offset) break;
  }
  people.sort((a, b) => (a.email || a.name).localeCompare(b.email || b.name, "en"));
  return people;
}

function projectReadToken(): string {
  return Deno.env.get("ASANA_FCC_ACCESS_TOKEN")?.trim() || Deno.env.get("ASANA_ACCESS_TOKEN")?.trim() || "";
}

async function listWorkspaceProjects(workspaceGid: string): Promise<Array<{ gid: string; name: string }>> {
  const token = projectReadToken();
  if (!token) throw new Error("缺少 Asana token，未能讀取專案名稱");
  const projects: Array<{ gid: string; name: string }> = [];
  let offset = "";
  for (let page = 0; page < 30; page += 1) {
    const qs = new URLSearchParams({ opt_fields: "gid,name,archived", limit: "100", archived: "false" });
    if (offset) qs.set("offset", offset);
    const payload = await asanaGet(`/workspaces/${workspaceGid}/projects?${qs}`, token);
    for (const project of payload.data || []) {
      if (project.archived === true) continue;
      const gid = String(project.gid || "").trim();
      const name = String(project.name || "").trim();
      if (!gid || !name) continue;
      projects.push({ gid, name });
    }
    offset = payload.next_page?.offset || "";
    if (!offset) break;
  }
  projects.sort((a, b) => a.name.localeCompare(b.name));
  return projects;
}

async function fccCreator(): Promise<{ name: string; email: string } | null> {
  const token = Deno.env.get("ASANA_FCC_ACCESS_TOKEN")?.trim();
  if (!token) return null;
  const res = await fetch(`${ASANA_API}/users/me?opt_fields=name,email`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await res.json() as { data?: { name?: string; email?: string } };
  if (!res.ok) return null;
  return {
    name: String(payload.data?.name || "").trim(),
    email: String(payload.data?.email || "").trim(),
  };
}

function asanaReadToken(): string {
  return Deno.env.get("ASANA_ACCESS_TOKEN")?.trim() || Deno.env.get("ASANA_FCC_ACCESS_TOKEN")?.trim() || "";
}

const STORY_LABEL: Record<string, string> = {
  comment_added: "留言",
  added_to_project: "加入專案",
  removed_from_project: "移出專案",
  section_changed: "轉欄",
  assigned: "負責人",
  unassigned: "負責人",
  due_date_changed: "到期日",
  marked_complete: "完成",
  marked_incomplete: "重開",
  name_changed: "標題",
  notes_changed: "內容",
  follower_added: "協作者",
  follower_removed: "協作者",
  attachment_added: "附件",
  enum_custom_field_changed: "欄位",
  text_custom_field_changed: "欄位",
  number_custom_field_changed: "欄位",
  date_custom_field_changed: "欄位",
  multi_enum_custom_field_changed: "欄位",
};

async function taskActivity(taskGid: string) {
  const token = projectReadToken();
  if (!token) throw new Error("缺少 Asana token，未能讀取 task 紀錄");
  const taskPayload = await asanaGet(
    `/tasks/${taskGid}?opt_fields=completed,assignee.name,memberships.project.name,memberships.section.name`,
    token,
  );
  const task = taskPayload.data?.[0] || {};
  const memberships = Array.isArray(task.memberships) ? task.memberships : [];
  const projects = memberships.map((item) => {
    const row = item as { project?: { name?: string }; section?: { name?: string } };
    return {
      name: String(row.project?.name || "").trim(),
      section: String(row.section?.name || "").trim(),
    };
  }).filter((item) => item.name);
  const assignee = task.assignee && typeof task.assignee === "object"
    ? String((task.assignee as { name?: string }).name || "").trim()
    : "";
  const stories: Array<{ gid: string; at: string; by: string; subtype: string; label: string; text: string }> = [];
  let offset = "";
  for (let page = 0; page < 5; page += 1) {
    const qs = new URLSearchParams({
      opt_fields: "gid,created_at,created_by.name,text,resource_subtype",
      limit: "100",
    });
    if (offset) qs.set("offset", offset);
    const payload = await asanaGet(`/tasks/${taskGid}/stories?${qs}`, token);
    for (const story of payload.data || []) {
      const subtype = String(story.resource_subtype || "");
      if (subtype === "liked") continue;
      const text = String(story.text || "").trim();
      if (!text) continue;
      const createdBy = story.created_by && typeof story.created_by === "object"
        ? String((story.created_by as { name?: string }).name || "").trim()
        : "";
      stories.push({
        gid: String(story.gid || ""),
        at: String(story.created_at || ""),
        by: createdBy,
        subtype,
        label: STORY_LABEL[subtype] || "更新",
        text,
      });
    }
    offset = payload.next_page?.offset || "";
    if (!offset) break;
  }
  return {
    completed: task.completed === true,
    assignee,
    projects,
    stories,
  };
}

async function findExistingTask(workspace: string, project: string, phone: string, title: string, notes: string): Promise<string | null> {
  const token = asanaReadToken();
  if (!token) throw new Error("缺少 ASANA_ACCESS_TOKEN，未能先檢查 Asana 是否已有 task");
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
  const hit = (payload.data || []).find((task) => inquiryAlreadyOpened(String(task.name || ""), String(task.notes || ""), title, notes));
  return hit?.gid ? String(hit.gid) : null;
}

async function openedInHistory(
  supabase: ReturnType<typeof admin>,
  title: string,
  notes: string,
  messageId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("asana_mail_jobs")
    .select("gmail_message_id, task_name, notes, status")
    .eq("rule_code", "fcc")
    .in("status", ["created", "skipped", "processing"]);
  if (error) throw new Error(error.message);
  return (data || []).some((job) => {
    if (String(job.gmail_message_id || "") === messageId) return false;
    return inquiryAlreadyOpened(String(job.task_name || ""), String(job.notes || ""), title, notes);
  });
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
  const body = await req.json().catch(() => ({})) as { action?: string; taskGid?: string };

  const supabase = admin();
  const { data: rule, error: ruleErr } = await supabase
    .from("asana_mail_rules")
    .select("*")
    .eq("code", "fcc")
    .maybeSingle();
  if (ruleErr) return json(500, { error: ruleErr.message });
  if (!rule) return json(404, { error: "尚未設定 FCC 規則" });
  const row = rule as MailRuleRow;
  if (body.action === "users") {
    try {
      const [users, projectResult, creator] = await Promise.all([
        listWorkspacePeople(row.workspace_gid),
        listWorkspaceProjects(row.workspace_gid).then((projects) => ({ projects, projectError: "" })).catch((err: unknown) => ({
          projects: [] as Array<{ gid: string; name: string }>,
          projectError: err instanceof Error ? err.message : String(err),
        })),
        fccCreator(),
      ]);
      return json(200, { users, projects: projectResult.projects, projectError: projectResult.projectError, creator });
    } catch (err) {
      return json(500, { error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (body.action === "activity") {
    const taskGid = String(body.taskGid || "").trim();
    if (!/^\d+$/.test(taskGid)) return json(400, { error: "缺少 Asana task" });
    try {
      return json(200, await taskActivity(taskGid));
    } catch (err) {
      return json(500, { error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (!row.enabled) return json(200, { success: true, skipped: "disabled", created: 0 });
  if (!Deno.env.get("ASANA_FCC_ACCESS_TOKEN")?.trim()) {
    return json(200, { success: false, error: "未設定 ASANA_FCC_ACCESS_TOKEN，不會用而家的 Asana 帳號開 task" });
  }

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
      const { data: existing, error: existingErr } = await supabase
        .from("asana_mail_jobs")
        .select("status, asana_task_gid")
        .eq("rule_code", "fcc")
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
      const subject = message.payload?.headers?.find((header) => header.name.toLowerCase() === "subject")?.value || "";
      const emailText = normalizeFccBody(mailBody(message.payload)).slice(0, 8000);
      const receivedMs = Number(message.internalDate || Date.now());
      const received = hktDate(receivedMs);
      if (row.not_before && receivedMs < new Date(row.not_before).getTime()) {
        await supabase.from("asana_mail_jobs").upsert({
          rule_code: "fcc",
          gmail_message_id: item.id,
          subject,
          received_on: received,
          status: "skipped",
          notes: emailText,
          error: "早過開始時間，不補開舊郵件",
        }, { onConflict: "rule_code,gmail_message_id" });
        skipped += 1;
        continue;
      }
      const parsed = parseFccInquiry(mailBody(message.payload), toRule(row), subject);
      if (!parsed.ok) {
        await supabase.from("asana_mail_jobs").upsert({
          rule_code: "fcc",
          gmail_message_id: item.id,
          subject,
          received_on: received,
          status: "skipped",
          notes: emailText,
          error: parsed.reason,
        }, { onConflict: "rule_code,gmail_message_id" });
        skipped += 1;
        continue;
      }
      let existingTaskGid: string | null = null;
      let alreadyOpened = false;
      try {
        alreadyOpened = await openedInHistory(supabase, parsed.mail.title, parsed.mail.notes, item.id);
        existingTaskGid = alreadyOpened ? null : await findExistingTask(
          row.workspace_gid,
          parsed.mail.projectGid,
          parsed.mail.phone,
          parsed.mail.title,
          parsed.mail.notes,
        );
      } catch (err) {
        const messageText = err instanceof Error ? err.message : String(err);
        await supabase.from("asana_mail_jobs").upsert({
          rule_code: "fcc",
          gmail_message_id: item.id,
          subject,
          received_on: received,
          status: "error",
          route: parsed.mail.route,
          task_name: parsed.mail.title,
          notes: parsed.mail.notes,
          error: messageText,
        }, { onConflict: "rule_code,gmail_message_id" });
        errors.push(`${item.id}: ${messageText}`);
        continue;
      }
      if (alreadyOpened || existingTaskGid) {
        await supabase.from("asana_mail_jobs").upsert({
          rule_code: "fcc",
          gmail_message_id: item.id,
          subject,
          received_on: received,
          status: "skipped",
          route: parsed.mail.route,
          asana_task_gid: existingTaskGid,
          asana_project_gid: parsed.mail.projectGid,
          task_name: parsed.mail.title,
          notes: parsed.mail.notes,
          error: "同一查詢已開過，不重開",
        }, { onConflict: "rule_code,gmail_message_id" });
        skipped += 1;
        continue;
      }
      const claim = {
        rule_code: "fcc",
        gmail_message_id: item.id,
        subject,
        received_on: received,
        status: "processing",
        route: parsed.mail.route,
        task_name: parsed.mail.title,
        notes: parsed.mail.notes,
        error: null,
      };
      const { error: claimErr } = existing
        ? await supabase.from("asana_mail_jobs").update(claim).eq("rule_code", "fcc").eq("gmail_message_id", item.id).eq("status", "error")
        : await supabase.from("asana_mail_jobs").insert(claim);
      if (claimErr) {
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
          notes: parsed.mail.notes,
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
          notes: parsed.mail.notes,
          error: messageText,
        }, { onConflict: "rule_code,gmail_message_id" });
      }
    }
    return json(200, { success: errors.length === 0, created, skipped, errors });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});
