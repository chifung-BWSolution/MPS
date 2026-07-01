import type { PlatformPublishMap } from '@/types/videoOutput';
import {
  MEDIA_PLATFORM_PUBLISH_KEYS,
  isPlatformPublished,
} from '@/lib/videoOutputUtils';
import type {
  ModelAssignment,
  StaffAssignment,
  VideoWorkflowMock,
  VideoWorkflowStage,
} from '@/types/videoWorkflow';

export const VIDEO_WORKFLOW_STAGE_LABELS: Record<VideoWorkflowStage, string> = {
  prep: '準備中',
  production: '製作中',
  review: '待審核',
  publish: '待發佈',
  published: '已發佈',
};

export const VIDEO_WORKFLOW_STAGE_COLORS: Record<VideoWorkflowStage, string> = {
  prep: 'bg-slate-100 text-slate-700',
  production: 'bg-amber-100 text-amber-800',
  review: 'bg-blue-100 text-blue-800',
  publish: 'bg-purple-100 text-purple-800',
  published: 'bg-teal-100 text-teal-800',
};

export function isStaffAssignmentComplete(a?: StaffAssignment): boolean {
  return !!(a?.userId?.trim() && a?.scheduledAt?.trim());
}

export function isModelAssignmentComplete(a?: ModelAssignment): boolean {
  return !!(a?.talentId?.trim() && a?.scheduledAt?.trim());
}

export function isLocationComplete(location?: VideoWorkflowMock['location']): boolean {
  return !!(location?.sz || location?.hk);
}

export function getPrepMissingItems(video: VideoWorkflowMock): string[] {
  const missing: string[] = [];
  if (!isStaffAssignmentComplete(video.copywriting)) missing.push('文案');
  if (!isStaffAssignmentComplete(video.script)) missing.push('腳本');
  if (!isModelAssignmentComplete(video.model)) missing.push('Model');
  if (!isLocationComplete(video.location)) missing.push('場地（SZ/HK）');
  if (!video.shootAt?.trim()) missing.push('拍攝時間');
  if (!isStaffAssignmentComplete(video.photographer)) missing.push('攝影師');
  if (!video.onSiteCrew?.some(isStaffAssignmentComplete)) missing.push('到場人員');
  return missing;
}

export function isPrepComplete(video: VideoWorkflowMock): boolean {
  return getPrepMissingItems(video).length === 0;
}

export function formatLocation(location?: VideoWorkflowMock['location']): string {
  if (!location) return '—';
  const parts: string[] = [];
  if (location.sz) parts.push('深圳');
  if (location.hk) parts.push('香港');
  if (parts.length === 0) return location.notes?.trim() || '—';
  const base = parts.join(' / ');
  return location.notes?.trim() ? `${base} · ${location.notes}` : base;
}

export function formatAssignmentWhen(a?: StaffAssignment | ModelAssignment): string {
  if (!a?.scheduledAt) return '—';
  const d = a.scheduledAt;
  if (d.includes('T')) {
    const [date, time] = d.split('T');
    return `${date} ${time?.slice(0, 5) ?? ''}`.trim();
  }
  return d;
}

export function isPublishComplete(video: VideoWorkflowMock): boolean {
  const map = video.platformPublish ?? {};
  const anyPlatform = MEDIA_PLATFORM_PUBLISH_KEYS.some(k => isPlatformPublished(map, k));
  return anyPlatform || !!video.publishedDate?.trim();
}

export function countPublishedPlatforms(map: PlatformPublishMap = {}): number {
  return MEDIA_PLATFORM_PUBLISH_KEYS.filter(k => isPlatformPublished(map, k)).length;
}
