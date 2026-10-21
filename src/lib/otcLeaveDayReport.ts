/**
 * Approved OTC leave → missing day_reports headers.
 *
 * Source: public staffLeaveApi (approved leave only).
 * Match: staffs.otc_staff_id = staff_row_id. Do not use bubble_id.
 * Required hours go on target_hours (0, 4, or 4.5). total_hours stays 0
 * because this job does not create day_report_entries.
 * MPS has no trigger that sets is_leave from hours, so a 0-hour day sets
 * is_leave itself. A weekday half day sets is_half_day and leaves the report
 * unfinished until logged task hours reach target_hours.
 */

export const OTC_LEAVE_API_URL =
  "https://zwhbfphavcxncfmcrwrr.supabase.co/functions/v1/staffLeaveApi";

/** company_list row for BW-CFB (志豐設計深圳). Same id PMS uses as the BW Shenzhen cost centre. */
export const BW_SHENZHEN_COMPANY_LIST_ID = "63f26ec3-6ece-4066-859e-7ff2b0d73f5a";

export const OTC_LEAVE_LOOKAROUND_DAYS = 14;

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface LeaveSlice {
  date: string;
  days: number;
  periodCode: string;
}

export interface LeaveHourDecision {
  hours: number;
  kind: "full" | "half";
}

export interface NormalizedLeaveStaff {
  otcStaffId: string;
  displayName: string;
  byDate: Map<string, LeaveSlice[]>;
}

export interface StaffMatch {
  id: string;
  name: string;
  companyListId: string | null;
}

export interface PlannedLeaveInsert {
  staffId: string;
  otcStaffId: string;
  displayName: string;
  date: string;
  totalWorkHour: number;
  kind: "full" | "half";
  companyListId: string | null;
}

export interface DayReportLeaveInsert {
  staff_id: string;
  otc_staff_id: number | null;
  report_date: string;
  total_hours: number;
  target_hours: number;
  ot_hours: number;
  is_leave: boolean;
  is_half_day: boolean;
  is_weekend: boolean;
  office_location: "hk" | "sz";
  status: "submitted";
}

export interface OtcLeaveSyncResult {
  dryRun: boolean;
  from: string;
  to: string;
  created: number;
  wouldCreate: number;
  skippedExisting: number;
  unmatchedStaff: number;
  unmatchedNames: string[];
  fullDay: number;
  halfDay: number;
}

export function isYmd(value: string): boolean {
  return YMD_RE.test(value);
}

/** Weekday of a calendar date. 0 = Sunday … 6 = Saturday. Uses the YMD itself. */
export function calendarWeekday(ymd: string): number {
  const match = YMD_RE.exec(ymd);
  if (!match) return Number.NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addYmdDays(ymd: string, days: number): string {
  const match = YMD_RE.exec(ymd);
  if (!match) throw new Error(`Invalid date ${ymd}`);
  const next = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  );
  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, "0");
  const day = String(next.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function hongKongTodayYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function defaultLeaveWindow(now: Date = new Date()): { from: string; to: string } {
  const today = hongKongTodayYmd(now);
  return {
    from: addYmdDays(today, -OTC_LEAVE_LOOKAROUND_DAYS),
    to: addYmdDays(today, OTC_LEAVE_LOOKAROUND_DAYS),
  };
}

/** Inclusive calendar-month slices so one long API response cannot fail the range. */
export function eachMonthChunk(
  fromYmd: string,
  toYmd: string,
): Array<{ from: string; to: string }> {
  if (!isYmd(fromYmd) || !isYmd(toYmd) || fromYmd > toYmd) return [];
  const chunks: Array<{ from: string; to: string }> = [];
  let cursor = fromYmd;
  while (cursor <= toYmd) {
    const match = YMD_RE.exec(cursor);
    if (!match) break;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const monthLast = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = `${match[1]}-${match[2]}-${String(monthLast).padStart(2, "0")}`;
    const chunkTo = monthEnd < toYmd ? monthEnd : toYmd;
    chunks.push({ from: cursor, to: chunkTo });
    if (chunkTo >= toYmd) break;
    cursor = addYmdDays(chunkTo, 1);
  }
  return chunks;
}

export function isBwShenzhenCompany(companyListId: string | null | undefined): boolean {
  return (companyListId || "").trim().toLowerCase() === BW_SHENZHEN_COMPANY_LIST_ID;
}

function asDays(value: unknown, periodCode: string): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (Number.isFinite(numeric)) return numeric;
  if (periodCode === "FD") return 1;
  if (periodCode === "AM" || periodCode === "PM") return 0.5;
  return 0;
}

