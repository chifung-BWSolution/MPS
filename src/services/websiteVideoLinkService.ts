import { supabase } from '@/lib/supabase';
import { mapVideoOutputRow } from '@/lib/videoOutputUtils';
import type { VideoOutput } from '@/types/videoOutput';
import { fetchWorkLogTotalsByVideoIds } from '@/services/videoOutputWorkLogService';

const VIDEO_SELECT = `
  *,
  vchannels ( channel_code, public_name )
`;

export type WebsiteLinkedVideo = VideoOutput & {
  linkId: string;
  totalHours: number;
};

async function syncWebsiteVideosCount(websiteProfileId: string): Promise<number> {
  const { count, error } = await supabase
    .from('website_video_links')
    .select('id', { count: 'exact', head: true })
    .eq('website_profile_id', websiteProfileId);

  if (error) throw error;

  const videosCount = count ?? 0;
  const { error: updateError } = await supabase
    .from('webandsystem_list')
    .update({ videos_count: videosCount, updated_at: new Date().toISOString() })
    .eq('id', websiteProfileId);

  if (updateError) throw updateError;
  return videosCount;
}

export async function fetchLinkedVideosForWebsite(
  websiteProfileId: string,
): Promise<WebsiteLinkedVideo[]> {
  const { data: links, error: linkError } = await supabase
    .from('website_video_links')
    .select('id, video_output_id, created_at')
    .eq('website_profile_id', websiteProfileId)
    .order('created_at', { ascending: false });

  if (linkError) throw linkError;
  if (!links?.length) return [];

  const videoIds = links.map(l => l.video_output_id as string);
  const { data: videos, error: videoError } = await supabase
    .from('video_output')
    .select(VIDEO_SELECT)
    .in('id', videoIds);

  if (videoError) throw videoError;

  const videoMap = new Map(
    (videos ?? []).map(row => {
      const mapped = mapVideoOutputRow(row as never);
      return [mapped.id, mapped] as const;
    }),
  );

  const hoursMap = await fetchWorkLogTotalsByVideoIds(videoIds);

  return links
    .map(link => {
      const video = videoMap.get(link.video_output_id as string);
      if (!video) return null;
      return {
        ...video,
        linkId: link.id as string,
        totalHours: hoursMap.get(video.id) ?? 0,
      };
    })
    .filter((v): v is WebsiteLinkedVideo => v !== null);
}

export async function linkVideosToWebsite(
  websiteProfileId: string,
  videoOutputIds: string[],
): Promise<number> {
  const uniqueIds = [...new Set(videoOutputIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return syncWebsiteVideosCount(websiteProfileId);
  }

  const rows = uniqueIds.map(videoOutputId => ({
    website_profile_id: websiteProfileId,
    video_output_id: videoOutputId,
  }));

  const { error } = await supabase
    .from('website_video_links')
    .upsert(rows, { onConflict: 'website_profile_id,video_output_id', ignoreDuplicates: true });

  if (error) throw error;
  return syncWebsiteVideosCount(websiteProfileId);
}

export async function unlinkVideoFromWebsite(
  websiteProfileId: string,
  linkId: string,
): Promise<number> {
  const { error } = await supabase
    .from('website_video_links')
    .delete()
    .eq('id', linkId)
    .eq('website_profile_id', websiteProfileId);

  if (error) throw error;
  return syncWebsiteVideosCount(websiteProfileId);
}

export async function fetchLinkableVideoOutputs(
  websiteProfileId: string,
): Promise<VideoOutput[]> {
  const { data: links, error: linkError } = await supabase
    .from('website_video_links')
    .select('video_output_id')
    .eq('website_profile_id', websiteProfileId);

  if (linkError) throw linkError;

  const linkedIds = new Set((links ?? []).map(l => l.video_output_id as string));

  const { data, error } = await supabase
    .from('video_output')
    .select(VIDEO_SELECT)
    .order('production_year', { ascending: false })
    .order('video_code');

  if (error) throw error;

  return (data ?? [])
    .map(row => mapVideoOutputRow(row as never))
    .filter(v => !linkedIds.has(v.id));
}
