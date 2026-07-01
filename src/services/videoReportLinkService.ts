import { supabase } from '@/lib/supabase';
import {
  createPendingReportItem,
  localDateString,
  updatePendingReportHours,
} from '@/services/reportLinkService';
import type { VideoOutput } from '@/types/videoOutput';
import type { VideoWorkLogDraft } from '@/types/videoOutputWorkLog';
import { VIDEO_WORK_LOG_TYPE_LABELS } from '@/types/videoOutputWorkLog';
import { latestWorkDateForStaff, sumHoursForStaff } from '@/services/videoOutputWorkLogService';
import { firstPublishedPlatformUrl } from '@/lib/videoOutputUtils';

export type VideoPendingSyncResult =
  | { action: 'skipped'; reason: 'no_hours' | 'no_staff' | 'consumed' }
  | { action: 'created' | 'updated' };

function resolveVideoSourceType(video: Pick<VideoOutput, 'publishedDate'>): string {
  return video.publishedDate ? 'video_published' : 'video_demo_done';
}

/** Only real video/output URLs — never fall back to Asana task links. */
export function resolveVideoOutcomeUrl(
  video: Pick<VideoOutput, 'storagePath' | 'platformPublish'>,
): string | undefined {
  const path = video.storagePath?.trim();
  if (path && /^https?:\/\//i.test(path)) return path;
  return firstPublishedPlatformUrl(video.platformPublish);
}

export function buildVideoReportTitle(
  video: Pick<VideoOutput, 'title' | 'publishedDate'>,
  operatorLogs: VideoWorkLogDraft[],
): string {
  const prefix = video.publishedDate ? '影片發佈' : '影片製作';
  const base = `${prefix} — ${video.title}`;

  if (operatorLogs.length === 0) return base;

  const typeLabels = [
    ...new Set(operatorLogs.map(l => VIDEO_WORK_LOG_TYPE_LABELS[l.workType] ?? l.workType)),
  ];
  const noteTexts = operatorLogs.map(l => l.notes?.trim()).filter(Boolean) as string[];

  const detailParts: string[] = [];
  if (typeLabels.length > 0) detailParts.push(typeLabels.join('、'));
  if (noteTexts.length > 0) detailParts.push(noteTexts.join('；'));

  if (detailParts.length === 0) return base;
  return `${base}（${detailParts.join('｜')}）`;
}

export async function syncVideoPendingReport(
  video: VideoOutput,
  workLogs: VideoWorkLogDraft[],
  staffId: string,
): Promise<VideoPendingSyncResult> {
  const operatorLogs = workLogs.filter(l => l.staffId === staffId && l.hours > 0);
  const suggestedHours = sumHoursForStaff(workLogs, staffId);
  if (suggestedHours <= 0) {
    return { action: 'skipped', reason: 'no_hours' };
  }

  if (!staffId) {
    return { action: 'skipped', reason: 'no_staff' };
  }

  const sourceType = resolveVideoSourceType(video);
  const reportDate = latestWorkDateForStaff(workLogs, staffId) ?? localDateString();
  const outcomeUrl = resolveVideoOutcomeUrl(video);

  const { data: existing, error: existingError } = await supabase
    .from('pending_report_items')
    .select('id, status')
    .eq('staff_id', staffId)
    .eq('source_module', 'video')
    .eq('source_type', sourceType)
    .eq('source_id', video.id)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.status === 'consumed') {
    return { action: 'skipped', reason: 'consumed' };
  }

  const title = buildVideoReportTitle(video, operatorLogs);
  const payload = {
    staffId,
    reportDate,
    sourceModule: 'video',
    sourceType,
    sourceId: video.id,
    category: 'video_editing',
    title,
    suggestedHours,
    relatedId: video.vchannelId,
    relatedName: video.channelPublicName ?? video.channelCode,
    outcomeType: outcomeUrl ? 'url' : undefined,
    outcomeUrl,
    metadata: {
      videoCode: video.videoCode,
      vchannelCode: video.channelCode,
      workLogCount: operatorLogs.length,
      operatorHours: suggestedHours,
      workTypes: operatorLogs.map(l => l.workType),
      workNotes: operatorLogs.map(l => l.notes?.trim()).filter(Boolean),
    },
  };

  if (existing && (existing.status === 'pending' || existing.status === 'pulled')) {
    await updatePendingReportHours(staffId, 'video', sourceType, video.id, suggestedHours);
    const { error: updateError } = await supabase
      .from('pending_report_items')
      .update({
        report_date: reportDate,
        title: payload.title,
        related_id: payload.relatedId,
        related_name: payload.relatedName,
        outcome_type: payload.outcomeType ?? null,
        outcome_url: payload.outcomeUrl ?? null,
        metadata: payload.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (updateError) throw updateError;
    return { action: 'updated' };
  }

  await createPendingReportItem(payload);
  return { action: 'created' };
}