export function hoursForLeaveDay(
  ymd: string,
  slices: LeaveSlice[],
  companyListId?: string | null,
): LeaveHourDecision | null {
  if (!isYmd(ymd) || slices.length === 0) return null;
  let totalDays = 0;
  const codes: string[] = [];
  for (const slice of slices) {
    totalDays += slice.days;
    if (slice.periodCode) codes.push(slice.periodCode);
  }
  totalDays = Math.round(totalDays * 100) / 100;
  if (totalDays >= 1 || codes.includes("FD")) {
    return { hours: 0, kind: "full" };
  }
  const halfDay =
    totalDays === 0.5 ||
    (totalDays > 0 &&
      totalDays < 1 &&
      (codes.includes("AM") || codes.includes("PM")));
  if (!halfDay) return null;
  const weekday = calendarWeekday(ymd);
  const weekend = weekday === 0 || weekday === 6;
  const hours = weekend ? 0 : isBwShenzhenCompany(companyListId) ? 4.5 : 4;
  return { hours, kind: "half" };
}

export function normalizeLeavePayload(staff: unknown[]): NormalizedLeaveStaff[] {
  const byId = new Map<string, NormalizedLeaveStaff>();
  for (const row of staff) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const otcStaffId =
      record.staff_row_id == null ? "" : String(record.staff_row_id).trim();
    if (!otcStaffId) continue;
    let entry = byId.get(otcStaffId);
    if (!entry) {
      entry = {
        otcStaffId,
        displayName:
          typeof record.display_name === "string" ? record.display_name.trim() : "",
        byDate: new Map(),
      };
      byId.set(otcStaffId, entry);
    } else if (!entry.displayName && typeof record.display_name === "string") {
      entry.displayName = record.display_name.trim();
    }
    const leaves = Array.isArray(record.leaves) ? record.leaves : [];
    for (const leave of leaves) {
      if (!leave || typeof leave !== "object") continue;
      const item = leave as Record<string, unknown>;
      const date = typeof item.date === "string" ? item.date.trim() : "";
      if (!isYmd(date)) continue;
      const periodCode =
        typeof item.period_code === "string"
          ? item.period_code.trim().toUpperCase()
          : "";
      const list = entry.byDate.get(date) ?? [];
      list.push({ date, days: asDays(item.days, periodCode), periodCode });
      entry.byDate.set(date, list);
    }
  }
  return [...byId.values()];
}

export function planLeaveInserts(
  staff: NormalizedLeaveStaff[],
  mpsByOtcId: Map<string, StaffMatch>,
  fromYmd: string,
  toYmd: string,
): { planned: PlannedLeaveInsert[]; unmatched: Array<{ otcStaffId: string; displayName: string }> } {
  const planned: PlannedLeaveInsert[] = [];
  const unmatched: Array<{ otcStaffId: string; displayName: string }> = [];

  for (const person of staff) {
    const mps = mpsByOtcId.get(person.otcStaffId);
    let needsRow = false;
    const rows: PlannedLeaveInsert[] = [];
    for (const [date, slices] of person.byDate) {
      if (date < fromYmd || date > toYmd) continue;
      const decision = hoursForLeaveDay(date, slices, mps?.companyListId);
      if (!decision) continue;
      needsRow = true;
      if (!mps) continue;
      rows.push({
        staffId: mps.id,
        otcStaffId: person.otcStaffId,
        displayName: mps.name || person.displayName,
        date,
        totalWorkHour: decision.hours,
        kind: decision.kind,
        companyListId: mps.companyListId,
      });
    }
    if (needsRow && !mps) {
      unmatched.push({
        otcStaffId: person.otcStaffId,
        displayName: person.displayName || person.otcStaffId,
      });
    } else {
      planned.push(...rows);
    }
  }

  planned.sort((a, b) =>
    a.date === b.date
      ? a.displayName.localeCompare(b.displayName)
      : a.date.localeCompare(b.date),
  );
  return { planned, unmatched };
}

export function splitExisting(
  planned: PlannedLeaveInsert[],
  existing: Set<string>,
): { toCreate: PlannedLeaveInsert[]; skippedExisting: number } {
  const toCreate: PlannedLeaveInsert[] = [];
  let skippedExisting = 0;
  for (const row of planned) {
    if (existing.has(`${row.staffId}|${row.date}`)) skippedExisting += 1;
    else toCreate.push(row);
  }
  return { toCreate, skippedExisting };
}

export function dayReportInsertFromLeave(row: PlannedLeaveInsert): DayReportLeaveInsert {
  const weekday = calendarWeekday(row.date);
  const weekend = weekday === 0 || weekday === 6;
  const hours = row.totalWorkHour;
  const otcStaffId = Number(row.otcStaffId);
  return {
    staff_id: row.staffId,
    otc_staff_id: Number.isSafeInteger(otcStaffId) ? otcStaffId : null,
    report_date: row.date,
    total_hours: 0,
    target_hours: hours,
    ot_hours: 0,
    is_leave: hours === 0,
    is_half_day: hours > 0,
    is_weekend: weekend,
    office_location: isBwShenzhenCompany(row.companyListId) ? "sz" : "hk",
    status: "submitted",
  };
}

export function countLeaveKinds(rows: PlannedLeaveInsert[]): { fullDay: number; halfDay: number } {
  let fullDay = 0;
  let halfDay = 0;
  for (const row of rows) {
    if (row.kind === "full") fullDay += 1;
    else halfDay += 1;
  }
  return { fullDay, halfDay };
}
