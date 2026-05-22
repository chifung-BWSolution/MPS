/**
 * Marketing Module Data — Unified data source for Marketing pages
 * Pulls from the same websiteDetailData used by Website tabs to enable data interconnection
 */
import { SocialPost, PaidAd, SeoKeyword, EdmCampaign, Video } from '@/types/app';
import {
  websiteVideos,
  websiteSocialPosts,
  websitePaidAds,
  websiteSeoKeywords,
  websiteEdmCampaigns,
} from '@/data/websiteDetailData';
import { websiteProfiles } from '@/data/websiteData';

// === Flatten all data for global Marketing views ===

export function getAllSocialPosts(): (SocialPost & { websiteName: string; company: string; brand: string })[] {
  const result: (SocialPost & { websiteName: string; company: string; brand: string })[] = [];
  for (const [wsId, posts] of Object.entries(websiteSocialPosts)) {
    const profile = websiteProfiles.find(p => p.id === wsId);
    for (const post of posts) {
      result.push({
        ...post,
        websiteName: profile?.websiteName || wsId,
        company: profile?.company || '',
        brand: profile?.brand || '',
      });
    }
  }
  return result;
}

export function getAllPaidAds(): (PaidAd & { websiteName: string; company: string; brand: string })[] {
  const result: (PaidAd & { websiteName: string; company: string; brand: string })[] = [];
  for (const [wsId, ads] of Object.entries(websitePaidAds)) {
    const profile = websiteProfiles.find(p => p.id === wsId);
    for (const ad of ads) {
      result.push({
        ...ad,
        websiteName: profile?.websiteName || wsId,
        company: profile?.company || '',
        brand: profile?.brand || '',
      });
    }
  }
  return result;
}

export function getAllSeoKeywords(): (SeoKeyword & { websiteName: string; company: string; brand: string })[] {
  const result: (SeoKeyword & { websiteName: string; company: string; brand: string })[] = [];
  for (const [wsId, keywords] of Object.entries(websiteSeoKeywords)) {
    const profile = websiteProfiles.find(p => p.id === wsId);
    for (const kw of keywords) {
      result.push({
        ...kw,
        websiteName: profile?.websiteName || wsId,
        company: profile?.company || '',
        brand: profile?.brand || '',
      });
    }
  }
  return result;
}

export function getAllEdmCampaigns(): (EdmCampaign & { websiteName: string; company: string; brand: string })[] {
  const result: (EdmCampaign & { websiteName: string; company: string; brand: string })[] = [];
  for (const [wsId, campaigns] of Object.entries(websiteEdmCampaigns)) {
    const profile = websiteProfiles.find(p => p.id === wsId);
    for (const campaign of campaigns) {
      result.push({
        ...campaign,
        websiteName: profile?.websiteName || wsId,
        company: profile?.company || '',
        brand: profile?.brand || '',
      });
    }
  }
  return result;
}

export function getAllVideos(): (Video & { websiteName: string; company: string; brand: string })[] {
  const result: (Video & { websiteName: string; company: string; brand: string })[] = [];
  for (const [wsId, videos] of Object.entries(websiteVideos)) {
    const profile = websiteProfiles.find(p => p.id === wsId);
    for (const video of videos) {
      result.push({
        ...video,
        websiteName: profile?.websiteName || wsId,
        company: profile?.company || '',
        brand: profile?.brand || '',
      });
    }
  }
  return result;
}

// === Marketing Calendar Events (derived from actual data) ===
export interface CalendarEvent {
  id: string;
  day: number;
  title: string;
  type: 'social' | 'edm' | 'article' | 'ads' | 'video' | 'seo';
  platform?: string;
  company: string;
  brand: string;
  websiteName: string;
  hours?: number;
  sourceId?: string;
}

export function getCalendarEventsForMonth(year: number, month: number): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  // Social posts with scheduled or published dates in target month
  getAllSocialPosts().forEach(post => {
    const dateStr = post.publishedDate || post.scheduledDate;
    if (!dateStr) return;
    const date = new Date(dateStr);
    if (date.getFullYear() === year && date.getMonth() === month) {
      events.push({
        id: `social-${post.id}`,
        day: date.getDate(),
        title: post.content?.substring(0, 30) + '...' || '社交帖文',
        type: 'social',
        platform: post.platform,
        company: post.company,
        brand: post.brand,
        websiteName: post.websiteName,
        hours: post.hoursSpent,
        sourceId: post.id,
      });
    }
  });

  // Paid ads with start dates in target month
  getAllPaidAds().forEach(ad => {
    if (!ad.startDate) return;
    const date = new Date(ad.startDate);
    if (date.getFullYear() === year && date.getMonth() === month) {
      events.push({
        id: `ad-${ad.id}`,
        day: date.getDate(),
        title: ad.campaignName,
        type: 'ads',
        platform: ad.platform,
        company: ad.company,
        brand: ad.brand,
        websiteName: ad.websiteName,
        sourceId: ad.id,
      });
    }
  });

  // EDM campaigns
  getAllEdmCampaigns().forEach(edm => {
    if (!edm.sendDate) return;
    const date = new Date(edm.sendDate);
    if (date.getFullYear() === year && date.getMonth() === month) {
      events.push({
        id: `edm-${edm.id}`,
        day: date.getDate(),
        title: edm.subject,
        type: 'edm',
        company: edm.company,
        brand: edm.brand,
        websiteName: edm.websiteName,
        hours: edm.hoursSpent,
        sourceId: edm.id,
      });
    }
  });

  // Videos
  getAllVideos().forEach(video => {
    const dateStr = video.publishDate || video.shootDate;
    if (!dateStr) return;
    const date = new Date(dateStr);
    if (date.getFullYear() === year && date.getMonth() === month) {
      events.push({
        id: `video-${video.id}`,
        day: date.getDate(),
        title: video.title || '影片',
        type: 'video',
        company: video.company,
        brand: video.brand,
        websiteName: video.websiteName,
        hours: video.editingHours,
        sourceId: video.id,
      });
    }
  });

  return events;
}
