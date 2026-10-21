import assert from "node:assert/strict";
import {
  BW_SHENZHEN_COMPANY_LIST_ID,
  addYmdDays,
  calendarWeekday,
  countLeaveKinds,
  dayReportInsertFromLeave,
  defaultLeaveWindow,
  eachMonthChunk,
  hoursForLeaveDay,
  normalizeLeavePayload,
  planLeaveInserts,
  splitExisting,
  type LeaveSlice,
} from "../src/lib/otcLeaveDayReport.ts";

function slice(date: string, days: number, periodCode: string): LeaveSlice {
  return { date, days, periodCode };
}

assert.equal(calendarWeekday("2026-10-17"), 6);
assert.equal(calendarWeekday("2026-10-18"), 0);
assert.equal(calendarWeekday("2026-10-20"), 2);
assert.equal(calendarWeekday("2026-08-07"), 5);

assert.deepEqual(
  hoursForLeaveDay("2026-10-21", [slice("2026-10-21", 1, "FD")]),
  { hours: 0, kind: "full" },
);
assert.deepEqual(
  hoursForLeaveDay("2026-10-21", [slice("2026-10-21", 1, "FD")], BW_SHENZHEN_COMPANY_LIST_ID),
  { hours: 0, kind: "full" },
);

assert.deepEqual(
  hoursForLeaveDay("2026-10-21", [
    slice("2026-10-21", 0.5, "AM"),
    slice("2026-10-21", 0.5, "PM"),
  ]),
  { hours: 0, kind: "full" },
);

assert.deepEqual(
  hoursForLeaveDay("2026-10-20", [slice("2026-10-20", 0.5, "AM")]),
  { hours: 4, kind: "half" },
);
assert.deepEqual(
  hoursForLeaveDay("2026-10-16", [slice("2026-10-16", 0.5, "PM")]),
  { hours: 4, kind: "half" },
);
assert.deepEqual(
  hoursForLeaveDay(
    "2026-10-20",
    [slice("2026-10-20", 0.5, "AM")],
    BW_SHENZHEN_COMPANY_LIST_ID,
  ),
  { hours: 4.5, kind: "half" },
);
assert.deepEqual(
  hoursForLeaveDay("2026-07-10", [slice("2026-07-10", 0.5, "AM")], BW_SHENZHEN_COMPANY_LIST_ID),
  { hours: 4.5, kind: "half" },
);
assert.deepEqual(
  hoursForLeaveDay("2026-08-06", [slice("2026-08-06", 0.5, "PM")], BW_SHENZHEN_COMPANY_LIST_ID),
  { hours: 4.5, kind: "half" },
);
assert.deepEqual(
  hoursForLeaveDay("2026-08-07", [slice("2026-08-07", 0.5, "AM")], BW_SHENZHEN_COMPANY_LIST_ID),
  { hours: 4.5, kind: "half" },
);

assert.deepEqual(
  hoursForLeaveDay("2026-10-17", [slice("2026-10-17", 0.5, "AM")]),
  { hours: 0, kind: "half" },
);
assert.deepEqual(
  hoursForLeaveDay(
    "2026-10-18",
    [slice("2026-10-18", 0.5, "PM")],
    BW_SHENZHEN_COMPANY_LIST_ID,
  ),
  { hours: 0, kind: "half" },
);

assert.equal(
  hoursForLeaveDay("2026-10-20", [slice("2026-10-20", 0.25, "XX")]),
  null,
);

const missingDays = normalizeLeavePayload([
  {
    bubble_id: "ignore-me",
    staff_row_id: 164,
    display_name: "Alpha Chow",
    leaves: [
      { date: "2026-10-15", period_code: "FD" },
      { date: "2026-10-16", period_code: "am" },
    ],
  },
]);
assert.equal(missingDays[0].byDate.get("2026-10-15")?.[0].days, 1);
assert.equal(missingDays[0].byDate.get("2026-10-16")?.[0].days, 0.5);
assert.equal(missingDays[0].byDate.get("2026-10-16")?.[0].periodCode, "AM");

const merged = normalizeLeavePayload([
  {
    staff_row_id: 164,
    display_name: "Alpha Chow",
    leaves: [{ date: "2026-10-15", period_code: "AM", days: 0.5 }],
  },
  {
    staff_row_id: "164",
    leaves: [{ date: "2026-10-15", period_code: "PM", days: 0.5 }],
  },
]);
assert.equal(merged.length, 1);
assert.deepEqual(
  hoursForLeaveDay("2026-10-15", merged[0].byDate.get("2026-10-15") || []),
  { hours: 0, kind: "full" },
);

