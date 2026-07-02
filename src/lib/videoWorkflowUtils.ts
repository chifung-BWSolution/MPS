import type { PlatformPublishMap } from '@/types/videoOutput';
import {
  MEDIA_PLATFORM_PUBLISH_KEYS,
  isPlatformPublished,
} from '@/lib/videoOutputUtils';
import type {
  ModelAssignment,
  ProductionProgress,
  ProductionTask,
  ProductionTaskKey,
  StaffAssignment,
  VideoWorkflowMock,
  VideoWorkflowStage,
} from '@/types/videoWorkflow';

export type ProductionTaskDisplayStatus = 'done' | 'pending' | 'na';

export const PRODUCTION_TASK_LABELS: Record<ProductionTaskKey, string> = {
  copywriting: '文案',
  script: '腳本',
  rawFootage: '原片',
  editing: '剪輯',
  demo: 'Demo',
};

export const PRODUCTION_TASK_KEYS: ProductionTaskKey[] = [
  'copywriting',
  'script',
  'rawFootage',
  'editing',
  'demo',
];

export function emptyProductionTask(): ProductionTask {
  return { done: false };
}

export function emptyProductionProgress(): ProductionProgress {
  return {
    copywriting: emptyProductionTask(),
    script: emptyProductionTask(),
    rawFootage: emptyProductionTask(),
    editing: emptyProductionTask(),
    demo: emptyProductionTask(),
    footageMode: null,
    editingMode: null,
  };
}

export function normalizeProductionProgress(video: VideoWorkflowMock): ProductionProgress {
  if (video.productionProgress) {
    const p = video.productionProgress;
    return {
      copywriting: { ...emptyProductionTask(), ...p.copywriting },
      script: { ...emptyProductionTask(), ...p.script },
      rawFootage: { ...emptyProductionTask(), ...p.rawFootage },
      editing: { ...emptyProductionTask(), ...p.editing },
      demo: { ...emptyProductionTask(), ...p.demo },
      footageMode: p.footageMode ?? null,
      editingMode: p.editingMode ?? null,
    };
  }

  const hasLegacyFootage = video.rawFootageDone !== undefined;
  return {
    copywriting: emptyProductionTask(),
    script: emptyProductionTask(),
    rawFootage: { done: !!video.rawFootageDone },
    editing: { done: false },
    demo: { done: !!video.demoDone },
    footageMode: hasLegacyFootage ? 'shoot' : null,
    editingMode: video.needsEditing ?? null,
  };
}

export function syncLegacyProductionFields(progress: ProductionProgress): Pick<
  VideoWorkflowMock,
  'rawFootageDone' | 'needsEditing' | 'demoDone'
> {
  return {
    rawFootageDone: progress.footageMode === 'shoot' && progress.rawFootage.done,
    needsEditing: progress.editingMode,
    demoDone: progress.demo.done,
  };
}

export function normalizeVideoWorkflow(video: VideoWorkflowMock): VideoWorkflowMock {
  const productionProgress = normalizeProductionProgress(video);
  return {
    ...video,
    productionProgress,
    ...syncLegacyProductionFields(productionProgress),
  };
}

export function getProductionTaskDisplayStatus(
  progress: ProductionProgress,
  key: ProductionTaskKey,
): ProductionTaskDisplayStatus {
  if (key === 'rawFootage') {
    if (progress.footageMode !== 'shoot') return 'na';
    return progress.rawFootage.done ? 'done' : 'pending';
  }
  if (key === 'editing') {
    if (progress.editingMode !== true) return 'na';
    return progress.editing.done ? 'done' : 'pending';
  }
  const task = progress[key];
  return task.done ? 'done' : 'pending';
}

export function canSubmitProductionForReview(video: VideoWorkflowMock): boolean {
  return getSubmitForReviewBlockers(video).length === 0;
}

export function getSubmitForReviewBlockers(video: VideoWorkflowMock): string[] {
  const blockers: string[] = [];
  const progress = normalizeProductionProgress(video);
  if (!progress.demo.done) blockers.push('Demo 未完成');
  if (!video.plannedPublishDate?.trim()) blockers.push('計劃發佈日期未填');
  return blockers;
}

