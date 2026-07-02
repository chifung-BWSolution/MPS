import type {
  PlatformPublishKey,
  PlatformPublishMap,
  VideoOutput,
  VideoOutputInput,
  VideoOutputStatus,
  VideoProjectCategory,
} from '@/types/videoOutput';
import type { VideoWorkflowStage } from '@/types/videoWorkflow';
import {
  parsePrepAssignments,
  parseProductionProgressJson,
  resolveProductionProgress,
} from '@/lib/videoOutputWorkflowMapper';

/** Nine media platforms managed via the 發佈 modal. */
export const MEDIA_PLATFORM_PUBLISH_KEYS: PlatformPublishKey[] = [
  'youtube',
  'instagram',
  'facebook',
  'threads',
  'linkedin',
  'xiaohongshu',
  'douyin',
  'wechat_channels',
  'wechat_official',
];

/** @deprecated Use MEDIA_PLATFORM_PUBLISH_KEYS for publish UI. */
export const PLATFORM_PUBLISH_KEYS = MEDIA_PLATFORM_PUBLISH_KEYS;

export const PLATFORM_PUBLISH_LABELS: Record<PlatformPublishKey, string> = {
  youtube: 'YouTube',
  instagram: 'IG',
  facebook: 'Facebook',
  threads: 'Threads',
  linkedin: 'LinkedIn',
  xiaohongshu: '小紅書',
  douyin: '抖音',
  wechat_channels: '影音號',
  wechat_official: '公眾號',
  zh_cn: '簡體中文',
  zh_tw: '繁體中文',
};

export function isPlatformPublished(
  platformPublish: PlatformPublishMap,
  key: PlatformPublishKey,
): boolean {
  const entry = platformPublish[key];
  if (entry === true) return true;
  if (entry && typeof entry === 'object') return !!entry.url?.trim();
  return false;
}

export function getPlatformUrl(platformPublish: PlatformPublishMap, key: PlatformPublishKey): string {
  const entry = platformPublish[key];
  if (!entry || typeof entry !== 'object') return '';
  return entry.url?.trim() ?? '';
}

export function mergePlatformUrls(
  existing: PlatformPublishMap,
  urls: Partial<Record<PlatformPublishKey, string>>,
): PlatformPublishMap {
  const merged: PlatformPublishMap = { ...existing };
  for (const key of MEDIA_PLATFORM_PUBLISH_KEYS) {
    if (!(key in urls)) continue;
    const url = urls[key]?.trim();
    if (url) {
      merged[key] = { url };
    } else {
      const prev = existing[key];
      // Only clear object entries; legacy boolean flags stay unless replaced with a URL
      if (prev && typeof prev === 'object') {
        delete merged[key];
      }
    }
  }
  return merged;
}

export function urlsFromPlatformPublish(platformPublish: PlatformPublishMap): Partial<Record<PlatformPublishKey, string>> {
  const result: Partial<Record<PlatformPublishKey, string>> = {};
  for (const key of MEDIA_PLATFORM_PUBLISH_KEYS) {
    const url = getPlatformUrl(platformPublish, key);
    if (url) result[key] = url;
  }
  return result;
}

export function firstPublishedPlatformUrl(platformPublish: PlatformPublishMap): string | undefined {
  for (const key of MEDIA_PLATFORM_PUBLISH_KEYS) {
    const url = getPlatformUrl(platformPublish, key);
    if (url && isHttpUrl(url)) return url;
  }
  return undefined;
}

export function getPublishedPlatformKeys(platformPublish: PlatformPublishMap): PlatformPublishKey[] {
  return MEDIA_PLATFORM_PUBLISH_KEYS.filter(k => isPlatformPublished(platformPublish, k));
}

export function getPublishedPlatformKeysWithUrl(platformPublish: PlatformPublishMap): PlatformPublishKey[] {
  return MEDIA_PLATFORM_PUBLISH_KEYS.filter(k => !!getPlatformUrl(platformPublish, k));
}

export function formatPlatformPublishCopyText(platformPublish: PlatformPublishMap): string {
  return getPublishedPlatformKeysWithUrl(platformPublish)
    .map(key => `${PLATFORM_PUBLISH_LABELS[key]}：${getPlatformUrl(platformPublish, key)}`)
    .join('\n');
}

export const VIDEO_OUTPUT_STATUS_LABELS: Record<VideoOutputStatus, string> = {
  pending: '待製作',
  in_production: '製作中',
  demo_done: 'Demo 完成',
  published: '已發佈',
};

export const VIDEO_OUTPUT_STATUS_COLORS: Record<VideoOutputStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  in_production: 'bg-amber-100 text-amber-700',
  demo_done: 'bg-blue-100 text-blue-700',
  published: 'bg-teal-100 text-teal-700',
};

