import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  applyInquiryEmailTokens,
  buildInquiryAutoresponderEmail,
  buildInquirySubmissionEmail,
  type InquiryEmailAnswer,
} from "../../../src/lib/inquiryFormEmail.ts";
import { defaultFromEmail, sendResendEmail } from "../_shared/resend.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type FieldRow = {
  id: string;
  label: string;
  field_type: string;
  required: boolean;
  placeholder: string;
  options: string[];
  file_max_count: number;
  file_max_size_mb: number;
  file_accept: string[];
};

type StoredFile = { name: string; path: string; size: number; type: string };
type SubmissionAnswer = {
  fieldId: string;
  label: string;
  value: string | string[];
  files?: StoredFile[];
};

type FormRow = {
  id: string;
  name: string;
  published: boolean;
  opens_at: string | null;
  closes_at: string | null;
  max_entries: number | null;
  one_entry_per_ip: boolean;
  notification_enabled: boolean;
  notification_recipients: string[];
  notification_reply_to_field_id: string | null;
  notification_subject: string;
  notification_show_empty_fields: boolean;
  notification_include_ip: boolean;
  notification_include_referrer: boolean;
  autoresponder_enabled: boolean;
  autoresponder_recipient_field_id: string | null;
  autoresponder_sender_name: string;
  autoresponder_reply_to: string;
  autoresponder_subject: string;
  autoresponder_message: string;
  autoresponder_include_copy: boolean;
  asana_enabled: boolean;
  asana_project_gid: string;
  asana_assignee_gid: string;
  asana_collaborator_gids: string[];
  asana_task_name_template: string;
};

const FILE_BUCKET = "inquiry-form-files";
const MAX_TOTAL_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
]);
const ALLOWED_FILE_EXTENSIONS = new Set([
  "jpg", "jpeg", "jfif", "png", "gif", "webp", "pdf",
  "doc", "docx", "xls", "xlsx", "txt", "csv", "zip",
]);

class InputError extends Error {}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeFileName(value: string): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || "file";
}

async function hasBlockedFileContent(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  if ((bytes[0] === 0x4d && bytes[1] === 0x5a) ||
      (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46)) {
    return true;
  }
  const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "").trimStart().toLowerCase();
  return text.startsWith("<!doctype html") ||
    text.startsWith("<html") ||
    text.startsWith("<svg") ||
    (text.startsWith("<?xml") && text.includes("<svg"));
}

function validEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function fromWithName(name: string): string | undefined {
  const cleanName = name.replace(/[\r\n<>]/g, "").trim().slice(0, 100);
  if (!cleanName) return undefined;
  const configured = defaultFromEmail();
  const bracketed = configured.match(/<([^>]+)>/);
  const email = bracketed?.[1] || configured.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || "";
  return validEmail(email) ? `${cleanName} <${email}>` : undefined;
}

function visitorIp(req: Request): string {
  return cleanText(
    (req.headers.get("x-forwarded-for") || "").split(",")[0] ||
      req.headers.get("cf-connecting-ip") ||
      "",
    128,
  );
}

async function sha256(value: string): Promise<string> {
  if (!value) return "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hktDate(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
}

function asanaToken(): string {
  return Deno.env.get("ASANA_FCC_ACCESS_TOKEN")?.trim() || Deno.env.get("ASANA_ACCESS_TOKEN")?.trim() || "";
}

