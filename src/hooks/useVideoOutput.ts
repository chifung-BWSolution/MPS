import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { VideoOutput, VideoOutputInput } from '@/types/videoOutput';
import { mapVideoOutputRow, videoOutputToDbRow } from '@/lib/videoOutputUtils';

const SELECT_QUERY = `
  *,
  vchannels ( channel_code, public_name )
`;

export function useVideoOutput() {
  
  const [videos, setVideos] = useState<VideoOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('video_output')
      .select(SELECT_QUERY)
      .order('production_year', { ascending: false })
      .order('video_code');

    if (fetchError) {
      setError(fetchError.message);
      setVideos([]);
    } else {
      setError(null);
      setVideos((data ?? []).map(row => mapVideoOutputRow(row as never)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const addVideo = useCallback(async (input: VideoOutputInput) => {
    const row = videoOutputToDbRow(input);
    const { data, error: insertError } = await supabase
      .from('video_output')
      .insert(row)
      .select(SELECT_QUERY)
      .single();

    if (insertError) return insertError;
    if (data) {
      const mapped = mapVideoOutputRow(data as never);
      setVideos(prev => [mapped, ...prev].sort((a, b) => b.videoCode.localeCompare(a.videoCode)));
    }
    return null;
  }, []);

  const updateVideo = useCallback(async (id: string, input: Partial<VideoOutputInput>) => {
    const existing = videos.find(v => v.id === id);
    if (!existing) return new Error('Video not found');

    const merged: VideoOutputInput = {
      vchannelId: input.vchannelId ?? existing.vchannelId,
      productionYear: input.productionYear ?? existing.productionYear,
      videoCode: input.videoCode ?? existing.videoCode,
      title: input.title ?? existing.title,
      asanaTaskId: input.asanaTaskId ?? existing.asanaTaskId,
      asanaUrl: input.asanaUrl ?? existing.asanaUrl,
      shootSz: input.shootSz ?? existing.shootSz,
      shootHk: input.shootHk ?? existing.shootHk,
      rawFootageDone: input.rawFootageDone ?? existing.rawFootageDone,
      needsEditing: input.needsEditing !== undefined ? input.needsEditing : existing.needsEditing,
      demoDone: input.demoDone ?? existing.demoDone,
      copySc: input.copySc ?? existing.copySc,
      copyTc: input.copyTc ?? existing.copyTc,
      copyEn: input.copyEn ?? existing.copyEn,
      subtitleDone: input.subtitleDone ?? existing.subtitleDone,
      reviewed: input.reviewed ?? existing.reviewed,
      shootAt: input.shootAt ?? existing.shootAt,
      plannedPublishDate: input.plannedPublishDate ?? existing.plannedPublishDate,
      publishedDate: input.publishedDate ?? existing.publishedDate,
      platformPublish: input.platformPublish ?? existing.platformPublish,
      storagePath: input.storagePath ?? existing.storagePath,
      projectCategory: input.projectCategory ?? existing.projectCategory,
      notes: input.notes ?? existing.notes,
      workflowStage: input.workflowStage ?? existing.workflowStage,
      prepAssignments: input.prepAssignments ?? existing.prepAssignments,
      productionProgress: input.productionProgress ?? existing.productionProgress,
      locationNotes: input.locationNotes ?? existing.locationNotes,
      reviewRejectReason: input.reviewRejectReason ?? existing.reviewRejectReason,
      submittedForReviewAt: input.submittedForReviewAt ?? existing.submittedForReviewAt,
      reviewedAt: input.reviewedAt ?? existing.reviewedAt,
      reviewedBy: input.reviewedBy ?? existing.reviewedBy,
    };

    const row = videoOutputToDbRow(merged);
    const { data, error: updateError } = await supabase
      .from('video_output')
      .update(row)
      .eq('id', id)
      .select(SELECT_QUERY)
      .single();

    if (updateError) return updateError;
    if (data) {
      const mapped = mapVideoOutputRow(data as never);
      setVideos(prev => prev.map(v => (v.id === id ? mapped : v)));
    }
    return null;
  }, [videos]);

  const deleteVideo = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase.from('video_output').delete().eq('id', id);
    if (!deleteError) setVideos(prev => prev.filter(v => v.id !== id));
    return deleteError;
  }, []);

  return { videos, loading, error, fetchVideos, addVideo, updateVideo, deleteVideo };
}
