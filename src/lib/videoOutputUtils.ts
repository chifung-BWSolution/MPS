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
  withoutLegacyLanguagePublishKeys,
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
};

function normalizePlatformUrlList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    const url = value.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function isPlatformPublished(
  platformPublish: PlatformPublishMap,
  key: PlatformPublishKey,
): boolean {
  const entry = platformPublish[key];
  if (entry === true) return true;
  return getPlatformUrls(platformPublish, key).length > 0;
}

/** Every non-empty link for a platform. Falls back to the legacy single `url`. */
export function getPlatformUrls(platformPublish: PlatformPublishMap, key: PlatformPublishKey): string[] {
  const entry = platformPublish[key];
  if (!entry || typeof entry !== 'object') return [];
  if (Array.isArray(entry.urls)) {
    const urls = normalizePlatformUrlList(entry.urls.filter((url): url is string => typeof url === 'string'));
    if (urls.length) return urls;
  }
  const single = typeof entry.url === 'string' ? entry.url.trim() : '';
  return single ? [single] : [];
}

export function getPlatformUrl(platformPublish: PlatformPublishMap, key: PlatformPublishKey): string {
  return getPlatformUrls(platformPublish, key)[0] ?? '';
}

export function mergePlatformUrls(
  existing: PlatformPublishMap,
  urls: Partial<Record<PlatformPublishKey, string | string[]>>,
): PlatformPublishMap {
  const merged: PlatformPublishMap = withoutLegacyLanguagePublishKeys(existing);
  for (const key of MEDIA_PLATFORM_PUBLISH_KEYS) {
    if (!(key in urls)) continue;
    const raw = urls[key];
    const list = normalizePlatformUrlList(Array.isArray(raw) ? raw : [raw ?? '']);
    if (list.length === 1) {
      merged[key] = { url: list[0] };
    } else if (list.length > 1) {
      merged[key] = { url: list[0], urls: list };
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

export function urlsFromPlatformPublish(
  platformPublish: PlatformPublishMap,
): Partial<Record<PlatformPublishKey, string[]>> {
  const result: Partial<Record<PlatformPublishKey, string[]>> = {};
  for (const key of MEDIA_PLATFORM_PUBLISH_KEYS) {
    const urls = getPlatformUrls(platformPublish, key);
    if (urls.length) result[key] = urls;
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
    .flatMap(key =>
      getPlatformUrls(platformPublish, key).map(url => `${PLATFORM_PUBLISH_LABELS[key]}：${url}`),
    )
    .join('\n');
}

export const VIDEO_OUTPUT_STATUS_LABELS: Record<VideoOutputStatus, string> = {
  pending: '待製作',
  in_production: '製作中',
  pending_publish: '待發佈',
  published: '已發佈',
  delisted: '已下架',
};

export const VIDEO_OUTPUT_STATUS_COLORS: Record<VideoOutputStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  in_production: 'bg-amber-100 text-amber-800',
  pending_publish: 'bg-purple-100 text-purple-800',
  published: 'bg-teal-100 text-teal-800',
  delisted: 'bg-rose-100 text-rose-800',
};

export function formatShootLocation(shootHk: boolean, shootSz: boolean): string {
  if (shootHk && shootSz) return '香港+深圳';
  if (shootHk) return '香港';
  if (shootSz) return '深圳';
  return '—';
}

export function hasAnyMediaPlatformPublished(platformPublish?: PlatformPublishMap): boolean {
  if (!platformPublish) return false;
  return MEDIA_PLATFORM_PUBLISH_KEYS.some(key => isPlatformPublished(platformPublish, key));
}

export function deriveVideoOutputStatus(row: Pick<
  VideoOutput,
  | 'workflowStage'
  | 'shootSz'
  | 'shootHk'
  | 'rawFootageDone'
  | 'needsEditing'
  | 'demoDone'
  | 'publishedDate'
  | 'platformPublish'
>): VideoOutputStatus {
  // 已下架優先：即使仍有發佈日期／平台鏈接，也維持下架狀態
  if (row.workflowStage === 'delisted') {
    return 'delisted';
  }

  // Prefer concrete publish evidence over a stale workflow_stage
  if (row.publishedDate?.trim() || hasAnyMediaPlatformPublished(row.platformPublish)) {
    return 'published';
  }

  if (row.workflowStage) {
    switch (row.workflowStage) {
      case 'published':
        return 'published';
      case 'review':
        return 'pending_publish';
      case 'production':
        return 'in_production';
      case 'prep':
        return 'pending';
    }
  }

  if (row.demoDone) return 'pending_publish';
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
  asana_url: string | null;
  shoot_sz: boolean;
  shoot_hk: boolean;
  raw_footage_done: boolean;
  needs_editing: boolean | null;
  demo_done: boolean;
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
  admin_review_passed?: boolean | null;
  admin_reviewed_at?: string | null;
  admin_reviewed_by?: string | null;
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
    asanaUrl: row.asana_url ?? undefined,
    shootSz: row.shoot_sz,
    shootHk: row.shoot_hk,
    rawFootageDone: row.raw_footage_done,
    needsEditing: row.needs_editing,
    demoDone: row.demo_done,
    subtitleDone: row.subtitle_done ?? false,
    reviewed: row.reviewed ?? false,
    shootAt: row.shoot_at ?? undefined,
    plannedPublishDate: row.planned_publish_date ?? undefined,
    publishedDate: row.published_date ?? undefined,
    platformPublish: withoutLegacyLanguagePublishKeys(row.platform_publish),
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
    adminReviewPassed: row.admin_review_passed ?? false,
    adminReviewedAt: row.admin_reviewed_at ?? undefined,
    adminReviewedBy: row.admin_reviewed_by ?? undefined,
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
    asana_url: input.asanaUrl?.trim() || null,
    shoot_sz: input.shootSz ?? false,
    shoot_hk: input.shootHk ?? false,
    raw_footage_done: input.rawFootageDone ?? false,
    needs_editing: input.needsEditing ?? null,
    demo_done: input.demoDone ?? false,
    subtitle_done: input.subtitleDone ?? false,
    reviewed: input.reviewed ?? false,
    shoot_at: input.shootAt ?? null,
    planned_publish_date: input.plannedPublishDate ?? null,
    published_date: input.publishedDate ?? null,
    platform_publish: withoutLegacyLanguagePublishKeys(input.platformPublish),
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
