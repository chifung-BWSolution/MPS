import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAnnualFeeGroups, type AnnualFeeIncomeRow } from "../../../src/lib/annualFeeIncomes.ts";
import {
  buildAnnualFeeReminderEmails,
  type AnnualFeeProjectPm,
} from "../../../src/lib/annualFeeReminder.ts";
import { parseSystemCurrency } from "../../../src/lib/currency.ts";
import {
  financeProjectTypeFromRef,
  financeProjectTypeKeyFromType,
  indexFinanceProjectTypes,
} from "../../../src/lib/financeProjectType.ts";
import { CANONICAL_SITE_URL } from "../../../src/lib/siteUrl.ts";
import { hongKongIsoDate } from "../../../src/lib/receivablesAlert.ts";
import { sendResendEmail } from "../_shared/resend.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

const PAGE_SIZE = 1000;
const IN_CHUNK = 200;
const SEND_GAP_MS = 600;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type IncomeRow = {
  id: string;
  quotation_client_project_id: string | null;
  type: string | null;
  installment_number: number | null;
  currency: string | null;
  billed_amount: number | string | null;
  due_date: string | null;
  payment_amount: number | string | null;
  payment_status: string | null;
  outstanding: number | string | null;
};

type StaffRow = {
  id: string;
  display_name: string | null;
  work_email: string | null;
  status: string | null;
};

type ProjectRow = {
  id: string;
  display_name: string | null;
  client_name: string | null;
  status: string | null;
  project_types: string | null;
  main_pm_id: string | null;
  main_pm?: StaffRow | StaffRow[] | null;
};

type ProjectTypeRow = {
  id: string;
  code: string;
  display: string;
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

function firstStaff(value: ProjectRow["main_pm"]): StaffRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isIdempotentReplay(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /idempoten/i.test(message) || /\b409\b/.test(message);
}

function isRetryableSendError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes("429") || message.includes("rate") || message.includes("too many") ||
    message.includes("500") || message.includes("timeout") || message.includes("temporar");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  if (!isServiceRole(req)) {
    return json(403, { error: "Annual fees reminder cron requires the service role" });
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
    const incomes = await fetchIncomes(supabase);
    const projects = await fetchProjects(supabase, incomes);
    const projectTypes = await fetchProjectTypes(supabase);
    const rows = mapIncomes(incomes, projects, projectTypes);
    const groups = buildAnnualFeeGroups(rows, { asOf });
    const assignments = groups.map((group) => assignmentFor(group.projectId, group.projectName, projects));
    const report = buildAnnualFeeReminderEmails({
      asOf,
      siteOrigin,
      groups,
      assignments,
    });

    if (groups.length === 0) {
      return json(200, {
        ok: true,
        sent: false,
        reason: "no annual fee projects",
        asOf,
        projects: 0,
      });
    }

    if (dryRun) {
      return json(200, {
        ok: true,
        dryRun: true,
        asOf,
        projects: groups.length,
        recipients: report.emails.length,
        skipped: report.skipped,
        summary: report.summary,
        emails: report.emails.map((email) => ({
          to: email.to,
          staffId: email.staffId,
          name: email.name,
          subject: email.subject,
          ownedProjectIds: email.ownedProjectIds,
          idempotencyKey: email.idempotencyKey,
          text: email.text,
          html: email.html,
        })),
      });
    }

    if (report.emails.length === 0) {
      return json(200, {
        ok: true,
        sent: false,
        reason: "no main pm recipients",
        asOf,
        projects: groups.length,
        skipped: report.skipped,
      });
    }

    const ids: string[] = [];
    const failed: { to: string; error: string }[] = [];
    for (let index = 0; index < report.emails.length; index += 1) {
      const email = report.emails[index];
      if (index > 0) await delay(SEND_GAP_MS);
      try {
        const sent = await sendWithRetry(email);
        if (sent.id) ids.push(sent.id);
      } catch (err) {
        if (isIdempotentReplay(err)) continue;
        failed.push({
          to: email.to,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (failed.length) {
      return json(502, {
        ok: false,
        sent: ids.length > 0,
        asOf,
        projects: groups.length,
        recipients: report.emails.length,
        ids,
        skipped: report.skipped,
        failed,
      });
    }

    return json(200, {
      ok: true,
      sent: true,
      asOf,
      projects: groups.length,
      recipients: report.emails.length,
      ids,
      skipped: report.skipped,
      upcomingAmount: report.summary.upcomingAmount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(502, { error: message });
  }
});

async function sendWithRetry(email: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await sendResendEmail({
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        idempotencyKey: email.idempotencyKey,
      });
    } catch (err) {
      lastError = err;
      if (!isRetryableSendError(err) || attempt === 2) throw err;
      await delay(1000 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Resend API error");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assignmentFor(
  projectId: string,
  projectName: string,
  projects: Map<string, ProjectRow>,
): AnnualFeeProjectPm {
  const project = projects.get(projectId);
  const staff = firstStaff(project?.main_pm);
  const active = text(staff?.status).toLowerCase() === "active";
  return {
    projectId,
    projectName,
    staffId: text(staff?.id) || text(project?.main_pm_id) || undefined,
    name: text(staff?.display_name) || undefined,
    email: text(staff?.work_email) || undefined,
    active: staff ? active : undefined,
  };
}

function mapIncomes(
  incomes: IncomeRow[],
  projects: Map<string, ProjectRow>,
  projectTypes: ProjectTypeRow[],
): AnnualFeeIncomeRow[] {
  const projectTypeByRef = indexFinanceProjectTypes(projectTypes);
  return incomes.flatMap((income) => {
    const projectId = text(income.quotation_client_project_id);
    if (!projectId) return [];
    const project = projects.get(projectId);
    const projectTypeKey = financeProjectTypeKeyFromType(
      financeProjectTypeFromRef(project?.project_types, projectTypeByRef),
    );
    const dueDate = text(income.due_date).slice(0, 10);
    const row: AnnualFeeIncomeRow = {
      id: String(income.id),
      projectName: text(project?.display_name) || "未指定項目",
      clientName: text(project?.client_name) || "—",
      quotationClientProjectId: projectId,
      projectStatus: text(project?.status) || undefined,
      projectTypeKey,
      typeLabel: text(income.type) || "未分類",
      installmentNumber: income.installment_number ?? undefined,
      currency: parseSystemCurrency(income.currency),
      billedAmount: amount(income.billed_amount),
      paymentAmount: amount(income.payment_amount),
      outstanding: amount(income.outstanding),
      dueDate: dueDate || undefined,
      paymentStatus: text(income.payment_status) || undefined,
    };
    return [row];
  });
}

async function fetchIncomes(
  supabase: ReturnType<typeof createClient>,
): Promise<IncomeRow[]> {
  const rows: IncomeRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("incomes")
      .select(
        "id, quotation_client_project_id, type, installment_number, currency, billed_amount, due_date, payment_amount, payment_status, outstanding",
      )
      .order("id", { ascending: true })
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
        "id, display_name, client_name, status, project_types, main_pm_id, main_pm:staffs!main_pm_id ( id, display_name, work_email, status )",
      )
      .in("id", chunk);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as ProjectRow[]) {
      projects.set(String(row.id), row);
    }
  }
  return projects;
}

async function fetchProjectTypes(
  supabase: ReturnType<typeof createClient>,
): Promise<ProjectTypeRow[]> {
  const { data, error } = await supabase
    .from("quotation_project_types")
    .select("id, code, display");
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjectTypeRow[];
}
