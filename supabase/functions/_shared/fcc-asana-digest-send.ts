import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildFccAsanaDigestEmail,
  fccAsanaTaskUrl,
  fccDigestCron,
  fccDigestIsDue,
  fccDigestProjectLabels,
  hongKongParts,
  normalizeDigestRecipients,
  type FccDigestCadence,
  type FccDigestTask,
} from "../../../src/lib/fccAsanaDigest.ts";
import { sendResendEmail } from "./resend.ts";

const ASANA_API = "https://app.asana.com/api/1.0";

type Admin = ReturnType<typeof createClient>;

type DigestRule = {
  digest_enabled: boolean;
  digest_recipients: string[] | null;
  digest_send_time: string | null;
  digest_cadence: string | null;
  digest_weekday: number | null;
  digest_last_sent_on: string | null;
};

function cadenceOf(value: string | null): FccDigestCadence {
  if (value === "weekdays" || value === "weekly") return value;
  return "daily";
}

async function asanaFacts(gid: string): Promise<Pick<FccDigestTask, "completed" | "assignee" | "projects">> {
  const empty = { completed: null, assignee: "", projects: [] as string[] };
  const token = Deno.env.get("ASANA_FCC_ACCESS_TOKEN")?.trim() || Deno.env.get("ASANA_ACCESS_TOKEN")?.trim() || "";
  if (!token) return empty;
  const res = await fetch(
    `${ASANA_API}/tasks/${gid}?opt_fields=completed,assignee.name,memberships.project.name,memberships.section.name`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const payload = await res.json() as {
    data?: {
      completed?: boolean;
      assignee?: { name?: string } | null;
      memberships?: Array<{ project?: { name?: string }; section?: { name?: string } }>;
    };
  };
  if (!res.ok || !payload.data) return empty;
  const projects = (payload.data.memberships || []).map((item) => ({
    name: String(item.project?.name || ""),
    section: String(item.section?.name || ""),
  }));
  return {
    completed: payload.data.completed === true,
    assignee: String(payload.data.assignee?.name || "").trim(),
    projects: fccDigestProjectLabels(projects),
  };
}

async function loadRule(supabase: Admin): Promise<DigestRule | null> {
  const { data, error } = await supabase
    .from("asana_mail_rules")
    .select("digest_enabled, digest_recipients, digest_send_time, digest_cadence, digest_weekday, digest_last_sent_on")
    .eq("code", "fcc")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as DigestRule | null;
}

async function todayTasks(supabase: Admin, now: Date): Promise<FccDigestTask[]> {
  const today = hongKongParts(now).date;
  const start = new Date(`${today}T00:00:00+08:00`).toISOString();
  const end = new Date(new Date(`${today}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const jobs = await supabase
    .from("asana_mail_jobs")
    .select("task_name, subject, asana_task_gid, created_at")
    .eq("rule_code", "fcc")
    .eq("status", "created")
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: true });
  if (jobs.error) throw new Error(jobs.error.message);
  const tasks: FccDigestTask[] = [];
  for (const job of jobs.data || []) {
    const gid = String(job.asana_task_gid || "").trim();
    if (!gid) continue;
    const facts = await asanaFacts(gid);
    tasks.push({
      title: String(job.task_name || job.subject || "FC 查詢").trim(),
      url: fccAsanaTaskUrl(gid),
      ...facts,
    });
  }
  return tasks;
}

export async function sendFccAsanaDigestIfDue(supabase: Admin, now = new Date()): Promise<Record<string, unknown>> {
  const rule = await loadRule(supabase);
  if (!rule) return { skipped: "no-rule" };
  const sendTime = String(rule.digest_send_time || "18:00");
  const cadence = cadenceOf(rule.digest_cadence);
  const weekday = Number(rule.digest_weekday || 1);
  const due = fccDigestIsDue({
    enabled: rule.digest_enabled === true,
    sendTime,
    cadence,
    weekday,
    lastSentOn: rule.digest_last_sent_on,
    now,
  });
  if (!due) return { skipped: "not-due" };
  const recipients = normalizeDigestRecipients(rule.digest_recipients || []);
  if (recipients.length === 0) return { skipped: "no-recipients" };

  const today = hongKongParts(now).date;
  const tasks = await todayTasks(supabase, now);
  const email = buildFccAsanaDigestEmail({ date: today, tasks });
  const sent = await sendResendEmail({
    to: recipients,
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: `fcc-asana-digest/${today}`,
  });
  const saved = await supabase
    .from("asana_mail_rules")
    .update({ digest_last_sent_on: today })
    .eq("code", "fcc");
  if (saved.error) throw new Error(saved.error.message);
  return { sent: true, id: sent.id, count: tasks.length, to: recipients.length };
}

export async function sendFccAsanaDigestTest(supabase: Admin, to: string, now = new Date()): Promise<Record<string, unknown>> {
  const recipients = normalizeDigestRecipients([to]);
  if (recipients.length === 0) throw new Error("請輸入有效電郵");
  const today = hongKongParts(now).date;
  const tasks = await todayTasks(supabase, now);
  const email = buildFccAsanaDigestEmail({
    date: today,
    tasks,
    notice: "這是測試信，只寄給你輸入的電郵。下面是今日實際新開的 task。",
  });
  const sent = await sendResendEmail({
    to: recipients,
    subject: `【測試】${email.subject}`,
    html: email.html,
    text: `這是測試信，只寄給你輸入的電郵。\n\n${email.text}`,
    idempotencyKey: `fcc-asana-digest-test/${today}/${recipients[0]}/${now.getTime()}`,
  });
  return { sent: true, id: sent.id, count: tasks.length, to: recipients[0] };
}

export async function rescheduleFccAsanaDigest(supabase: Admin): Promise<Record<string, unknown>> {
  const rule = await loadRule(supabase);
  if (!rule) throw new Error("尚未設定 FCC 規則");
  const cron = fccDigestCron({
    sendTime: String(rule.digest_send_time || "18:00"),
    cadence: cadenceOf(rule.digest_cadence),
    weekday: Number(rule.digest_weekday || 1),
  });
  const { error } = await supabase.rpc("reschedule_fcc_asana_digest", { cron_expr: cron });
  if (error) throw new Error(error.message);
  return { cron };
}
