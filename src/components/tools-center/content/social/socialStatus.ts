import type { ContentStatusTone } from '@/lib/contentState.ts';

export interface SocialStatusMeta {
  label: string;
  tone: ContentStatusTone;
}

/** 社媒稿狀態 → 顯示標籤與色票（與 PRD §8.1 一致） */
export const SOCIAL_POST_STATUS: Record<string, SocialStatusMeta> = {
  draft: { label: '草稿', tone: 'slate' },
  pending_review: { label: '待審', tone: 'amber' },
  changes_requested: { label: '需修改', tone: 'amber' },
  approved: { label: '已批准', tone: 'teal' },
  scheduled: { label: '已排程', tone: 'blue' },
  publishing: { label: '待手動發佈', tone: 'indigo' },
  published: { label: '已發佈', tone: 'teal-dark' },
  failed: { label: '失敗', tone: 'rose' },
  publish_failed: { label: '發佈失敗', tone: 'rose' },
  cancelled: { label: '已取消', tone: 'muted' },
};

export function socialPostStatusMeta(status: string | null | undefined): SocialStatusMeta {
  return SOCIAL_POST_STATUS[status || ''] ?? { label: status || '未知', tone: 'slate' };
}

export const SOCIAL_TARGET_STATUS: Record<string, SocialStatusMeta> = {
  pending: { label: '待發', tone: 'slate' },
  copied: { label: '已複製', tone: 'blue' },
  published: { label: '已發', tone: 'teal-dark' },
  failed: { label: '失敗', tone: 'rose' },
  skipped: { label: '略過', tone: 'muted' },
};

export function socialTargetStatusMeta(status: string | null | undefined): SocialStatusMeta {
  return SOCIAL_TARGET_STATUS[status || ''] ?? { label: status || '未知', tone: 'slate' };
}

/** 相對時間（前端顯示用；不引 date-fns） */
export function relativeFromNow(iso: string | null | undefined): string {
  if (!iso) return '—';
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return '—';
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return '剛剛';
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.round(hours / 24);
  return `${days} 天前`;
}

/** 看板欄位（QueueView 與 Overview 共用） */
export const QUEUE_COLUMNS: { id: string; label: string; statuses: string[] }[] = [
  { id: 'review', label: '待審', statuses: ['pending_review'] },
  { id: 'changes', label: '需修改', statuses: ['changes_requested'] },
  { id: 'approved', label: '已批准／已排程', statuses: ['approved', 'scheduled'] },
  { id: 'publishing', label: '待發佈', statuses: ['publishing'] },
  { id: 'published', label: '已發佈', statuses: ['published'] },
  { id: 'failed', label: '失敗', statuses: ['failed', 'publish_failed'] },
];
