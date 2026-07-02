import { useMemo, useState } from 'react';
import { useVchannels } from '@/hooks/useVchannels';
import {
  filterWorkflowVideos,
  sortWorkflowVideosNewestFirst,
  type WorkflowListSortMode,
} from '@/lib/videoWorkflowUtils';
import type { VideoWorkflowMock } from '@/types/videoWorkflow';

export function useVideoWorkflowListFilter(
  videos: VideoWorkflowMock[],
  sortMode: WorkflowListSortMode = 'createdAt',
) {
  const { channels } = useVchannels();
  const [vchannelFilter, setVchannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredVideos = useMemo(() => {
    const filtered = filterWorkflowVideos(videos, searchQuery, vchannelFilter, channels);
    return sortWorkflowVideosNewestFirst(filtered, sortMode);
  }, [videos, searchQuery, vchannelFilter, channels, sortMode]);

  return {
    channels,
    vchannelFilter,
    setVchannelFilter,
    searchQuery,
    setSearchQuery,
    filteredVideos,
  };
}
