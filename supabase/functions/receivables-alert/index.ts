import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CANONICAL_SITE_URL } from "../../../src/lib/siteUrl.ts";
import {
  buildReceivablesAlertEmail,
  chunkRecipients,
  hongKongIsoDate,
  receivablesAlertIdempotencyKey,
  selectAlertRecipients,
  type ReceivableAlertLine,
  type ReceivableAlertProject,
} from "../../../src/lib/receivablesAlert.ts";
import { sendResendEmail } from "../_shared/resend.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

const PAGE_SIZE = 1000;
const IN_CHUNK = 200;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type IncomeRow = {
  id: string;
  quotation_client_project_id: string;
  type: string | null;
  installment_number: number | null;
  currency: string | null;
  billed_amount: number | string | null;
  due_date: string | null;
  payment_amount: number | string | null;
  payment_status: string | null;
  outstanding: number | string | null;
  remarks: string | null;
};

type ProjectRow = {
  id: string;
  display_name: string | null;
  client_name: string | null;
  status: string | null;
  quotation_client_list?: ClientRow | ClientRow[] | null;
};

type ClientRow = {
  company_name_zh: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isServiceRole(req: Request): boolean {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const payload = token.split(".")[1];
  if (!payload) return false;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(normalized)) as { role?: string };
    return claims.role === "service_role";
  } catch {
    return false;
  }
}

function amount(value: number | string | null | undefined): number {
  const parsed = value == null ? 0 : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function firstClient(value: ProjectRow["quotation_client_list"]): ClientRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  if (!isServiceRole(req)) {
    return json(403, { error: "Receivables alert cron requires the service role" });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "Missing SUPABASE_URL or service role key" });
  }

  const body = await req.json().catch(() => ({})) as { dryRun?: boolean };
  const dryRun = body.dryRun === true;
  const asOf = hongKongIsoDate();
  const siteOrigin = (Deno.env.get("APP_PUBLIC_URL") || CANONICAL_SITE_URL).replace(/\/$/, "");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const incomes = await fetchOutstandingIncomes(supabase);
    const projects = await fetchProjects(supabase, incomes);
    const reportProjects = groupProjects(incomes, projects);
    const email = buildReceivablesAlertEmail({
      asOf,
      siteOrigin,
      projects: reportProjects,
    });

    if (dryRun) {
      return json(200, {
        ok: true,
        dryRun: true,
        asOf,
        rows: email.summary.count,
        overdue: email.summary.overdue,
        outstanding: email.summary.outstanding,
        omittedLineCount: email.omittedLineCount,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
    }

    if (email.summary.count === 0) {
      return json(200, {
        ok: true,
        sent: false,
        reason: "no outstanding receivables",
        asOf,
        rows: 0,
      });
    }

    const recipients = selectAlertRecipients(Deno.env.get("RECEIVABLES_ALERT_TO"));
    if (!recipients.length) {
      return json(500, { error: "No receivables alert recipients" });
    }

    const batches = chunkRecipients(recipients);
    const ids: string[] = [];
    for (let index = 0; index < batches.length; index += 1) {
      const sent = await sendResendEmail({
        to: batches[index],
        subject: email.subject,
        html: email.html,
        text: email.text,
        idempotencyKey: receivablesAlertIdempotencyKey(asOf, index + 1),
      });
      if (sent.id) ids.push(sent.id);
    }

    return json(200, {
      ok: true,
      sent: true,
      asOf,
      recipients: recipients.length,
      batches: batches.length,
      rows: email.summary.count,
      overdue: email.summary.overdue,
      outstanding: email.summary.outstanding,
      ids,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(502, { error: message });
  }
});

async function fetchOutstandingIncomes(
  supabase: ReturnType<typeof createClient>,
): Promise<IncomeRow[]> {
  const rows: IncomeRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("incomes")
      .select(
        "id, quotation_client_project_id, type, installment_number, currency, billed_amount, due_date, payment_amount, payment_status, outstanding, remarks",
      )
      .gt("outstanding", 0)
      .order("due_date", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as IncomeRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchProjects(
  supabase: ReturnType<typeof createClient>,
  incomes: IncomeRow[],
): Promise<Map<string, ProjectRow>> {
  const ids = [...new Set(incomes.map((row) => text(row.quotation_client_project_id)).filter(Boolean))];
  const projects = new Map<string, ProjectRow>();
  for (let index = 0; index < ids.length; index += IN_CHUNK) {
    const chunk = ids.slice(index, index + IN_CHUNK);
    const { data, error } = await supabase
      .from("quotation_client_project")
      .select(
        "id, display_name, client_name, status, quotation_client_list ( company_name_zh, contact_person, phone, email )",
      )
      .in("id", chunk);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as ProjectRow[]) {
      projects.set(String(row.id), row);
    }
  }
  return projects;
}

function groupProjects(incomes: IncomeRow[], projects: Map<string, ProjectRow>): ReceivableAlertProject[] {
  const grouped = new Map<string, ReceivableAlertProject>();
  for (const income of incomes) {
    const projectId = text(income.quotation_client_project_id);
    const project = projects.get(projectId);
    const client = firstClient(project?.quotation_client_list);
    const existing = grouped.get(projectId);
    const line: ReceivableAlertLine = {
      id: String(income.id),
      typeLabel: text(income.type) || "未分類",
      installmentNumber: income.installment_number ?? undefined,
      currency: text(income.currency) || "HKD",
      billedAmount: amount(income.billed_amount),
      paymentAmount: amount(income.payment_amount),
      outstanding: amount(income.outstanding),
      dueDate: text(income.due_date) || undefined,
      paymentStatus: text(income.payment_status) || undefined,
      remarks: text(income.remarks) || undefined,
    };
    if (existing) {
      existing.lines.push(line);
      continue;
    }
    grouped.set(projectId, {
      projectId,
      projectName: text(project?.display_name) || "未指定項目",
      projectStatus: text(project?.status) || undefined,
      clientName: text(client?.company_name_zh) || text(project?.client_name) || "—",
      contactPerson: text(client?.contact_person) || undefined,
      phone: text(client?.phone) || undefined,
      email: text(client?.email) || undefined,
      lines: [line],
    });
  }
  return [...grouped.values()];
}
