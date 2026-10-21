import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  OTC_LEAVE_API_URL,
  countLeaveKinds,
  dayReportInsertFromLeave,
  defaultLeaveWindow,
  eachMonthChunk,
  isYmd,
  normalizeLeavePayload,
  planLeaveInserts,
  splitExisting,
  type OtcLeaveSyncResult,
  type StaffMatch,
} from "../../../src/lib/otcLeaveDayReport.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_KEY") ||
  "";

const STAFF_ID_CHUNK = 80;
const DATE_PAGE = 1000;
const INSERT_CHUNK = 200;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

function ymdParam(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return isYmd(trimmed) ? trimmed : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function fetchLeaveChunk(fromYmd: string, toYmd: string): Promise<unknown[]> {
  const url = new URL(OTC_LEAVE_API_URL);
  url.searchParams.set("from", fromYmd);
  url.searchParams.set("to", toYmd);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OTC leave API ${response.status} for ${fromYmd}..${toYmd}`);
  }
  const payload = (await response.json()) as { ok?: unknown; staff?: unknown };
  if (!payload || payload.ok !== true || !Array.isArray(payload.staff)) {
    throw new Error(`OTC leave API payload is not ok for ${fromYmd}..${toYmd}`);
  }
  return payload.staff;
}

async function loadStaff(
  supabase: ReturnType<typeof createClient>,
  otcStaffIds: string[],
): Promise<Map<string, StaffMatch>> {
  const map = new Map<string, StaffMatch>();
  const statusByOtcId = new Map<string, string>();
  const numericIds = otcStaffIds
    .map((id) => Number(id))
    .filter((id) => Number.isSafeInteger(id));
  for (const ids of chunk(numericIds, STAFF_ID_CHUNK)) {
    const { data, error } = await supabase
      .from("staffs")
      .select("id, display_name, otc_staff_id, company_list_id, status")
      .in("otc_staff_id", ids);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const otcStaffId = row.otc_staff_id == null ? "" : String(row.otc_staff_id).trim();
      const id = typeof row.id === "string" ? row.id : "";
      if (!otcStaffId || !id) continue;
      const status = typeof row.status === "string" ? row.status : "";
      const currentStatus = statusByOtcId.get(otcStaffId);
      if (currentStatus === "active") continue;
      if (currentStatus && status !== "active") continue;
      map.set(otcStaffId, {
        id,
        name: typeof row.display_name === "string" ? row.display_name.trim() : "",
        companyListId: typeof row.company_list_id === "string" ? row.company_list_id : null,
      });
      statusByOtcId.set(otcStaffId, status);
    }
  }
  return map;
}

async function loadExistingKeys(
  supabase: ReturnType<typeof createClient>,
  staffIds: string[],
  fromYmd: string,
  toYmd: string,
): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const ids of chunk(staffIds, STAFF_ID_CHUNK)) {
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("day_reports")
        .select("staff_id, report_date")
        .in("staff_id", ids)
        .gte("report_date", fromYmd)
        .lte("report_date", toYmd)
        .order("staff_id")
        .order("report_date")
        .range(from, from + DATE_PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      for (const row of rows) {
        const staffId = typeof row.staff_id === "string" ? row.staff_id : "";
        const reportDate = typeof row.report_date === "string" ? row.report_date.slice(0, 10) : "";
        if (staffId && isYmd(reportDate)) keys.add(`${staffId}|${reportDate}`);
      }
      if (rows.length < DATE_PAGE) break;
      from += DATE_PAGE;
    }
  }
  return keys;
}

async function syncOtcLeaveDayReports(
  supabase: ReturnType<typeof createClient>,
  options: { from: string; to: string; dryRun: boolean },
): Promise<OtcLeaveSyncResult> {
  const { from, to, dryRun } = options;
  const rawStaff: unknown[] = [];
  for (const slice of eachMonthChunk(from, to)) {
    rawStaff.push(...await fetchLeaveChunk(slice.from, slice.to));
  }

  const normalized = normalizeLeavePayload(rawStaff);
  const staffByOtcId = await loadStaff(
    supabase,
    normalized.map((person) => person.otcStaffId),
  );
  const { planned, unmatched } = planLeaveInserts(normalized, staffByOtcId, from, to);
  const staffIds = [...new Set(planned.map((row) => row.staffId))];
  const existing = staffIds.length > 0
    ? await loadExistingKeys(supabase, staffIds, from, to)
    : new Set<string>();
  const { toCreate, skippedExisting } = splitExisting(planned, existing);
  const { fullDay, halfDay } = countLeaveKinds(toCreate);

  if (!dryRun && toCreate.length > 0) {
    for (const batch of chunk(toCreate, INSERT_CHUNK)) {
      const { error } = await supabase
        .from("day_reports")
        .insert(batch.map((row) => dayReportInsertFromLeave(row)));
      if (error) throw new Error(error.message);
    }
  }

  return {
    dryRun,
    from,
    to,
    created: dryRun ? 0 : toCreate.length,
    wouldCreate: toCreate.length,
    skippedExisting,
    unmatchedStaff: unmatched.length,
    unmatchedNames: unmatched.map((person) => person.displayName).slice(0, 30),
    fullDay,
    halfDay,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  if (!isServiceRole(req)) {
    return json(403, { error: "OTC leave day-report sync requires the service role" });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "Missing SUPABASE_URL or service role key" });
  }

  const url = new URL(req.url);
  const body = req.method === "POST"
    ? await req.json().catch(() => ({})) as { from?: unknown; to?: unknown; dryRun?: unknown }
    : {};

  const fromRaw = url.searchParams.get("from") ?? (typeof body.from === "string" ? body.from : null);
  const toRaw = url.searchParams.get("to") ?? (typeof body.to === "string" ? body.to : null);
  const from = ymdParam(fromRaw);
  const to = ymdParam(toRaw);
  if ((fromRaw && !from) || (toRaw && !to)) {
    return json(400, { error: "from and to must be YYYY-MM-DD." });
  }
  if ((from && !to) || (!from && to)) {
    return json(400, { error: "Pass both from and to, or neither for the ±14 day window." });
  }
  if (from && to && from > to) {
    return json(400, { error: "from must be on or before to." });
  }

  const dryRaw = url.searchParams.get("dryRun");
  const dryRun = dryRaw === "1" || dryRaw === "true" || body.dryRun === true || body.dryRun === 1 ||
    body.dryRun === "1";
  const window = from && to ? { from, to } : defaultLeaveWindow();

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const result = await syncOtcLeaveDayReports(supabase, { ...window, dryRun });
    return json(200, { ok: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "OTC leave day-report sync failed";
    console.error("[otc-leave-day-report]", message);
    return json(500, { error: message });
  }
});
