import type { VideoOutputWorkflowFields } from '@/types/videoOutputWorkflow';

export type VideoProjectCategory = 'internal' | 'client';

export type VideoOutputStatus =
  | 'pending'
  | 'in_production'
  | 'pending_publish'
  | 'published'
  | 'delisted';

export type PlatformPublishKey =
  | 'youtube'
  | 'instagram'
  | 'facebook'
  | 'threads'
  | 'linkedin'
  | 'xiaohongshu'
  | 'douyin'
  | 'wechat_channels'
  | 'wechat_official';

/**
 * URL entry. `url` is the first link so older readers still see a publish.
 * `urls` holds every link when the platform has more than one.
 * Legacy rows may still store `true` (published without a URL).
 */
export type PlatformPublishEntry = boolean | { url?: string; urls?: string[] };

export type PlatformPublishMap = Partial<Record<PlatformPublishKey, PlatformPublishEntry>>;

export interface VideoOutput extends VideoOutputWorkflowFields {
  id: string;
  vchannelId: string;
  channelCode: string;
  channelPublicName?: string;
  productionYear?: number;
  videoCode: string;
  title: string;
  asanaUrl?: string;
  shootSz: boolean;
  shootHk: boolean;
  rawFootageDone: boolean;
  needsEditing?: boolean | null;
  demoDone: boolean;
  subtitleDone: boolean;
  reviewed: boolean;
  shootAt?: string;
  plannedPublishDate?: string;
  publishedDate?: string;
  platformPublish: PlatformPublishMap;
  storagePath?: string;
  projectCategory: VideoProjectCategory;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VideoOutputInput {
  vchannelId: string;
  productionYear?: number;
  videoCode: string;
  title: string;
  asanaUrl?: string;
  shootSz?: boolean;
  shootHk?: boolean;
  rawFootageDone?: boolean;
  needsEditing?: boolean | null;
  demoDone?: boolean;
  subtitleDone?: boolean;
  reviewed?: boolean;
  shootAt?: string;
  plannedPublishDate?: string;
  publishedDate?: string;
  platformPublish?: PlatformPublishMap;
  storagePath?: string;
  projectCategory?: VideoProjectCategory;
  notes?: string;
  workflowStage?: VideoOutput['workflowStage'];
  prepAssignments?: VideoOutput['prepAssignments'];
  productionProgress?: VideoOutput['productionProgress'];
  locationNotes?: string;
  reviewRejectReason?: string;
  submittedForReviewAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}
