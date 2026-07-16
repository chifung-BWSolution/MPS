import type { PlatformPublishMap } from '@/types/videoOutput';
import type { VideoOutputWorkflowFields } from '@/types/videoOutputWorkflow';

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

export type ProductionTask = {
  done: boolean;
  hours?: number;
};

export type FootageMode = 'shoot' | 'ai' | null;

export type ProductionProgress = {
  copywriting: ProductionTask;
  script: ProductionTask;
  rawFootage: ProductionTask;
  editing: ProductionTask;
  demo: ProductionTask;
  footageMode: FootageMode;
  editingMode: boolean | null;
};

export type ProductionTaskKey = 'copywriting' | 'script' | 'rawFootage' | 'editing' | 'demo';

export type VideoWorkflowMock = {
  id: string;
  vchannelId?: string;
  vchannelCode: string;
  vchannelPublicName?: string;
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
  productionProgress?: ProductionProgress;
  rawFootageDone?: boolean;
  needsEditing?: boolean | null;
  demoDone?: boolean;
  storagePath?: string;
  submittedForReviewAt?: string;
  reviewRejectReason?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  adminReviewPassed?: boolean;
  adminReviewedAt?: string;
  adminReviewedBy?: string;
  plannedPublishDate?: string;
  publishedDate?: string;
  publishHours?: number;
  platformPublish?: PlatformPublishMap;
};

export type VideoWorkflowUpdate = Partial<Omit<VideoWorkflowMock, 'id'>>;
