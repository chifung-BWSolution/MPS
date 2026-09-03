/**
 * Marketing Module Data — Unified data source for Marketing pages
 * Pulls from the same websiteDetailData used by Website tabs to enable data interconnection
 */
import { PaidAd, SeoKeyword, Video } from '@/types/app';
import {
  websiteVideos,
  websitePaidAds,
} from '@/data/websiteDetailData';
import { websiteProfiles } from '@/data/websiteData';

// === Flatten all data for global Marketing views ===

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

/** Sample SEO seeds cleared — real data loads via useSeoKeywords / Supabase. */
export function getAllSeoKeywords(): (SeoKeyword & { websiteName: string; company: string; brand: string })[] {
  return [];
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
  type: 'social' | 'edm' | 'article' | 'ads' | 'video' | 'seo' | 'backlink' | 'google_business';
  platform?: string;
  company: string;
  brand: string;
  websiteName: string;
  hours?: number;
  sourceId?: string;
  /** Live video_output fields for calendar chips */
  videoCode?: string;
  themeTitle?: string;
  /** 主號 | 小號 — inferred from title markers like（小號only） */
  accountKind?: 'main' | 'secondary';
  channelName?: string;
}

/** Parse theme + 主號/小號 from a video_output title. */
export function parseVideoCalendarTheme(input: {
  videoCode: string;
  title: string;
}): { theme: string; isSecondary: boolean } {
  const raw = input.title?.trim() || '';
  const isSecondary = /小號/.test(raw);
  let theme = raw;
  const code = input.videoCode?.trim();
  if (code && theme.toUpperCase().startsWith(code.toUpperCase())) {
    theme = theme.slice(code.length).trim().replace(/^[-–—:：\s]+/, '');
  }
  theme = theme
    .replace(/[（(]\s*小號\s*only\s*[）)]/gi, '')
    .replace(/[（(]\s*小號\s*[）)]/gi, '')
    .replace(/小號\s*only/gi, '')
    .trim();
  return { theme: theme || raw || code || '影片', isSecondary };
}

export function getCalendarEventsForMonth(year: number, month: number): CalendarEvent[] {
  const events: CalendarEvent[] = [];

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