async function createAsanaTask(input: {
  workspace: string;
  project: string;
  name: string;
  notes: string;
  assignee: string;
  followers: string[];
}): Promise<string> {
  const token = asanaToken();
  if (!token) throw new Error("未設定 Asana token，不會開 task");
  const data: Record<string, unknown> = {
    workspace: input.workspace,
    projects: [input.project],
    name: input.name.slice(0, 500) || "新表格回覆",
    notes: input.notes.slice(0, 60000),
    due_on: hktDate(),
  };
  if (input.assignee) data.assignee = input.assignee;
  if (input.followers.length) data.followers = input.followers;
  const res = await fetch("https://app.asana.com/api/1.0/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  const payload = await res.json() as { data?: { gid?: string }; errors?: Array<{ message?: string }> };
  if (!res.ok || !payload.data?.gid) throw new Error(payload.errors?.[0]?.message || "建立 Asana task 失敗");
  return payload.data.gid;
}

async function attachAsanaFile(taskGid: string, file: File, name: string): Promise<void> {
  const token = asanaToken();
  if (!token) throw new Error("未設定 Asana token，未能上傳附件");
  const body = new FormData();
  body.append("parent", taskGid);
  body.append("file", file, name);
  const res = await fetch("https://app.asana.com/api/1.0/attachments", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const payload = await res.json() as { errors?: Array<{ message?: string }> };
  if (!res.ok) throw new Error(payload.errors?.[0]?.message || "上傳 Asana 附件失敗");
}

function answerValue(answers: SubmissionAnswer[], fieldId: string | null): string {
  if (!fieldId) return "";
  const answer = answers.find((item) => item.fieldId === fieldId);
  if (!answer || Array.isArray(answer.value)) return "";
  return answer.value.trim();
}

function validateAnswers(
  fields: FieldRow[],
  rawAnswers: Record<string, unknown>,
  rawFiles: Map<string, File[]>,
): SubmissionAnswer[] {
  const snapshot: SubmissionAnswer[] = [];
  for (const field of fields) {
    if (field.field_type === "section") continue;
    if (field.field_type === "hidden") {
      snapshot.push({
        fieldId: field.id,
        label: field.label,
        value: cleanText(field.placeholder),
      });
      continue;
    }

    if (field.field_type === "file") {
      const files = rawFiles.get(field.id) || [];
      const requestedCount = Number(field.file_max_count);
      const maxCount = requestedCount === 0 ? 0 : Math.min(20, Math.max(1, requestedCount || 3));
      const maxBytes = Math.min(20, Math.max(1, Number(field.file_max_size_mb) || 10)) * 1024 * 1024;
      const configuredTypes = (field.file_accept || []).filter((type) => ALLOWED_FILE_TYPES.has(type));
      if (field.required && files.length === 0) throw new InputError(`請上傳：${field.label}`);
      if (maxCount > 0 && files.length > maxCount) throw new InputError(`${field.label}最多只可上傳 ${maxCount} 個檔案`);
      for (const file of files) {
        const extension = file.name.toLowerCase().split(".").pop() || "";
        if (file.size > maxBytes) throw new InputError(`${file.name}超過 ${field.file_max_size_mb || 10} MB 上限`);
        const configuredTypeAllowed = configuredTypes.length === 0 ||
          configuredTypes.includes(file.type) ||
          (file.type === "application/x-zip-compressed" && configuredTypes.includes("application/zip"));
        if (
          !ALLOWED_FILE_TYPES.has(file.type) ||
          !ALLOWED_FILE_EXTENSIONS.has(extension) ||
          !configuredTypeAllowed
        ) {
          throw new InputError(`${file.name}的檔案格式不接受`);
        }
      }
      snapshot.push({ fieldId: field.id, label: field.label, value: files.map((file) => safeFileName(file.name)) });
      continue;
    }

    const raw = rawAnswers[field.id];
    if (field.field_type === "checkboxes") {
      const values = Array.isArray(raw)
        ? raw.map((item) => cleanText(item, 500)).filter(Boolean).slice(0, 30)
        : [];
      if (field.required && values.length === 0) throw new Error(`請填寫：${field.label}`);
      if (values.some((value) => !field.options.includes(value))) {
        throw new Error(`選項不在清單內：${field.label}`);
      }
      snapshot.push({ fieldId: field.id, label: field.label, value: values });
      continue;
    }

    const value = cleanText(raw);
    if ((field.required || field.field_type === "terms") && !value) {
      throw new Error(`請填寫：${field.label}`);
    }
    if ((field.field_type === "checkbox" || field.field_type === "terms") && value && value !== "yes") {
      throw new Error(`答案格式不正確：${field.label}`);
    }
    if (field.field_type === "email" && value && !validEmail(value)) {
      throw new Error(`電郵格式不正確：${field.label}`);
    }
    if (field.field_type === "number" && value && !/^-?\d+(\.\d+)?$/.test(value)) {
      throw new Error(`請填數字：${field.label}`);
    }
    if (field.field_type === "date" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`請填日期：${field.label}`);
    }
    if (field.field_type === "website" && value) {
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
      } catch {
        throw new Error(`網址格式不正確：${field.label}`);
      }
    }
    if ((field.field_type === "select" || field.field_type === "radio") && value && !field.options.includes(value)) {
      throw new Error(`選項不在清單內：${field.label}`);
    }
    snapshot.push({ fieldId: field.id, label: field.label, value });
  }
  if (snapshot.length === 0) throw new Error("這份表格未有欄位");
  return snapshot;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Server is not configured" });

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  if (req.method === "DELETE") {
    try {
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: authData, error: authError } = await db.auth.getUser(token);
      if (authError || !authData.user) return json(401, { error: "請先登入" });
      const body = await req.json() as { formId?: string };
      const formId = cleanText(body.formId, 64);
      if (!/^[0-9a-f-]{36}$/i.test(formId)) return json(400, { error: "表格不正確" });
      const { data: submissions, error: submissionsError } = await db
        .from("inquiry_form_submissions")
        .select("answers")
        .eq("form_id", formId);
      if (submissionsError) throw submissionsError;
      const paths = (submissions || []).flatMap((submission) => {
        const answers = Array.isArray(submission.answers) ? submission.answers : [];
        return answers.flatMap((answer) => {
          if (!answer || typeof answer !== "object" || !Array.isArray(answer.files)) return [];
          return answer.files
            .map((file: { path?: unknown }) => cleanText(file?.path, 1000))
            .filter((path: string) => path.startsWith(`${formId}/`));
        });
      });
      for (let index = 0; index < paths.length; index += 100) {
        const { error: removeError } = await db.storage.from(FILE_BUCKET).remove(paths.slice(index, index + 100));
        if (removeError) throw removeError;
      }
      const { error: deleteError } = await db.from("inquiry_forms").delete().eq("id", formId);
      if (deleteError) throw deleteError;
      return json(200, { success: true });
    } catch (error) {
      return json(500, { error: error instanceof Error ? error.message : "刪除失敗" });
    }
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const uploadedPaths: string[] = [];
  let submissionStored = false;
  try {
    let body: {
      linkId?: string;
      answers?: Record<string, unknown>;
      startedAt?: number;
      website?: string;
      referrer?: string;
    };
    const rawFiles = new Map<string, File[]>();
    const contentType = req.headers.get("content-type") || "";
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const multipart = await req.formData();
      const payload = multipart.get("payload");
      if (typeof payload !== "string") throw new InputError("答案格式不正確");
      try {
        body = JSON.parse(payload);
      } catch {
        throw new InputError("答案格式不正確");
      }
      let totalFileBytes = 0;
      for (const [key, value] of multipart.entries()) {
        if (!key.startsWith("file:") || !(value instanceof File)) continue;
        const fieldId = key.slice(5);
        if (!/^[0-9a-f-]{36}$/i.test(fieldId)) throw new InputError("檔案欄位不正確");
        totalFileBytes += value.size;
        if (totalFileBytes > MAX_TOTAL_FILE_BYTES) throw new InputError("全部檔案合共不可超過 20 MB");
        rawFiles.set(fieldId, [...(rawFiles.get(fieldId) || []), value]);
      }
    } else {
      body = await req.json();
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("答案格式不正確");
    const linkId = cleanText(body.linkId, 64);
    if (!/^[0-9a-f-]{36}$/i.test(linkId)) return json(400, { error: "這條連結不正確" });

    // Honeypot bots get a harmless success so they do not retry.
    if (cleanText(body.website, 200)) return json(200, { success: true });
    const elapsed = Date.now() - Number(body.startedAt || 0);
    if (!Number.isFinite(elapsed) || elapsed < 1200 || elapsed > 43_200_000) {
      return json(400, { error: "請重新載入表格再送出" });
    }
    if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
      return json(400, { error: "答案格式不正確" });
    }

    const { data: link, error: linkError } = await db
      .from("inquiry_form_links")
      .select("id, form_id, website_id, webandsystem_list(website_name)")
      .eq("id", linkId)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) return json(404, { error: "找不到這份表格" });

    const { data: formData, error: formError } = await db
      .from("inquiry_forms")
      .select("*")
      .eq("id", link.form_id)
      .single();
    if (formError) throw formError;
    const form = formData as FormRow;
    const now = new Date();
    if (!form.published) return json(409, { error: "這份表格暫時未公開" });
    if (form.opens_at && now < new Date(form.opens_at)) return json(409, { error: "這份表格尚未開始接受回覆" });
    if (form.closes_at && now >= new Date(form.closes_at)) return json(409, { error: "這份表格已停止接受回覆" });

    const { count: total, error: countError } = await db
      .from("inquiry_form_submissions")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id);
    if (countError) throw countError;
    if (form.max_entries && (total || 0) >= form.max_entries) {
      return json(409, { error: "這份表格已收滿回覆" });
    }

    const ip = visitorIp(req);
    const ipHash = await sha256(ip);
    if (ipHash) {
      const minuteAgo = new Date(Date.now() - 60_000).toISOString();
      const { count: recent } = await db
        .from("inquiry_form_submissions")
        .select("id", { count: "exact", head: true })
        .eq("form_id", form.id)
        .eq("visitor_ip_hash", ipHash)
        .gte("created_at", minuteAgo);
      if ((recent || 0) >= 3) return json(429, { error: "送出太頻密，請稍後再試" });
      if (form.one_entry_per_ip) {
        const { count: previous } = await db
          .from("inquiry_form_submissions")
          .select("id", { count: "exact", head: true })
          .eq("form_id", form.id)
          .eq("visitor_ip_hash", ipHash);
        if ((previous || 0) > 0) return json(409, { error: "每位訪客只可以送出一次" });
      }
    }

    const { data: fieldsData, error: fieldsError } = await db
      .from("inquiry_form_fields")
      .select("id, label, field_type, required, placeholder, options, file_max_count, file_max_size_mb, file_accept")
      .eq("form_id", form.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (fieldsError) throw fieldsError;
    const fields = (fieldsData || []) as FieldRow[];
    const fileFieldIds = new Set(fields.filter((field) => field.field_type === "file").map((field) => field.id));
    if ([...rawFiles.keys()].some((fieldId) => !fileFieldIds.has(fieldId))) {
      throw new InputError("檔案欄位不正確");
    }
    const answers = validateAnswers(fields, body.answers, rawFiles);
    const referrer = cleanText(req.headers.get("referer") || body.referrer, 1000);
    const userAgent = cleanText(req.headers.get("user-agent"), 500);
    const storedIp = form.notification_include_ip ? ip : null;
    const submissionId = crypto.randomUUID();

    for (const field of fields.filter((item) => item.field_type === "file")) {
      const files = rawFiles.get(field.id) || [];
      const stored: StoredFile[] = [];
      for (const file of files) {
        if (await hasBlockedFileContent(file)) throw new InputError(`${file.name}的檔案內容不接受`);
        const name = safeFileName(file.name);
        const path = `${form.id}/${submissionId}/${field.id}/${crypto.randomUUID()}-${name}`;
        const { error: uploadError } = await db.storage.from(FILE_BUCKET).upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);
        stored.push({ name, path, size: file.size, type: file.type });
      }
      const answer = answers.find((item) => item.fieldId === field.id);
      if (answer) answer.files = stored;
    }

    const { data: submission, error: insertError } = await db
      .from("inquiry_form_submissions")
      .insert({
        id: submissionId,
        form_id: form.id,
        link_id: link.id,
        answers,
        visitor_ip_hash: ipHash || null,
        visitor_ip: storedIp,
        referrer: referrer || null,
        user_agent: userAgent || null,
      })
      .select("id, created_at")
      .single();
    if (insertError) throw insertError;
    submissionStored = true;

    const joinedWebsite = Array.isArray(link.webandsystem_list)
      ? link.webandsystem_list[0]
      : link.webandsystem_list;
    const websiteName = cleanText(joinedWebsite?.website_name);
    const submittedAt = new Date(submission.created_at).toLocaleString("zh-HK", {
      timeZone: "Asia/Hong_Kong",
      hour12: false,
    });
    const emailAnswers: InquiryEmailAnswer[] = [];
    for (const answer of answers) {
      const links: { name: string; url: string }[] = [];
      const unavailableFileNames: string[] = [];
      for (const file of answer.files || []) {
        try {
          const { data: signed } = await db.storage.from(FILE_BUCKET).createSignedUrl(file.path, 7 * 24 * 60 * 60);
          if (signed?.signedUrl) links.push({ name: file.name, url: signed.signedUrl });
          else unavailableFileNames.push(file.name);
        } catch {
          unavailableFileNames.push(file.name);
        }
      }
      emailAnswers.push({
        label: answer.label,
        value: answer.files?.length ? unavailableFileNames : answer.value,
        files: links,
      });
    }
    let notificationError = "";
    let autoresponderError = "";

    if (form.notification_enabled && (form.notification_recipients || []).length > 0) {
      try {
        const mail = buildInquirySubmissionEmail({
          formName: form.name,
          websiteName,
          answers: emailAnswers,
          subjectTemplate: form.notification_subject,
          showEmptyFields: form.notification_show_empty_fields,
          submittedAt,
          visitorIp: form.notification_include_ip ? ip : "",
          referrer: form.notification_include_referrer ? referrer : "",
        });
        const replyTo = answerValue(answers, form.notification_reply_to_field_id);
        await sendResendEmail({
          to: form.notification_recipients,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          replyTo: validEmail(replyTo) ? replyTo : undefined,
          idempotencyKey: `inquiry-notification/${submission.id}`,
        });
      } catch (error) {
        notificationError = error instanceof Error ? error.message : String(error);
      }
    }

    if (form.autoresponder_enabled) {
      const recipient = answerValue(answers, form.autoresponder_recipient_field_id);
      if (validEmail(recipient)) {
        try {
          const mail = buildInquiryAutoresponderEmail({
            formName: form.name,
            websiteName,
            answers: emailAnswers,
            senderName: form.autoresponder_sender_name,
            subjectTemplate: form.autoresponder_subject,
            messageTemplate: form.autoresponder_message,
            includeCopy: form.autoresponder_include_copy,
          });
          await sendResendEmail({
            to: recipient,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            from: fromWithName(form.autoresponder_sender_name),
            replyTo: validEmail(form.autoresponder_reply_to) ? form.autoresponder_reply_to : undefined,
            idempotencyKey: `inquiry-autoresponder/${submission.id}`,
          });
        } catch (error) {
          autoresponderError = error instanceof Error ? error.message : String(error);
        }
      } else {
        autoresponderError = "自動回覆的收件人欄位沒有有效電郵";
      }
    }

    let asanaTaskGid = "";
    let asanaError = "";
    if (form.asana_enabled) {
      const project = cleanText(form.asana_project_gid, 32);
      const assignee = cleanText(form.asana_assignee_gid, 32);
      if (!/^\d+$/.test(project) || !/^\d+$/.test(assignee)) {
        asanaError = "未設定 Asana 專案或負責人";
      } else if (!asanaToken()) {
        asanaError = "未設定 Asana token，不會開 task";
      } else {
        try {
          const { data: rule } = await db
            .from("asana_mail_rules")
            .select("workspace_gid")
            .eq("code", "fcc")
            .maybeSingle();
          const workspace = cleanText(rule?.workspace_gid, 32);
          if (!/^\d+$/.test(workspace)) throw new Error("找不到 Asana workspace");
          const tokenAnswers = answers.map((answer) => ({ label: answer.label, value: answer.value }));
          const taskName = applyInquiryEmailTokens(
            form.asana_task_name_template || "{{form_name}}",
            { formName: form.name, websiteName, answers: tokenAnswers },
          ).replace(/[\r\n]+/g, " ").trim();
          const notes = tokenAnswers
            .map((answer) => `${answer.label}: ${(Array.isArray(answer.value) ? answer.value.join("、") : answer.value) || "—"}`)
            .join("\n");
          asanaTaskGid = await createAsanaTask({
            workspace,
            project,
            name: taskName,
            notes: [form.name, websiteName ? `網站：${websiteName}` : "", "", notes].filter((line, index) => line || index > 1).join("\n"),
            assignee,
            followers: [...new Set((form.asana_collaborator_gids || [])
              .map((gid) => cleanText(gid, 32))
              .filter((gid) => /^\d+$/.test(gid) && gid !== assignee))],
          });
          const failedFiles: string[] = [];
          for (const answer of answers) {
            const uploads = rawFiles.get(answer.fieldId) || [];
            for (const file of uploads) {
              try {
                await attachAsanaFile(asanaTaskGid, file, safeFileName(file.name));
              } catch {
                failedFiles.push(safeFileName(file.name));
              }
            }
          }
          if (failedFiles.length > 0) asanaError = `task 已開，未能上傳：${failedFiles.join("、")}`;
        } catch (error) {
          asanaError = error instanceof Error ? error.message : String(error);
        }
      }
    }

    if (notificationError || autoresponderError || asanaTaskGid || asanaError) {
      await db
        .from("inquiry_form_submissions")
        .update({
          notification_error: notificationError || null,
          autoresponder_error: autoresponderError || null,
          asana_task_gid: asanaTaskGid || null,
          asana_error: asanaError || null,
        })
        .eq("id", submission.id);
    }

    return json(200, { success: true, submissionId: submission.id });
  } catch (error) {
    if (!submissionStored && uploadedPaths.length > 0) {
      await db.storage.from(FILE_BUCKET).remove(uploadedPaths);
    }
    const message = error instanceof Error ? error.message : String(error);
    return json(error instanceof InputError || /請填|格式|選項|欄位/.test(message) ? 400 : 500, {
      error: message || "送出失敗",
    });
  }
});
