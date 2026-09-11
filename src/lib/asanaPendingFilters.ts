import { calcRemainingDays } from '@/data/pitchingData';

export const ASANA_CASE_CLOSED_REASONS = [
  '客戶沒有回覆',
  '客戶純粹為了取得報價單',
  '客戶預算不足',
  '客戶已選擇其他公司',
  '客戶要求超出服務範圍',
  '高風險項目，放棄跟進',
  '已超過客人招標死線',
  '長時間未有PM跟進',
] as const;

export type AsanaCaseClosedReason = (typeof ASANA_CASE_CLOSED_REASONS)[number];

export type AsanaImportFilter = 'all' | 'pending' | 'imported';
export type AsanaExpiredFilter = 'all' | 'expired' | 'not_expired';
export type AsanaCaseClosedFilter = 'all' | 'pending' | 'closed';

export type AsanaPendingFilterTask = {
  imported: boolean;
  inquiryDate: string;
  caseClosedReason: string;
};

export function isAsanaTaskCaseClosed(reason: string | null | undefined): boolean {
  return Boolean(reason?.trim());
}

export function formatAsanaCaseClosedComment(reason: string, staffName: string): string {
  const who = staffName.trim() || 'MPS';
  return `放棄跟進（${who}）：${reason.trim()}`;
}

export function formatAsanaCaseReopenedComment(staffName: string): string {
  const who = staffName.trim() || 'MPS';
  return `已取消放棄跟進（${who}）`;
}

export function isAsanaTaskExpired(inquiryDate: string, asOfDate?: string): boolean {
  const days = calcRemainingDays(inquiryDate, 'initial', asOfDate);
  return days != null && days <= 0;
}

export function matchesAsanaPendingFilters(
  task: AsanaPendingFilterTask,
  filters: {
    importFilter: AsanaImportFilter;
    expiredFilter: AsanaExpiredFilter;
    caseClosedFilter: AsanaCaseClosedFilter;
  },
  asOfDate?: string,
): boolean {
  if (filters.importFilter === 'pending' && task.imported) return false;
  if (filters.importFilter === 'imported' && !task.imported) return false;

  const expired = isAsanaTaskExpired(task.inquiryDate, asOfDate);
  if (filters.expiredFilter === 'expired' && !expired) return false;
  if (filters.expiredFilter === 'not_expired' && expired) return false;

  const closed = isAsanaTaskCaseClosed(task.caseClosedReason);
  if (filters.caseClosedFilter === 'pending' && closed) return false;
  if (filters.caseClosedFilter === 'closed' && !closed) return false;

  return true;
}