export function formatShootLocation(shootHk: boolean, shootSz: boolean): string {
  if (shootHk && shootSz) return '香港+深圳';
  if (shootHk) return '香港';
  if (shootSz) return '深圳';
  return '—';
}

export function deriveVideoOutputStatus(row: Pick<
  VideoOutput,
  'workflowStage' | 'shootSz' | 'shootHk' | 'rawFootageDone' | 'needsEditing' | 'demoDone' | 'publishedDate'
>): VideoOutputStatus {
  if (row.workflowStage) {
    switch (row.workflowStage) {
      case 'published':
        return 'published';
      case 'review':
      case 'publish':
        return 'demo_done';
      case 'production':
        return 'in_production';
      case 'prep':
        return 'pending';
    }
  }

  if (row.publishedDate) return 'published';
  if (row.demoDone) return 'demo_done';
  const anyProgress =
    row.shootSz || row.shootHk || row.rawFootageDone || row.needsEditing === true || row.demoDone;
  if (anyProgress) return 'in_production';
  return 'pending';
}

export function countPublishedPlatforms(platformPublish: PlatformPublishMap): { done: number; total: number } {
  const total = MEDIA_PLATFORM_PUBLISH_KEYS.length;
  const done = MEDIA_PLATFORM_PUBLISH_KEYS.filter(k => isPlatformPublished(platformPublish, k)).length;
  return { done, total };
}

export function formatPublishDate(row: Pick<VideoOutput, 'publishedDate' | 'plannedPublishDate'>) {
  if (row.publishedDate) return { text: row.publishedDate, planned: false };
  if (row.plannedPublishDate) return { text: row.plannedPublishDate, planned: true };
  return { text: '—', planned: false };
}

/** 發佈日期優先，無則用預計發佈日期（與列表「發佈日期」欄一致） */
export function getEffectivePublishDate(
  row: Pick<VideoOutput, 'publishedDate' | 'plannedPublishDate'>,
): string | null {
  const published = row.publishedDate?.trim();
  if (published) return published;
  const planned = row.plannedPublishDate?.trim();
  return planned || null;
}

export function compareVideoOutputByPublishDateDesc(a: VideoOutput, b: VideoOutput): number {
  const dateA = getEffectivePublishDate(a);
  const dateB = getEffectivePublishDate(b);
  if (!dateA && !dateB) return a.videoCode.localeCompare(b.videoCode);
  if (!dateA) return 1;
  if (!dateB) return -1;
  const byDate = dateB.localeCompare(dateA);
  if (byDate !== 0) return byDate;
  return a.videoCode.localeCompare(b.videoCode);
}

export function sortVideoOutputsByPublishDateDesc(rows: VideoOutput[]): VideoOutput[] {
  return [...rows].sort(compareVideoOutputByPublishDateDesc);
}

export function formatStorageOrLink(row: Pick<VideoOutput, 'storagePath' | 'platformPublish'>) {
  if (row.storagePath?.trim()) return row.storagePath.trim();
  return firstPublishedPlatformUrl(row.platformPublish) ?? '';
}

export function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export function resolveChannelPrefixFromCode(videoCode: string): string {
  const code = videoCode.trim();
  if (!code) return '';
  return code.split('-')[0].split('/')[0].toUpperCase();
}

export function inferProjectCategory(channelPrefix: string): VideoProjectCategory {
  const n = parseInt(channelPrefix.replace(/\D/g, ''), 10);
  if (Number.isNaN(n)) return 'client';
  return n <= 4 ? 'internal' : 'client';
}

export function matchesVideoSearch(row: VideoOutput, query: string) {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return row.title.toLowerCase().includes(q) || row.videoCode.toLowerCase().includes(q);
}

export function getCurrentProductionYear(): number {
  return new Date().getFullYear();
}

