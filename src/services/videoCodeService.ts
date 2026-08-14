import { supabase } from '@/lib/supabase';

export type VideoCodeDeviceSuffix = 'D' | 'M' | null;

export function formatVideoCode(
  channelCode: string,
  year: number,
  seq: number,
  deviceSuffix: VideoCodeDeviceSuffix,
): string {
  const base = `${channelCode}-${year}-${String(seq).padStart(3, '0')}`;
  if (deviceSuffix === 'D' || deviceSuffix === 'M') return `${base}${deviceSuffix}`;
  return base;
}

export function parseSeqFromVideoCode(
  videoCode: string,
  channelCode: string,
  year: number,
): number | null {
  const prefix = `${channelCode}-${year}-`;
  if (!videoCode.startsWith(prefix)) return null;
  const rest = videoCode.slice(prefix.length);
  const match = rest.match(/^(\d{3})(?:[DM])?$/i);
  if (!match) return null;
  return parseInt(match[1], 10);
}

export function parseDeviceSuffixFromVideoCode(videoCode: string): VideoCodeDeviceSuffix {
  const last = videoCode.slice(-1).toUpperCase();
  if (last === 'D' || last === 'M') {
    const before = videoCode.slice(0, -1);
    if (/-\d{3}$/.test(before)) return last as 'D' | 'M';
  }
  return null;
}

export async function fetchMaxSequenceFromDb(channelCode: string, year: number): Promise<number> {
  const { data, error } = await supabase
    .from('video_output')
    .select('video_code')
    .like('video_code', `${channelCode}-${year}-%`);

  if (error) throw error;

  let max = 0;
  for (const row of data ?? []) {
    const code = row.video_code as string;
    const seq = parseSeqFromVideoCode(code, channelCode, year);
    if (seq !== null && seq > max) max = seq;
  }
  return max;
}

export async function generateNextVideoCode(
  channelCode: string,
  deviceSuffix: VideoCodeDeviceSuffix,
  year = new Date().getFullYear(),
): Promise<{ videoCode: string; seq: number; year: number }> {
  const maxSeq = await fetchMaxSequenceFromDb(channelCode, year);
  const seq = maxSeq + 1;
  return {
    videoCode: formatVideoCode(channelCode, year, seq, deviceSuffix),
    seq,
    year,
  };
}
