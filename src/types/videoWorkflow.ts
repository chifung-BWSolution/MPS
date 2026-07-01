import type { PlatformPublishMap } from '@/types/videoOutput';

export type VideoWorkflowStage = 'prep' | 'production' | 'review' | 'publish' | 'published';

export type StaffAssignment = {
  userId: string;
  displayName: string;
  scheduledAt?: string;
};

export type ModelAssignment = {
  talentId: string;
  displayName: string;
  scheduledAt?: string;
};

export type VideoWorkflowLocation = {
  sz?: boolean;
  hk?: boolean;
  notes?: string;
};

export type VideoWorkflowDeviceSuffix = 'D' | 'M' | null;

export type VideoWorkflowMock = {
  id: string;
  vchannelId?: string;
  vchannelCode: string;
  videoCode: string;
  title: string;
  deviceType?: VideoWorkflowDeviceSuffix;
  productionYear?: number;
  createdAt?: string;
  stage: VideoWorkflowStage;
  shootAt?: string;
  location: VideoWorkflowLocation;
  copywriting?: StaffAssignment;
  script?: StaffAssignment;
  model?: ModelAssignment;
  photographer?: StaffAssignment;
  onSiteCrew?: StaffAssignment[];
  rawFootageDone?: boolean;
  needsEditing?: boolean | null;
  demoDone?: boolean;
  storagePath?: string;
  reviewRejectReason?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  plannedPublishDate?: string;
  publishedDate?: string;
  platformPublish?: PlatformPublishMap;
};

export type VideoWorkflowUpdate = Partial<Omit<VideoWorkflowMock, 'id'>>;
