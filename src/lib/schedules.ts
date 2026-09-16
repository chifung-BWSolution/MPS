export const SCHEDULES_TABLE = 'schedules';

export type Schedule = {
  id: string;
  title: string;
  date: string;
  description: string;
  relatedProjectId: string;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleInput = {
  title: string;
  date: string;
  description?: string;
};

export function optionalIsoDate(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 10);
}

export function formatScheduleDate(iso: string | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${y}/${m}/${d}`;
}

export function validateScheduleInput(input: ScheduleInput): string | null {
  if (!input.title.trim()) return '請輸入標題';
  if (!optionalIsoDate(input.date)) return '請選擇日期';
  return null;
}

export function sortSchedules(rows: Schedule[]): Schedule[] {
  return [...rows].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return a.createdAt.localeCompare(b.createdAt);
  });
}
