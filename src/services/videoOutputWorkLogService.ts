import { supabase } from '@/lib/supabase';
import type { VideoOutputWorkLog, VideoWorkLogDraft } from '@/types/videoOutputWorkLog';

type DbWorkLogRow = {
  id: string;
  video_output_id: string;
  staff_id: string;
  staff_name: string | null;
  work_date: string;
  hours: number;
  work_type: VideoOutputWorkLog['workType'];
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbWorkLogRow): VideoOutputWorkLog {
  return {
    id: row.id,
    videoOutputId: row.video_output_id,
    staffId: row.staff_id,
    staffName: row.staff_name ?? undefined,
    workDate: row.work_date,
    hours: Number(row.hours),
    workType: row.work_type,
    notes: row.notes ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchWorkLogTotalsByVideoIds(
  videoOutputIds: string[],
): Promise<Map<string, number>> {
  if (videoOutputIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('video_output_work_logs')
    .select('video_output_id, hours')
    .in('video_output_id', videoOutputIds);

  if (error) throw error;

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    const id = row.video_output_id as string;
    totals.set(id, (totals.get(id) ?? 0) + Number(row.hours));
  }
  return totals;
}

export async function fetchWorkLogTotalsByVchannelIds(
  vchannelIds: string[],
): Promise<Map<string, number>> {
  if (vchannelIds.length === 0) return new Map();

  const { data: videos, error: videoError } = await supabase
    .from('video_output')
    .select('id, vchannel_id')
    .in('vchannel_id', vchannelIds);

  if (videoError) throw videoError;

  const videoToChannel = new Map<string, string>();
  for (const row of videos ?? []) {
    videoToChannel.set(row.id as string, row.vchannel_id as string);
  }

  const videoIds = [...videoToChannel.keys()];
  if (videoIds.length === 0) return new Map();

  const videoTotals = await fetchWorkLogTotalsByVideoIds(videoIds);
  const channelTotals = new Map<string, number>();

  for (const [videoId, hours] of videoTotals) {
    const channelId = videoToChannel.get(videoId);
    if (!channelId) continue;
    channelTotals.set(channelId, (channelTotals.get(channelId) ?? 0) + hours);
  }

  return channelTotals;
}

export async function fetchWorkLogsByVideoId(videoOutputId: string): Promise<VideoOutputWorkLog[]> {
  const { data, error } = await supabase
    .from('video_output_work_logs')
    .select('*')
    .eq('video_output_id', videoOutputId)
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(row => mapRow(row as DbWorkLogRow));
}

export async function saveWorkLogsForVideo(
  videoOutputId: string,
  drafts: VideoWorkLogDraft[],
  createdBy?: string,
): Promise<VideoOutputWorkLog[]> {
  const { error: deleteError } = await supabase
    .from('video_output_work_logs')
    .delete()
    .eq('video_output_id', videoOutputId);

  if (deleteError) throw deleteError;

  if (drafts.length === 0) return [];

  const now = new Date().toISOString();
  const rows = drafts.map(d => ({
    video_output_id: videoOutputId,
    staff_id: d.staffId,
    staff_name: d.staffName ?? null,
    work_date: d.workDate,
    hours: d.hours,
    work_type: d.workType,
    notes: d.notes?.trim() || null,
    created_by: createdBy ?? null,
    updated_at: now,
  }));

  const { data, error } = await supabase
    .from('video_output_work_logs')
    .insert(rows)
    .select('*');

  if (error) throw error;
  return (data ?? []).map(row => mapRow(row as DbWorkLogRow));
}

export function sumHoursForStaff(logs: VideoWorkLogDraft[], staffId: string): number {
  return logs
    .filter(l => l.staffId === staffId && l.hours > 0)
    .reduce((sum, l) => sum + l.hours, 0);
}

export function latestWorkDateForStaff(logs: VideoWorkLogDraft[], staffId: string): string | null {
  const dates = logs
    .filter(l => l.staffId === staffId && l.workDate)
    .map(l => l.workDate)
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

export function validateWorkLogDrafts(drafts: VideoWorkLogDraft[]): string | null {
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const row = i + 1;
    if (!d.staffId) return `工時 #${row}：請選擇人員`;
    if (!d.workDate) return `工時 #${row}：請選擇日期`;
    if (!d.hours || d.hours <= 0) return `工時 #${row}：工時必須大於 0`;
  }
  return null;
}

export type StaffDirectoryOption = {
  staffId: string;
  displayName: string;
};

export async function fetchStaffDirectoryOptions(): Promise<StaffDirectoryOption[]> {
  const { data, error } = await supabase
    .from('staffs')
    .select('id, display_name')
    .not('id', 'is', null)
    .order('display_name');

  if (error) throw error;

  return (data ?? [])
    .filter(r => r.id)
    .map(r => ({
      staffId: r.id as string,
      displayName: (r.display_name as string) || (r.id as string),
    }));
}

/** Map a stored staff key onto staffs.id. */
export function resolveStaffOptionId(
  storedId: string | null | undefined,
  staffOptions: StaffDirectoryOption[],
): string {
  if (!storedId) return '';
  if (staffOptions.some(s => s.staffId === storedId)) return storedId;
  return storedId;
}
