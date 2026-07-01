import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { VIDEO_WORKFLOW_MOCK_SEED } from '@/data/videoWorkflowMock';
import { getPrepMissingItems, isPrepComplete } from '@/lib/videoWorkflowUtils';
import type { VideoWorkflowMock, VideoWorkflowStage, VideoWorkflowUpdate } from '@/types/videoWorkflow';

const STORAGE_KEY = 'mps_video_workflow_mock_v1';

type VideoWorkflowContextValue = {
  videos: VideoWorkflowMock[];
  getById: (id: string) => VideoWorkflowMock | undefined;
  getByStage: (stage: VideoWorkflowStage) => VideoWorkflowMock[];
  updateVideo: (id: string, patch: VideoWorkflowUpdate) => void;
  advanceToProduction: (id: string) => string | null;
  submitForReview: (id: string) => void;
  approveReview: (id: string, reviewedBy: string) => void;
  rejectReview: (id: string, reason: string, reviewedBy: string) => void;
  completePublish: (id: string, patch: VideoWorkflowUpdate) => void;
  resetToSeed: () => void;
};

const VideoWorkflowContext = createContext<VideoWorkflowContextValue | null>(null);

function loadInitialVideos(): VideoWorkflowMock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as VideoWorkflowMock[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore corrupt storage
  }
  return VIDEO_WORKFLOW_MOCK_SEED.map(v => ({ ...v, onSiteCrew: v.onSiteCrew ? [...v.onSiteCrew] : undefined }));
}

export function VideoWorkflowProvider({ children }: { children: ReactNode }) {
  const [videos, setVideos] = useState<VideoWorkflowMock[]>(loadInitialVideos);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
  }, [videos]);

  const getById = useCallback((id: string) => videos.find(v => v.id === id), [videos]);

  const getByStage = useCallback(
    (stage: VideoWorkflowStage) => videos.filter(v => v.stage === stage),
    [videos],
  );

  const updateVideo = useCallback((id: string, patch: VideoWorkflowUpdate) => {
    setVideos(prev =>
      prev.map(v => {
        if (v.id !== id) return v;
        const next = { ...v, ...patch };
        if (patch.location) next.location = { ...v.location, ...patch.location };
        if (patch.onSiteCrew) next.onSiteCrew = patch.onSiteCrew;
        if (patch.platformPublish) next.platformPublish = { ...v.platformPublish, ...patch.platformPublish };
        return next;
      }),
    );
  }, []);

  const advanceToProduction = useCallback((id: string): string | null => {
    const video = videos.find(v => v.id === id);
    if (!video) return '找不到影片';
    if (video.stage !== 'prep') return '僅準備中的影片可進入製作';
    if (!isPrepComplete(video)) {
      return `尚有未完成的準備項：${getPrepMissingItems(video).join('、')}`;
    }
    updateVideo(id, { stage: 'production', reviewRejectReason: undefined });
    return null;
  }, [videos, updateVideo]);

  const submitForReview = useCallback((id: string) => {
    updateVideo(id, { stage: 'review', reviewRejectReason: undefined });
  }, [updateVideo]);

  const approveReview = useCallback((id: string, reviewedBy: string) => {
    updateVideo(id, {
      stage: 'publish',
      reviewedAt: new Date().toISOString(),
      reviewedBy,
      reviewRejectReason: undefined,
    });
  }, [updateVideo]);

  const rejectReview = useCallback((id: string, reason: string, reviewedBy: string) => {
    updateVideo(id, {
      stage: 'production',
      reviewRejectReason: reason.trim(),
      reviewedAt: new Date().toISOString(),
      reviewedBy,
    });
  }, [updateVideo]);

  const completePublish = useCallback((id: string, patch: VideoWorkflowUpdate) => {
    updateVideo(id, { ...patch, stage: 'published' });
  }, [updateVideo]);

  const resetToSeed = useCallback(() => {
    setVideos(VIDEO_WORKFLOW_MOCK_SEED.map(v => ({ ...v, onSiteCrew: v.onSiteCrew ? [...v.onSiteCrew] : undefined })));
  }, []);

  const value = useMemo(
    () => ({
      videos,
      getById,
      getByStage,
      updateVideo,
      advanceToProduction,
      submitForReview,
      approveReview,
      rejectReview,
      completePublish,
      resetToSeed,
    }),
    [
      videos,
      getById,
      getByStage,
      updateVideo,
      advanceToProduction,
      submitForReview,
      approveReview,
      rejectReview,
      completePublish,
      resetToSeed,
    ],
  );

  return <VideoWorkflowContext.Provider value={value}>{children}</VideoWorkflowContext.Provider>;
}

export function useVideoWorkflow() {
  const ctx = useContext(VideoWorkflowContext);
  if (!ctx) throw new Error('useVideoWorkflow must be used within VideoWorkflowProvider');
  return ctx;
}
