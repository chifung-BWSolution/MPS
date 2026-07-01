export type VideoProjectCategory = 'internal' | 'client';

export type VideoOutputStatus = 'pending' | 'in_production' | 'demo_done' | 'published';

export type PlatformPublishKey =
  | 'youtube'
  | 'instagram'
  | 'facebook'
  | 'threads'
  | 'xiaohongshu'
  | 'douyin'
  | 'wechat_channels'
  | 'wechat_official'
  | 'zh_cn'
  | 'zh_tw';

export type PlatformPublishMap = Partial<Record<PlatformPublishKey, boolean>>;

export interface VideoOutput {
  id: string;
  vchannelId: string;
  channelCode: string;
  channelPublicName?: string;
  productionYear?: number;
  videoCode: string;
  title: string;
  asanaTaskId?: string;
  asanaUrl?: string;
  shootSz: boolean;
  shootHk: boolean;
  rawFootageDone: boolean;
  needsEditing?: boolean | null;
  demoDone: boolean;
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
  asanaTaskId?: string;
  asanaUrl?: string;
  shootSz?: boolean;
  shootHk?: boolean;
  rawFootageDone?: boolean;
  needsEditing?: boolean | null;
  demoDone?: boolean;
  shootAt?: string;
  plannedPublishDate?: string;
  publishedDate?: string;
  platformPublish?: PlatformPublishMap;
  storagePath?: string;
  projectCategory?: VideoProjectCategory;
  notes?: string;
}
