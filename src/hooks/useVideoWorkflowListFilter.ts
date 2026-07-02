import { useMemo, useState } from 'react';
import { useVchannels } from '@/hooks/useVchannels';
import {
  buildProductionYearOptions,
  getCurrentProductionYear,
} from '@/lib/videoOutputUtils';
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
  const [yearFilter, setYearFilter] = useState(getCurrentProductionYear);

  const yearOptions = useMemo(
    () => buildProductionYearOptions(videos.map(v => v.productionYear)),
    [videos],
  );

  const filteredVideos = useMemo(() => {
    const filtered = filterWorkflowVideos(
      videos,
      searchQuery,
      vchannelFilter,
      channels,
      yearFilter,
    );
    return sortWorkflowVideosNewestFirst(filtered, sortMode);
  }, [videos, searchQuery, vchannelFilter, channels, yearFilter, sortMode]);

  return {
    channels,
    vchannelFilter,
    setVchannelFilter,
    searchQuery,
    setSearchQuery,
    yearFilter,
    setYearFilter,
    yearOptions,
    filteredVideos,
  };
}
