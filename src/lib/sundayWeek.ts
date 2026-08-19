/** Sunday–Saturday week helpers (local calendar, not UTC). */

export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseLocalDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addCalendarDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** Sunday of the week that contains `date` (local). */
export function startOfWeekSunday(date: Date): Date {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  local.setDate(local.getDate() - local.getDay());
  return local;
}

export type SundaySaturdayWeek = {
  start: string;
  end: string;
  dates: string[];
};

/** 7 local dates from Sunday through Saturday for the week containing `anchor`. */
export function getSundaySaturdayWeek(anchor: Date): SundaySaturdayWeek {
  const start = startOfWeekSunday(anchor);
  const dates = Array.from({ length: 7 }, (_, i) => toLocalDateStr(addCalendarDays(start, i)));
  return { start: dates[0], end: dates[6], dates };
}

export type TwoWeekWindow = {
  later: SundaySaturdayWeek;
  earlier: SundaySaturdayWeek;
  windowStart: string;
  windowEnd: string;
};

/**
 * Two consecutive Sun–Sat weeks ending on the Saturday of `laterWeekAnchor`'s week.
 * Default later week is the current week.
 */
export function getTwoWeekWindow(laterWeekAnchor: Date): TwoWeekWindow {
  const later = getSundaySaturdayWeek(laterWeekAnchor);
  const earlier = getSundaySaturdayWeek(addCalendarDays(parseLocalDateStr(later.start), -7));
  return {
    later,
    earlier,
    windowStart: earlier.start,
    windowEnd: later.end,
  };
}

/** Do not let the later week start after the current week's Sunday. */
export function clampLaterWeekSunday(sunday: Date, today = new Date()): Date {
  const currentSunday = startOfWeekSunday(today);
  return sunday > currentSunday ? currentSunday : sunday;
}

export function formatWeekRangeLabel(start: string, end: string): string {
  const s = parseLocalDateStr(start);
  const e = parseLocalDateStr(end);
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.getFullYear()}/${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`;
  }
  return `${s.getFullYear()}/${s.getMonth() + 1}/${s.getDate()} – ${e.getFullYear()}/${e.getMonth() + 1}/${e.getDate()}`;
}

/** Compact month/day range for side labels, e.g. 8/16–8/22 */
export function formatCompactWeekLabel(start: string, end: string): string {
  const s = parseLocalDateStr(start);
  const e = parseLocalDateStr(end);
  return `${s.getMonth() + 1}/${s.getDate()}–${e.getMonth() + 1}/${e.getDate()}`;
}

/** Snap a picked range to the two-week Sun–Sat window ending on the later date's Saturday. */
export function twoWeekWindowFromRange(from: Date, to: Date | undefined, today = new Date()): TwoWeekWindow {
  const laterAnchor = clampLaterWeekSunday(startOfWeekSunday(to || from), today);
  return getTwoWeekWindow(laterAnchor);
}
