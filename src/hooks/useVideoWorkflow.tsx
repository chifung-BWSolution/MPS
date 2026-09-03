import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { VideoOutput } from '@/types/videoOutput';
import type { PrepAssignments } from '@/types/videoOutputWorkflow';
import type { VideoWorkflowMock, VideoWorkflowStage, VideoWorkflowUpdate } from '@/types/videoWorkflow';
import { mapVideoOutputRow } from '@/lib/videoOutputUtils';
import {
  createVideoDbRow,
  mapVideoOutputToWorkflow,
  workflowPatchToDbUpdate,
} from '@/lib/videoOutputWorkflowMapper';
import {
  getPrepMissingItems,
  isPrepComplete,
  normalizeVideoWorkflow,
} from '@/lib/videoWorkflowUtils';
import { inferProjectCategory } from '@/lib/videoOutputUtils';
import { fetchWorkLogsByVideoId, saveWorkLogsForVideo } from '@/services/videoOutputWorkLogService';
import { mergeProductionProgressWorkLogs } from '@/services/productionProgressWorkLogService';
import { resolveStaffUuid } from '@/services/reportLinkService';

const SELECT_QUERY = `
  *,
  vchannels ( channel_code, public_name )
`;

type VideoWorkflowContextValue = {
  loading: boolean;
  error: string | null;
  videos: VideoWorkflowMock[];
  refreshVideos: () => Promise<void>;
  getById: (id: string) => VideoWorkflowMock | undefined;
  getVideoOutputById: (id: string) => VideoOutput | undefined;
  getByStage: (stage: VideoWorkflowStage) => VideoWorkflowMock[];
  getPreReviewVideos: () => VideoWorkflowMock[];
  addVideo: (payload: Omit<VideoWorkflowMock, 'id' | 'stage' | 'createdAt'>) => Promise<string>;
  updateVideo: (id: string, patch: VideoWorkflowUpdate) => Promise<string | null>;
  deleteVideo: (id: string) => Promise<string | null>;
  advanceToProduction: (id: string) => Promise<string | null>;
  submitForReview: (id: string) => Promise<string | null>;
  approveAdminReview: (id: string, reviewedBy: string) => Promise<string | null>;
  rejectAdminReview: (id: string, reason: string, reviewedBy: string) => Promise<string | null>;
  approveReview: (id: string, reviewedBy: string) => Promise<string | null>;
  rejectReview: (id: string, reason: string, reviewedBy: string) => Promise<string | null>;
  completePublish: (id: string, patch: VideoWorkflowUpdate) => Promise<string | null>;
  saveProductionWithWorkLogs: (
    id: string,
    patch: VideoWorkflowUpdate,
    staffId?: string,
    staffName?: string,
  ) => Promise<string | null>;
};

const VideoWorkflowContext = createContext<VideoWorkflowContextValue | null>(null);

function toWorkflowList(rows: VideoOutput[]): VideoWorkflowMock[] {
  return rows.map(row => normalizeVideoWorkflow(mapVideoOutputToWorkflow(row)));
}