const staff = normalizeLeavePayload([
  {
    staff_row_id: 164,
    bubble_id: "1731049916048x991958920293123000",
    display_name: "Alpha Chow",
    leaves: [
      { date: "2026-10-15", period_code: "FD", days: 1 },
      { date: "2026-10-20", period_code: "FD", days: 1 },
    ],
  },
  {
    staff_row_id: 9748,
    display_name: "Miko Zhou",
    leaves: [{ date: "2026-10-16", period_code: "FD", days: 1 }],
  },
  {
    staff_row_id: 20,
    display_name: "Don Lao",
    leaves: [{ date: "2026-10-20", period_code: "AM", days: 0.5 }],
  },
  {
    staff_row_id: 21,
    display_name: "Candy Yip",
    leaves: [{ date: "2026-10-20", period_code: "AM", days: 0.5 }],
  },
  {
    staff_row_id: 22,
    display_name: "Stella Wang",
    leaves: [{ date: "2026-07-10", period_code: "AM", days: 0.5 }],
  },
]);

const mps = new Map([
  ["164", { id: "staff-alpha", name: "Alpha Chow", companyListId: null }],
  ["20", { id: "staff-don", name: "Don Lao", companyListId: null }],
  ["21", { id: "staff-candy", name: "Candy Yip", companyListId: null }],
  ["22", { id: "staff-stella", name: "Stella Wang", companyListId: BW_SHENZHEN_COMPANY_LIST_ID }],
]);

const { planned, unmatched } = planLeaveInserts(staff, mps, "2026-07-01", "2026-10-21");
const { toCreate, skippedExisting } = splitExisting(
  planned,
  new Set(["staff-alpha|2026-10-15", "staff-candy|2026-10-20"]),
);

assert.equal(skippedExisting, 2);
assert.equal(unmatched.length, 1);
assert.deepEqual(unmatched[0], { otcStaffId: "9748", displayName: "Miko Zhou" });

const don = toCreate.find((row) => row.displayName === "Don Lao");
const stella = toCreate.find((row) => row.displayName === "Stella Wang");
const candy = toCreate.find((row) => row.displayName === "Candy Yip");
assert.equal(don?.totalWorkHour, 4);
assert.equal(stella?.totalWorkHour, 4.5);
assert.equal(candy, undefined);

const alpha = toCreate.find((row) => row.staffId === "staff-alpha");
assert.ok(alpha);
const alphaInsert = dayReportInsertFromLeave(alpha);
assert.equal(alphaInsert.report_date, "2026-10-20");
assert.equal(alphaInsert.target_hours, 0);
assert.equal(alphaInsert.total_hours, 0);
assert.equal(alphaInsert.is_leave, true);
assert.equal(alphaInsert.is_half_day, false);
assert.equal(alphaInsert.otc_staff_id, 164);
assert.equal("day_report_entries" in alphaInsert, false);

const donInsert = dayReportInsertFromLeave(don!);
assert.equal(donInsert.target_hours, 4);
assert.equal(donInsert.total_hours, 0);
assert.equal(donInsert.is_leave, false);
assert.equal(donInsert.is_half_day, true);
assert.equal(donInsert.office_location, "hk");
assert.equal(donInsert.is_weekend, false);

const stellaInsert = dayReportInsertFromLeave(stella!);
assert.equal(stellaInsert.target_hours, 4.5);
assert.equal(stellaInsert.office_location, "sz");
assert.equal(stellaInsert.is_half_day, true);
assert.equal(stellaInsert.is_leave, false);

const weekend = dayReportInsertFromLeave({
  staffId: "staff-stella",
  otcStaffId: "22",
  displayName: "Stella Wang",
  date: "2026-10-17",
  totalWorkHour: 0,
  kind: "half",
  companyListId: BW_SHENZHEN_COMPANY_LIST_ID,
});
assert.equal(weekend.target_hours, 0);
assert.equal(weekend.is_leave, true);
assert.equal(weekend.is_half_day, false);
assert.equal(weekend.is_weekend, true);

const kinds = countLeaveKinds(toCreate);
assert.equal(kinds.fullDay + kinds.halfDay, toCreate.length);

const chunks = eachMonthChunk("2026-01-15", "2026-03-02");
assert.deepEqual(chunks, [
  { from: "2026-01-15", to: "2026-01-31" },
  { from: "2026-02-01", to: "2026-02-28" },
  { from: "2026-03-01", to: "2026-03-02" },
]);
assert.deepEqual(eachMonthChunk("2026-10-21", "2026-10-20"), []);

const window = defaultLeaveWindow(new Date("2026-10-21T03:00:00Z"));
assert.equal(window.from, addYmdDays("2026-10-21", -14));
assert.equal(window.to, addYmdDays("2026-10-21", 14));

console.log("otc leave day report: ok");
