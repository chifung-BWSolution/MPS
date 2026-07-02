import type { VideoOutput } from '@/types/videoOutput';
import type { PrepAssignments } from '@/types/videoOutputWorkflow';
import type {
  ProductionProgress,
  VideoWorkflowMock,
  VideoWorkflowStage,
  VideoWorkflowUpdate,
} from '@/types/videoWorkflow';
import {
  emptyProductionProgress,
  normalizeProductionProgress,
  syncLegacyProductionFields,
} from '@/lib/videoWorkflowUtils';

export function parsePrepAssignments(raw: unknown): PrepAssignments {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as PrepAssignments;
}

export function parseProductionProgressJson(raw: unknown): ProductionProgress | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as ProductionProgress;
  if (!obj.copywriting && !obj.script && !obj.rawFootage && !obj.editing && !obj.demo) {
    if (obj.footageMode == null && obj.editingMode == null) return undefined;
  }
  return obj;
}

export function resolveProductionProgress(video: Pick<
  VideoOutput,
  'productionProgress' | 'rawFootageDone' | 'needsEditing' | 'demoDone'
>): ProductionProgress {
  const fromJson = parseProductionProgressJson(video.productionProgress);
  if (fromJson) {
    return normalizeProductionProgress({
      productionProgress: fromJson,
      rawFootageDone: video.rawFootageDone,
      needsEditing: video.needsEditing,
      demoDone: video.demoDone,
    } as VideoWorkflowMock);
  }
  return normalizeProductionProgress({
    rawFootageDone: video.rawFootageDone,
    needsEditing: video.needsEditing,
    demoDone: video.demoDone,
  } as VideoWorkflowMock);
}

export function mapVideoOutputToWorkflow(video: VideoOutput): VideoWorkflowMock {
  const prep = video.prepAssignments ?? {};
  const productionProgress = resolveProductionProgress(video);
  return {
    id: video.id,
    vchannelId: video.vchannelId,
    vchannelCode: video.channelCode,
    videoCode: video.videoCode,
    title: video.title,
    productionYear: video.productionYear,
    createdAt: video.createdAt,
    stage: video.workflowStage ?? 'prep',
    shootAt: video.shootAt,
    location: {
      sz: video.shootSz,
      hk: video.shootHk,
      notes: video.locationNotes,
    },
    copywriting: prep.copywriting,
    script: prep.script,
    model: prep.model,
    photographer: prep.photographer,
    onSiteCrew: prep.onSiteCrew ? [...prep.onSiteCrew] : undefined,
    productionProgress,
    rawFootageDone: video.rawFootageDone,
    needsEditing: video.needsEditing,
    demoDone: video.demoDone,
    storagePath: video.storagePath,
    submittedForReviewAt: video.submittedForReviewAt,
    reviewRejectReason: video.reviewRejectReason,
    reviewedAt: video.reviewedAt,
    reviewedBy: video.reviewedBy,
    plannedPublishDate: video.plannedPublishDate,
    publishedDate: video.publishedDate,
    platformPublish: video.platformPublish,
  } as VideoWorkflowMock;
}

function mergePrepAssignments(existing: PrepAssignments, patch: VideoWorkflowUpdate): PrepAssignments {
  return {
    copywriting: patch.copywriting !== undefined ? patch.copywriting : existing.copywriting,
    script: patch.script !== undefined ? patch.script : existing.script,
    model: patch.model !== undefined ? patch.model : existing.model,
    photographer: patch.photographer !== undefined ? patch.photographer : existing.photographer,
    onSiteCrew: patch.onSiteCrew !== undefined ? patch.onSiteCrew : existing.onSiteCrew,
  };
}