export function buildProductionYearOptions(
  yearsFromData: Iterable<number | undefined | null>,
): number[] {
  const years = new Set<number>();
  years.add(getCurrentProductionYear());
  for (const year of yearsFromData) {
    if (year != null && year > 0) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

export function filterVideoOutputs(
  rows: VideoOutput[],
  filters: {
    vchannelId: string;
    searchQuery: string;
    category: 'all' | VideoProjectCategory;
    status: 'all' | VideoOutputStatus;
    productionYear?: number;
  },
) {
  return rows.filter(row => {
    if (filters.vchannelId !== 'all' && row.vchannelId !== filters.vchannelId) return false;
    if (!matchesVideoSearch(row, filters.searchQuery)) return false;
    if (filters.category !== 'all' && row.projectCategory !== filters.category) return false;
    if (filters.status !== 'all' && deriveVideoOutputStatus(row) !== filters.status) return false;
    if (filters.productionYear != null && row.productionYear !== filters.productionYear) return false;
    return true;
  });
}

type DbVideoOutputRow = {
  id: string;
  vchannel_id: string;
  production_year: number | null;
  video_code: string;
  title: string;
  asana_task_id: string | null;
  asana_url: string | null;
  shoot_sz: boolean;
  shoot_hk: boolean;
  raw_footage_done: boolean;
  needs_editing: boolean | null;
  demo_done: boolean;
  copy_sc?: boolean;
  copy_tc?: boolean;
  copy_en?: boolean;
  subtitle_done?: boolean;
  reviewed?: boolean;
  shoot_at: string | null;
  planned_publish_date: string | null;
  published_date: string | null;
  platform_publish: PlatformPublishMap;
  storage_path: string | null;
  project_category: VideoProjectCategory;
  notes: string | null;
  workflow_stage?: VideoWorkflowStage;
  prep_assignments?: unknown;
  production_progress?: unknown;
  location_notes?: string | null;
  review_reject_reason?: string | null;
  submitted_for_review_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  created_at: string;
  updated_at: string;
  vchannels?: { channel_code: string; public_name: string } | null;
};

export function mapVideoOutputRow(row: DbVideoOutputRow): VideoOutput {
  const prepAssignments = parsePrepAssignments(row.prep_assignments);
  const productionProgressRaw = parseProductionProgressJson(row.production_progress);
  const base: VideoOutput = {
    id: row.id,
    vchannelId: row.vchannel_id,
    channelCode: row.vchannels?.channel_code ?? '',
    channelPublicName: row.vchannels?.public_name,
    productionYear: row.production_year ?? undefined,
    videoCode: row.video_code,
    title: row.title,
    asanaTaskId: row.asana_task_id ?? undefined,
    asanaUrl: row.asana_url ?? undefined,
    shootSz: row.shoot_sz,
    shootHk: row.shoot_hk,
    rawFootageDone: row.raw_footage_done,
    needsEditing: row.needs_editing,
    demoDone: row.demo_done,
    copySc: row.copy_sc ?? false,
    copyTc: row.copy_tc ?? false,
    copyEn: row.copy_en ?? false,
    subtitleDone: row.subtitle_done ?? false,
    reviewed: row.reviewed ?? false,
    shootAt: row.shoot_at ?? undefined,
    plannedPublishDate: row.planned_publish_date ?? undefined,
    publishedDate: row.published_date ?? undefined,
    platformPublish: row.platform_publish ?? {},
    storagePath: row.storage_path ?? undefined,
    projectCategory: row.project_category,
    notes: row.notes ?? undefined,
    workflowStage: row.workflow_stage ?? 'prep',
    prepAssignments,
    productionProgress: productionProgressRaw ?? resolveProductionProgress({
      productionProgress: undefined,
      rawFootageDone: row.raw_footage_done,
      needsEditing: row.needs_editing,
      demoDone: row.demo_done,
    }),
    locationNotes: row.location_notes ?? undefined,
    reviewRejectReason: row.review_reject_reason ?? undefined,
    submittedForReviewAt: row.submitted_for_review_at ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  base.productionProgress = resolveProductionProgress(base);
  return base;
}

export function videoOutputToDbRow(input: VideoOutputInput) {
  return {
    vchannel_id: input.vchannelId,
    production_year: input.productionYear ?? null,
    video_code: input.videoCode,
    title: input.title,
    asana_task_id: input.asanaTaskId ?? null,
    asana_url: input.asanaUrl ?? null,
    shoot_sz: input.shootSz ?? false,
    shoot_hk: input.shootHk ?? false,
    raw_footage_done: input.rawFootageDone ?? false,
    needs_editing: input.needsEditing ?? null,
    demo_done: input.demoDone ?? false,
    copy_sc: input.copySc ?? false,
    copy_tc: input.copyTc ?? false,
    copy_en: input.copyEn ?? false,
    subtitle_done: input.subtitleDone ?? false,
    reviewed: input.reviewed ?? false,
    shoot_at: input.shootAt ?? null,
    planned_publish_date: input.plannedPublishDate ?? null,
    published_date: input.publishedDate ?? null,
    platform_publish: input.platformPublish ?? {},
    storage_path: input.storagePath ?? null,
    project_category: input.projectCategory ?? 'client',
    notes: input.notes ?? null,
    workflow_stage: input.workflowStage ?? 'prep',
    prep_assignments: input.prepAssignments ?? {},
    production_progress: input.productionProgress ?? {},
    location_notes: input.locationNotes ?? null,
    review_reject_reason: input.reviewRejectReason ?? null,
    submitted_for_review_at: input.submittedForReviewAt ?? null,
    reviewed_at: input.reviewedAt ?? null,
    reviewed_by: input.reviewedBy ?? null,
    updated_at: new Date().toISOString(),
  };
}
