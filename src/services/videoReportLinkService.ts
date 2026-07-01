import { supabase } from '@/lib/supabase';
import {
  createPendingReportItem,
  localDateString,
  updatePendingReportHours,
} from '@/services/reportLinkService';
import type { VideoOutput } from '@/types/videoOutput';
import type { VideoWorkLogDraft } from '@/types/videoOutputWorkLog';
import { latestWorkDateForStaff, sumHoursForStaff } from '@/services/videoOutputWorkLogService';

export type VideoPendingSyncResult =
  | { action: 'skipped'; reason: 'no_hours' | 'no_staff' | 'consumed' }
  | { action: 'created' | 'updated' };

function resolveVideoSourceType(video: Pick<VideoOutput, 'publishedDate'>): string {
  return video.publishedDate ? 'video_published' : 'video_demo_done';
}

function buildVideoReportTitle(video: Pick<VideoOutput, 'title' | 'publishedDate'>): string {
  const prefix = video.publishedDate ? '影片發佈' : '影片製作';
  return `${prefix} — ${video.title}`;
}

export async function syncVideoPendingReport(
  video: VideoOutput,
  workLogs: VideoWorkLogDraft[],
  staffId: string,
): Promise<VideoPendingSyncResult> {
  const suggestedHours = sumHoursForStaff(workLogs, staffId);
  if (suggestedHours <= 0) {
    return { action: 'skipped', reason: 'no_hours' };
  }

  if (!staffId) {
    return { action: 'skipped', reason: 'no_staff' };
  }

  const sourceType = resolveVideoSourceType(video);
  const reportDate = latestWorkDateForStaff(workLogs, staffId) ?? localDateString();
  const outcomeUrl = video.storagePath && /^https?:\/\//i.test(video.storagePath)
    ? video.storagePath
    : video.asanaUrl;

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

  const payload = {
    staffId,
    reportDate,
    sourceModule: 'video',
    sourceType,
    sourceId: video.id,
    category: 'video_editing',
    title: buildVideoReportTitle(video),
    suggestedHours,
    relatedId: video.vchannelId,
    relatedName: video.channelPublicName ?? video.channelCode,
    outcomeType: outcomeUrl ? 'url' : undefined,
    outcomeUrl,
    metadata: {
      videoCode: video.videoCode,
      vchannelCode: video.channelCode,
      workLogCount: workLogs.length,
      operatorHours: suggestedHours,
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