export function validateProductionProgress(progress: ProductionProgress): string | null {
  const checks: { label: string; task: ProductionTask; applicable: boolean }[] = [
    { label: PRODUCTION_TASK_LABELS.copywriting, task: progress.copywriting, applicable: true },
    { label: PRODUCTION_TASK_LABELS.script, task: progress.script, applicable: true },
    { label: PRODUCTION_TASK_LABELS.rawFootage, task: progress.rawFootage, applicable: progress.footageMode === 'shoot' },
    { label: PRODUCTION_TASK_LABELS.editing, task: progress.editing, applicable: progress.editingMode === true },
    { label: PRODUCTION_TASK_LABELS.demo, task: progress.demo, applicable: true },
  ];

  for (const { label, task, applicable } of checks) {
    if (!applicable) continue;
    if (task.done && !(task.hours && task.hours > 0)) {
      return `${label} 完成時請填寫工時（> 0）`;
    }
  }
  return null;
}

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

export type WorkflowListSortMode = 'createdAt' | 'submittedForReviewAt';

export function getWorkflowSortKey(video: VideoWorkflowMock, mode: WorkflowListSortMode): string {
  if (mode === 'submittedForReviewAt') {
    return video.submittedForReviewAt ?? video.createdAt ?? video.videoCode;
  }
  return video.createdAt ?? video.videoCode;
}

export function sortWorkflowVideosNewestFirst(
  videos: VideoWorkflowMock[],
  mode: WorkflowListSortMode = 'createdAt',
): VideoWorkflowMock[] {
  return [...videos].sort((a, b) =>
    getWorkflowSortKey(b, mode).localeCompare(getWorkflowSortKey(a, mode)),
  );
}

export function filterWorkflowVideos(
  videos: VideoWorkflowMock[],
  searchQuery: string,
  vchannelFilter: string,
  channels: { id: string; channelCode: string }[],
): VideoWorkflowMock[] {
  const q = searchQuery.trim().toLowerCase();
  const filterChannel = vchannelFilter !== 'all' ? channels.find(c => c.id === vchannelFilter) : null;
  return videos.filter(v => {
    if (filterChannel) {
      const matchId = v.vchannelId === filterChannel.id;
      const matchCode = v.vchannelCode === filterChannel.channelCode;
      if (!matchId && !matchCode) return false;
    }
    if (!q) return true;
    return v.title.toLowerCase().includes(q) || v.videoCode.toLowerCase().includes(q);
  });
}

export type WorkflowBinaryStatusFilter = 'all' | 'pending' | 'done';

export function isWorkflowPendingReview(video: VideoWorkflowMock): boolean {
  return video.stage === 'review';
}

export function isWorkflowReviewed(video: VideoWorkflowMock): boolean {
  return video.stage === 'publish' || video.stage === 'published';
}

export function isWorkflowPendingPublish(video: VideoWorkflowMock): boolean {
  return video.stage === 'publish';
}

export function isWorkflowPublished(video: VideoWorkflowMock): boolean {
  return video.stage === 'published';
}

export function getReviewScopeVideos(videos: VideoWorkflowMock[]): VideoWorkflowMock[] {
  return videos.filter(v => isWorkflowPendingReview(v) || isWorkflowReviewed(v));
}

export function getPublishScopeVideos(videos: VideoWorkflowMock[]): VideoWorkflowMock[] {
  return videos.filter(v => isWorkflowPendingPublish(v) || isWorkflowPublished(v));
}

export function countWorkflowBinaryStatus(
  videos: VideoWorkflowMock[],
  isPending: (video: VideoWorkflowMock) => boolean,
  isDone: (video: VideoWorkflowMock) => boolean,
): { pending: number; done: number } {
  let pending = 0;
  let done = 0;
  for (const video of videos) {
    if (isPending(video)) pending++;
    else if (isDone(video)) done++;
  }
  return { pending, done };
}

export function filterWorkflowBinaryStatus(
  videos: VideoWorkflowMock[],
  statusFilter: WorkflowBinaryStatusFilter,
  isPending: (video: VideoWorkflowMock) => boolean,
  isDone: (video: VideoWorkflowMock) => boolean,
): VideoWorkflowMock[] {
  if (statusFilter === 'pending') return videos.filter(isPending);
  if (statusFilter === 'done') return videos.filter(isDone);
  return videos;
}