export function workflowPatchToDbUpdate(
  existing: VideoOutput,
  patch: VideoWorkflowUpdate,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.stage !== undefined) row.workflow_stage = patch.stage;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.shootAt !== undefined) row.shoot_at = patch.shootAt || null;
  if (patch.plannedPublishDate !== undefined) row.planned_publish_date = patch.plannedPublishDate || null;
  if (patch.publishedDate !== undefined) row.published_date = patch.publishedDate || null;
  if (patch.storagePath !== undefined) row.storage_path = patch.storagePath || null;
  if (patch.platformPublish !== undefined) row.platform_publish = patch.platformPublish;
  if (patch.reviewRejectReason !== undefined) row.review_reject_reason = patch.reviewRejectReason || null;
  if (patch.submittedForReviewAt !== undefined) row.submitted_for_review_at = patch.submittedForReviewAt || null;
  if (patch.reviewedAt !== undefined) row.reviewed_at = patch.reviewedAt || null;
  if (patch.reviewedBy !== undefined) row.reviewed_by = patch.reviewedBy || null;
  if (patch.productionYear !== undefined) row.production_year = patch.productionYear ?? null;
  if (patch.vchannelId !== undefined) row.vchannel_id = patch.vchannelId;

  if (patch.location) {
    row.shoot_sz = !!patch.location.sz;
    row.shoot_hk = !!patch.location.hk;
    if (patch.location.notes !== undefined) row.location_notes = patch.location.notes || null;
  }

  const hasPrepPatch =
    patch.copywriting !== undefined ||
    patch.script !== undefined ||
    patch.model !== undefined ||
    patch.photographer !== undefined ||
    patch.onSiteCrew !== undefined;

  if (hasPrepPatch) {
    row.prep_assignments = mergePrepAssignments(existing.prepAssignments ?? {}, patch);
  }

  if (patch.productionProgress) {
    const current = resolveProductionProgress(existing);
    const merged: ProductionProgress = {
      ...current,
      ...patch.productionProgress,
      copywriting: { ...current.copywriting, ...patch.productionProgress.copywriting },
      script: { ...current.script, ...patch.productionProgress.script },
      rawFootage: { ...current.rawFootage, ...patch.productionProgress.rawFootage },
      editing: { ...current.editing, ...patch.productionProgress.editing },
      demo: { ...current.demo, ...patch.productionProgress.demo },
    };
    row.production_progress = merged;
    Object.assign(row, legacyFieldsFromProgress(merged));
  } else if (
    patch.rawFootageDone !== undefined ||
    patch.needsEditing !== undefined ||
    patch.demoDone !== undefined
  ) {
    if (patch.rawFootageDone !== undefined) row.raw_footage_done = patch.rawFootageDone;
    if (patch.needsEditing !== undefined) row.needs_editing = patch.needsEditing;
    if (patch.demoDone !== undefined) row.demo_done = patch.demoDone;
  }

  if (patch.stage === 'publish' || patch.stage === 'published') {
    row.reviewed = true;
  }

  return row;
}

function legacyFieldsFromProgress(progress: ProductionProgress): Record<string, unknown> {
  const legacy = syncLegacyProductionFields(progress);
  return {
    raw_footage_done: legacy.rawFootageDone ?? false,
    needs_editing: legacy.needsEditing ?? null,
    demo_done: legacy.demoDone ?? false,
  };
}

export function createVideoDbRow(payload: {
  vchannelId: string;
  videoCode: string;
  title: string;
  productionYear?: number;
  projectCategory?: VideoOutput['projectCategory'];
  shootAt?: string;
  location?: VideoWorkflowMock['location'];
  prepAssignments?: PrepAssignments;
}): Record<string, unknown> {
  const location = payload.location ?? { sz: false, hk: false };
  return {
    vchannel_id: payload.vchannelId,
    video_code: payload.videoCode,
    title: payload.title,
    production_year: payload.productionYear ?? new Date().getFullYear(),
    project_category: payload.projectCategory ?? 'client',
    workflow_stage: 'prep' satisfies VideoWorkflowStage,
    shoot_at: payload.shootAt ?? null,
    shoot_sz: !!location.sz,
    shoot_hk: !!location.hk,
    location_notes: location.notes?.trim() || null,
    prep_assignments: payload.prepAssignments ?? {},
    production_progress: emptyProductionProgress(),
    platform_publish: {},
  };
}

export const PRODUCTION_WORK_LOG_PREFIX = '[製作]';
