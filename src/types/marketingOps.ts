/** Marketing ops entities persisted in Supabase */

export interface WebPageSupplier {
  id: string;
  name: string;
  platform: string;
  url: string;
  cost: number;
  currency: 'USD' | 'HKD';
  rating: number;
  createdAt?: string;
}

export type BacklinkBrand = 'BW' | 'FC' | 'BSC' | 'Wine';

export const BACKLINK_BRANDS: BacklinkBrand[] = ['BW', 'FC', 'BSC', 'Wine'];

export interface BacklinkPurchase {
  id: string;
  websiteProfileId?: string;
  webSupplierId: string;
  costUsd: number;
  costHkd: number;
  brand?: BacklinkBrand;
  purchaseDate: string;
  quantity: number;
  notes?: string;
  googleAdsCustomerId?: string;
  googleAdsAccountName?: string;
  sourceDomain?: string;
  excelSheet?: string;
}

export interface GoogleBusinessRegistration {
  id: string;
  websiteProfileId?: string;
  url: string;
  registeredAt: string;
  content: string;
}

export type SocialPostStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export interface SocialPostRecord {
  id: string;
  websiteProfileId: string;
  platform: 'facebook' | 'instagram' | 'xiaohongshu' | 'linkedin' | 'youtube' | 'tiktok' | 'twitter' | 'other';
  platforms?: string[];
  topic?: string;
  postType: 'image' | 'video' | 'carousel' | 'story' | 'reel';
  content: string;
  mediaUrls?: string[];
  scheduledDate?: string;
  publishedDate?: string;
  publishTime?: string;
  status: SocialPostStatus;
  engagementData?: { likes: number; comments: number; shares: number; reach: number; impressions: number };
  authorId?: string;
  hoursSpent?: number;
  postUrl?: string;
  tags?: string[];
}

/** Final calendar date for a social post: published first, else scheduled */
export function socialPostFinalDate(post: Pick<SocialPostRecord, 'publishedDate' | 'scheduledDate'>): string | undefined {
  return post.publishedDate || post.scheduledDate || undefined;
}
