/**
 * Pitching Records Data & Types
 */

export type PitchingStatus = 'initial' | 'following_up' | 'confirmed' | 'closed';

export type PitchingProjectType = 'bwl_event' | 'bwt_web' | 'bwt_system';

export const PITCHING_PROJECT_TYPE_OPTIONS: { id: PitchingProjectType; label: string }[] = [
  { id: 'bwl_event', label: 'BWL 活動報價' },
  { id: 'bwt_web', label: 'BWT-網頁' },
  { id: 'bwt_system', label: 'BWT-系統' },
];

export interface PitchingFollowUp {
  id: string;
  date: string;
  content: string;
  result: string;
  createdBy: string;
}

export interface PitchingRecord {
  id: string;
  pitchingId: string;
  clientName: string;
  clientId?: string;
  displayName: string;
  inquiryDate: string;
  description?: string;
  projectTypes: PitchingProjectType[];
  asanaLink?: string;
  asanaProjectGid?: string;
  asanaProjectName?: string;
  assignedPm: string;
  assignedPmName: string;
  status: PitchingStatus;
  notes?: string;
  followUps: PitchingFollowUp[];
  linkedQuotationId?: string;
  linkedQuotationNumber?: string;
  lastFollowUpDate?: string;
  createdAt: string;
  updatedAt: string;
  /** @deprecated legacy field */
  topic?: string;
  requirementSummary?: string;
  estimatedBudgetMin?: number;
  estimatedBudgetMax?: number;
  currency?: string;
  pitchDate?: string;
  nextAction?: string;
}

export const pitchingStatusConfig: Record<PitchingStatus, { label: string; color: string; bgColor: string }> = {
  initial: { label: '初步提案', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  following_up: { label: '跟進中', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  confirmed: { label: '確認項目', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  closed: { label: '已結案', color: 'text-slate-600', bgColor: 'bg-slate-100' },
};

/** Project page: same table as Pitching, filtered by status 確認項目. */
export function isProjectPageRecord(
  record: Pick<PitchingRecord, 'status'>,
): boolean {
  return record.status === 'confirmed';
}

/** Days from enquiry date until follow-up deadline (30-day window). */
export const PITCHING_FOLLOW_UP_DAYS = 30;

/** Only 初步提案 tracks the 30-day follow-up window from 查詢日期. */
export function calcRemainingDays(inquiryDate: string, status: PitchingStatus): number | null {
  if (status !== 'initial') return null;
  const start = new Date(inquiryDate);
  if (Number.isNaN(start.getTime())) return null;
  const deadline = new Date(start);
  deadline.setDate(deadline.getDate() + PITCHING_FOLLOW_UP_DAYS);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
}

export function formatProjectTypes(types: PitchingProjectType[]): string {
  if (!types.length) return '—';
  return types
    .map((t) => PITCHING_PROJECT_TYPE_OPTIONS.find((o) => o.id === t)?.label ?? t)
    .join('、');
}

export function generatePitchingId(existingCount: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const seq = String(existingCount + 1).padStart(3, '0');
  return `PTC-${y}${m}-${seq}`;
}

/** Client options for pitching forms (shared with CRM sample data). */
export const pitchingClientOptions = [
  { id: '1', name: '新創科技有限公司' },
  { id: '2', name: '美酒莊園' },
  { id: '3', name: '綠色生活集團' },
  { id: '4', name: '運動達人' },
  { id: '5', name: '食工坊' },
  { id: '6', name: '設計中心' },
  { id: '7', name: '恒生銀行' },
  { id: '8', name: '太古地產' },
  { id: '9', name: '周大福珠寶' },
  { id: '10', name: '國泰航空' },
];

export const pitchingRecords: PitchingRecord[] = [];
