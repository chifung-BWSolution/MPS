export type DayReportCompletionStatus = 'complete' | 'incomplete' | 'missing';

export type DayReportHoursHeader = {
  total_hours?: number | null;
  target_hours?: number | null;
  is_leave?: boolean | null;
};

export function sumEntryHours(
  entries: Array<{ hours?: number | null } | number | null | undefined>,
): number {
  return entries.reduce<number>((sum, entry) => {
    if (entry == null) return sum;
    const hours = typeof entry === 'number' ? entry : Number(entry.hours);
    return sum + (Number.isFinite(hours) ? hours : 0);
  }, 0);
}

export function hoursEqual(a: number, b: number): boolean {
  return Math.round(Number(a) * 10) === Math.round(Number(b) * 10);
}

/**
 * Required hours for the day.
 *
 * `day_reports.total_hours` is retotaled to the entry sum on each task save, so
 * it cannot distinguish incomplete fills. The expected day total lives on
 * `target_hours` (全日 / 半日 / 放假 / 自訂). Fall back to `total_hours` when
 * target is absent.
 */
export function getRequiredDayHours(report: DayReportHoursHeader): number {
  if (report.target_hours != null) return Number(report.target_hours) || 0;
  return Number(report.total_hours) || 0;
}

/**
 * - missing: no day_reports row
 * - complete: leave, or logged entry hours equal the required day total
 * - incomplete: row exists but logged hours do not match the required total
 */
export function getDayReportCompletionStatus(
  report: DayReportHoursHeader | null | undefined,
  entryHoursSum: number,
): DayReportCompletionStatus {
  if (!report) return 'missing';
  if (report.is_leave) return 'complete';
  return hoursEqual(entryHoursSum, getRequiredDayHours(report)) ? 'complete' : 'incomplete';
}
