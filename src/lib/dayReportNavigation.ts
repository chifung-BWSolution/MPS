import { splitHashPathAndQuery } from '@/lib/adsCampaignNavigation';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type DayReportSubmitQuery = {
  staffId: string | null;
  date: string | null;
};

export function buildDayReportSubmitHash(staffId: string, date: string): string {
  const params = new URLSearchParams();
  params.set('staff', staffId);
  params.set('date', date);
  return `day-report/submit?${params.toString()}`;
}

export function parseDayReportSubmitQuery(hash = globalThis.window?.location?.hash ?? ''): DayReportSubmitQuery {
  const { path, params } = splitHashPathAndQuery(hash);
  const normalized = path.replace(/^\/+/, '');
  if (normalized !== 'day-report/submit') {
    return { staffId: null, date: null };
  }
  const staffId = (params.get('staff') || '').trim();
  const date = (params.get('date') || '').trim();
  return {
    staffId: staffId || null,
    date: DATE_RE.test(date) ? date : null,
  };
}