export function VideoWorkflowProvider({ children }: { children: ReactNode }) {
  const { systemUser } = useAuth();
  const [rawVideos, setRawVideos] = useState<VideoOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshVideos = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('video_output')
      .select(SELECT_QUERY)
      .order('updated_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setRawVideos([]);
    } else {
      setError(null);
      setRawVideos((data ?? []).map(row => mapVideoOutputRow(row as never)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshVideos();
  }, [refreshVideos]);

  const videos = useMemo(() => toWorkflowList(rawVideos), [rawVideos]);

  const upsertLocal = useCallback((mapped: VideoOutput) => {
    setRawVideos(prev => {
      const next = prev.some(v => v.id === mapped.id)
        ? prev.map(v => (v.id === mapped.id ? mapped : v))
        : [mapped, ...prev];
      return next;
    });
  }, []);

  const fetchOne = useCallback(async (id: string): Promise<VideoOutput | null> => {
    const { data, error: fetchError } = await supabase
      .from('video_output')
      .select(SELECT_QUERY)
      .eq('id', id)
      .single();
    if (fetchError || !data) return null;
    return mapVideoOutputRow(data as never);
  }, []);

  const applyPatch = useCallback(async (id: string, patch: VideoWorkflowUpdate): Promise<string | null> => {
    const existing = rawVideos.find(v => v.id === id);
    if (!existing) return '找不到影片';

    const row = workflowPatchToDbUpdate(existing, patch);
    const { data, error: updateError } = await supabase
      .from('video_output')
      .update(row)
      .eq('id', id)
      .select(SELECT_QUERY)
      .single();

    if (updateError) return updateError.message;
    if (data) upsertLocal(mapVideoOutputRow(data as never));
    return null;
  }, [rawVideos, upsertLocal]);

  const getById = useCallback((id: string) => videos.find(v => v.id === id), [videos]);

  const getVideoOutputById = useCallback(
    (id: string) => rawVideos.find(v => v.id === id),
    [rawVideos],
  );

  const getByStage = useCallback(
    (stage: VideoWorkflowStage) => videos.filter(v => v.stage === stage),
    [videos],
  );

  const getPreReviewVideos = useCallback(
    () => videos.filter(v => v.stage === 'prep' || v.stage === 'production'),
    [videos],
  );

  const addVideo = useCallback(async (payload: Omit<VideoWorkflowMock, 'id' | 'stage' | 'createdAt'>) => {
    const prepAssignments: PrepAssignments = {
      copywriting: payload.copywriting,
      script: payload.script,
      model: payload.model,
      photographer: payload.photographer,
      onSiteCrew: payload.onSiteCrew,
    };

    const row = createVideoDbRow({
      vchannelId: payload.vchannelId ?? '',
      videoCode: payload.videoCode,
      title: payload.title,
      productionYear: payload.productionYear,
      projectCategory: inferProjectCategory(payload.vchannelCode),
      shootAt: payload.shootAt,
      location: payload.location,
      prepAssignments,
    });

    const { data, error: insertError } = await supabase
      .from('video_output')
      .insert(row)
      .select(SELECT_QUERY)
      .single();

    if (insertError) throw new Error(insertError.message);
    const mapped = mapVideoOutputRow(data as never);
    upsertLocal(mapped);
    return mapped.id;
  }, [upsertLocal]);

  const updateVideo = useCallback(
    async (id: string, patch: VideoWorkflowUpdate) => applyPatch(id, patch),
    [applyPatch],
  );

  const deleteVideo = useCallback(async (id: string): Promise<string | null> => {
    const { error: deleteError } = await supabase
      .from('video_output')
      .delete()
      .eq('id', id);

    if (deleteError) return deleteError.message;
    setRawVideos(prev => prev.filter(v => v.id !== id));
    return null;
  }, []);

  const advanceToProduction = useCallback(async (id: string): Promise<string | null> => {
    const video = videos.find(v => v.id === id);
    if (!video) return '找不到影片';
    if (video.stage !== 'prep') return '僅準備中的影片可進入製作';
    if (!isPrepComplete(video)) {
      return `進入製作前需填寫：${getPrepMissingItems(video).join('、')}`;
    }
    return applyPatch(id, { stage: 'production', reviewRejectReason: undefined });
  }, [videos, applyPatch]);

  const submitForReview = useCallback(async (id: string): Promise<string | null> => {
    const video = videos.find(v => v.id === id);
    if (!video) return '找不到影片';
    if (video.stage !== 'production') return '僅製作中的影片可提交審核';
    return applyPatch(id, {
      stage: 'review',
      reviewRejectReason: '',
      submittedForReviewAt: new Date().toISOString(),
      adminReviewPassed: false,
      adminReviewedAt: '',
      adminReviewedBy: '',
      reviewedAt: '',
      reviewedBy: '',
    });
  }, [videos, applyPatch]);

  const approveAdminReview = useCallback(async (id: string, reviewedBy: string): Promise<string | null> => {
    const video = videos.find(v => v.id === id);
    if (!video) return '找不到影片';
    if (video.stage !== 'review') return '僅待審核影片可進行行政審查';
    if (video.adminReviewPassed) return '行政審查已通過';
    return applyPatch(id, {
      adminReviewPassed: true,
      adminReviewedAt: new Date().toISOString(),
      adminReviewedBy: reviewedBy,
      reviewRejectReason: '',
    });
  }, [videos, applyPatch]);

  const rejectAdminReview = useCallback(async (id: string, reason: string, reviewedBy: string): Promise<string | null> => {
    const video = videos.find(v => v.id === id);
    if (!video) return '找不到影片';
    if (video.stage !== 'review') return '僅待審核影片可進行行政審查';
    if (video.adminReviewPassed) return '行政審查已通過，請使用管理批核';
    const trimmed = reason.trim();
    if (!trimmed) return '請填寫拒絕理由';
    return applyPatch(id, {
      stage: 'production',
      adminReviewPassed: false,
      adminReviewedAt: new Date().toISOString(),
      adminReviewedBy: reviewedBy,
      reviewRejectReason: `【行政審查】${trimmed}`,
    });
  }, [videos, applyPatch]);

  const approveReview = useCallback(async (id: string, reviewedBy: string): Promise<string | null> => {
    const video = videos.find(v => v.id === id);
    if (!video) return '找不到影片';
    if (video.stage !== 'review') return '僅待審核影片可進行管理批核';
    if (!video.adminReviewPassed) return '請先完成行政審查';
    return applyPatch(id, {
      stage: 'publish',
      reviewedAt: new Date().toISOString(),
      reviewedBy,
      reviewRejectReason: '',
    });
  }, [videos, applyPatch]);

  const rejectReview = useCallback(async (id: string, reason: string, reviewedBy: string): Promise<string | null> => {
    const video = videos.find(v => v.id === id);
    if (!video) return '找不到影片';
    if (video.stage !== 'review') return '僅待審核影片可進行管理批核';
    if (!video.adminReviewPassed) return '請先完成行政審查';
    const trimmed = reason.trim();
    if (!trimmed) return '請填寫拒絕理由';
    return applyPatch(id, {
      stage: 'production',
      reviewRejectReason: `【管理批核】${trimmed}`,
      reviewedAt: new Date().toISOString(),
      reviewedBy,
      adminReviewPassed: false,
    });
  }, [videos, applyPatch]);

  const completePublish = useCallback(async (id: string, patch: VideoWorkflowUpdate): Promise<string | null> => {
    return applyPatch(id, { ...patch, stage: 'published' });
  }, [applyPatch]);

  const saveProductionWithWorkLogs = useCallback(async (
    id: string,
    patch: VideoWorkflowUpdate,
    staffId?: string,
    staffName?: string,
  ): Promise<string | null> => {
    const err = await applyPatch(id, patch);
    if (err) return err;

    if (!patch.productionProgress) return null;

    const staffUuid = staffId ?? (await resolveStaffUuid(systemUser)) ?? undefined;
    if (!staffUuid) return null;

    try {
      const existingLogs = await fetchWorkLogsByVideoId(id);
      const merged = mergeProductionProgressWorkLogs(
        existingLogs,
        patch.productionProgress,
        staffUuid,
        staffName,
      );
      await saveWorkLogsForVideo(id, merged, staffUuid);
    } catch (e) {
      return e instanceof Error ? e.message : '工時同步失敗';
    }

    const refreshed = await fetchOne(id);
    if (refreshed) upsertLocal(refreshed);
    return null;
  }, [applyPatch, systemUser, fetchOne, upsertLocal]);

  const value = useMemo(
    () => ({
      loading,
      error,
      videos,
      refreshVideos,
      getById,
      getVideoOutputById,
      getByStage,
      getPreReviewVideos,
      addVideo,
      updateVideo,
      deleteVideo,
      advanceToProduction,
      submitForReview,
      approveAdminReview,
      rejectAdminReview,
      approveReview,
      rejectReview,
      completePublish,
      saveProductionWithWorkLogs,
    }),
    [
      loading,
      error,
      videos,
      refreshVideos,
      getById,
      getVideoOutputById,
      getByStage,
      getPreReviewVideos,
      addVideo,
      updateVideo,
      deleteVideo,
      advanceToProduction,
      submitForReview,
      approveAdminReview,
      rejectAdminReview,
      approveReview,
      rejectReview,
      completePublish,
      saveProductionWithWorkLogs,
    ],
  );

  return <VideoWorkflowContext.Provider value={value}>{children}</VideoWorkflowContext.Provider>;
}

export function useVideoWorkflow() {
  const ctx = useContext(VideoWorkflowContext);
  if (!ctx) throw new Error('useVideoWorkflow must be used within VideoWorkflowProvider');
  return ctx;
}
