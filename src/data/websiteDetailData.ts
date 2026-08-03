/**
 * ============================================================
 * Website Detail Data — Videos, Social Posts, Ads, SEO, EDM, Plugins
 * ============================================================
 * ⚠️ 所有記錄帶有 __sampleData: true 標記
 * ⚠️ 清除方法: 使用 isSampleData() 判斷
 * ============================================================
 */
import { SocialPost, PaidAd, SeoKeyword, EdmCampaign, Video } from '@/types/app';

// === Videos per website (模擬數據 — all records have __sampleData: true) ===
export const websiteVideos: Record<string, (Video & { __sampleData: true })[]> = {
  ws1: [
    { __sampleData: true, id: 'v1', websiteProfileId: 'ws1', title: 'BW Design 品牌宣傳片', videoType: 'promo', status: 'published', shootDate: '2024-11-01', publishDate: '2024-11-15', durationSeconds: 120, editorId: 'u2', editingHours: 8, platforms: [{ platform: 'YouTube', url: 'https://youtube.com/watch?v=bw1', views: 3200, status: 'uploaded' }], notes: '公司形象宣傳' },
    { __sampleData: true, id: 'v2', websiteProfileId: 'ws1', title: '網頁設計流程教學', videoType: 'tutorial', status: 'completed', shootDate: '2024-11-20', durationSeconds: 480, editorId: 'u2', editingHours: 12, platforms: [{ platform: 'YouTube', url: 'https://youtube.com/watch?v=bw2', views: 1800, status: 'uploaded' }], notes: '' },
    { __sampleData: true, id: 'v3', websiteProfileId: 'ws1', title: '客戶見證 — ABC Corp', videoType: 'testimonial', status: 'post_production', shootDate: '2024-12-05', durationSeconds: 60, editorId: 'u4', editingHours: 4, notes: '剪輯中' },
    { __sampleData: true, id: 'v4', websiteProfileId: 'ws1', title: 'WordPress SEO 快速教學', videoType: 'tutorial', status: 'planning', notes: '已排期拍攝' },
  ],
  ws2: [
    { __sampleData: true, id: 'v5', websiteProfileId: 'ws2', title: 'ACI 商務諮詢服務介紹', videoType: 'promo', status: 'published', shootDate: '2024-09-10', publishDate: '2024-09-25', durationSeconds: 90, editorId: 'u4', editingHours: 6, platforms: [{ platform: 'YouTube', url: 'https://youtube.com/watch?v=aci1', views: 2400, status: 'uploaded' }], notes: '' },
    { __sampleData: true, id: 'v6', websiteProfileId: 'ws2', title: '企業數碼轉型案例', videoType: 'event', status: 'shooting', shootDate: '2024-12-10', editorId: 'u2', editingHours: 0, notes: '拍攝中' },
  ],
  ws3: [
    { __sampleData: true, id: 'v7', websiteProfileId: 'ws3', title: '紅酒品鑑系列 Ep.1', videoType: 'tutorial', status: 'published', shootDate: '2024-10-05', publishDate: '2024-10-20', durationSeconds: 600, editorId: 'u5', editingHours: 10, platforms: [{ platform: 'YouTube', url: 'https://youtube.com/watch?v=fcc1', views: 5600, status: 'uploaded' }, { platform: 'Instagram', url: '', views: 1200, status: 'uploaded' }], notes: '' },
    { __sampleData: true, id: 'v8', websiteProfileId: 'ws3', title: '紅酒品鑑系列 Ep.2', videoType: 'tutorial', status: 'published', shootDate: '2024-10-20', publishDate: '2024-11-05', durationSeconds: 540, editorId: 'u5', editingHours: 9, platforms: [{ platform: 'YouTube', url: 'https://youtube.com/watch?v=fcc2', views: 4300, status: 'uploaded' }], notes: '' },
    { __sampleData: true, id: 'v9', websiteProfileId: 'ws3', title: '紅酒品鑑系列 Ep.3', videoType: 'tutorial', status: 'post_production', shootDate: '2024-11-15', durationSeconds: 480, editorId: 'u5', editingHours: 5, notes: '後期製作中' },
  ],
  ws5: [
    { __sampleData: true, id: 'v10', websiteProfileId: 'ws5', title: 'Wine Club 開箱影片', videoType: 'social_clip', status: 'published', shootDate: '2024-11-01', publishDate: '2024-11-10', durationSeconds: 45, editorId: 'u5', editingHours: 2, platforms: [{ platform: 'Instagram', url: '', views: 2100, status: 'uploaded' }], notes: '' },
  ],
};

// === Social Posts — live data lives in Supabase `social_posts` ===
export const websiteSocialPosts: Record<string, (SocialPost & { __sampleData: true })[]> = {};

// === Paid Ads — live data lives in Supabase `paid_ads` ===
export const websitePaidAds: Record<string, (PaidAd & { __sampleData: true })[]> = {};

// === SEO Keywords — live data lives in Supabase `seo_keywords` ===
export const websiteSeoKeywords: Record<string, (SeoKeyword & { __sampleData: true })[]> = {};

// === EDM Campaigns — live data lives in Supabase `edm_campaigns` ===
export const websiteEdmCampaigns: Record<string, (EdmCampaign & { __sampleData: true })[]> = {};

// === Plugins per website ===
export interface Plugin {
  id: string;
  websiteProfileId: string;
  pluginName: string;
  description?: string;
  cost: number;
  currency: 'HKD' | 'USD' | 'CNY';
  billingCycle: 'monthly' | 'annual' | 'one_time' | 'lifetime';
  expiryDate?: string;
  status: 'active' | 'expired' | 'cancelled';
  autoRenew: boolean;
  notes?: string;
}

export const websitePlugins: Record<string, Plugin[]> = {
  ws1: [
    { id: 'pl1', websiteProfileId: 'ws1', pluginName: 'Yoast SEO Premium', description: 'WordPress SEO 插件', cost: 99, currency: 'USD', billingCycle: 'annual', expiryDate: '2025-06-15', status: 'active', autoRenew: true },
    { id: 'pl2', websiteProfileId: 'ws1', pluginName: 'WP Rocket', description: '網站加速快取插件', cost: 59, currency: 'USD', billingCycle: 'annual', expiryDate: '2025-03-20', status: 'active', autoRenew: true },
    { id: 'pl3', websiteProfileId: 'ws1', pluginName: 'Elementor Pro', description: '頁面編輯器', cost: 199, currency: 'USD', billingCycle: 'annual', expiryDate: '2025-01-10', status: 'active', autoRenew: true, notes: '即將到期' },
    { id: 'pl4', websiteProfileId: 'ws1', pluginName: 'Wordfence Security', description: '安全防護', cost: 119, currency: 'USD', billingCycle: 'annual', expiryDate: '2025-08-01', status: 'active', autoRenew: true },
    { id: 'pl5', websiteProfileId: 'ws1', pluginName: 'Google Analytics 4', description: '流量追蹤', cost: 0, currency: 'USD', billingCycle: 'lifetime', status: 'active', autoRenew: false },
    { id: 'pl6', websiteProfileId: 'ws1', pluginName: 'Mailchimp Integration', description: '電郵營銷整合', cost: 20, currency: 'USD', billingCycle: 'monthly', expiryDate: '2025-01-15', status: 'active', autoRenew: true },
  ],
  ws2: [
    { id: 'pl7', websiteProfileId: 'ws2', pluginName: 'Hotjar', description: '用戶行為追蹤', cost: 39, currency: 'USD', billingCycle: 'monthly', expiryDate: '2025-01-20', status: 'active', autoRenew: true },
    { id: 'pl8', websiteProfileId: 'ws2', pluginName: 'Cloudflare CDN', description: 'CDN 加速', cost: 20, currency: 'USD', billingCycle: 'monthly', status: 'active', autoRenew: true },
    { id: 'pl9', websiteProfileId: 'ws2', pluginName: 'SEMrush', description: 'SEO 工具', cost: 129, currency: 'USD', billingCycle: 'monthly', expiryDate: '2025-01-25', status: 'active', autoRenew: true },
  ],
  ws3: [
    { id: 'pl10', websiteProfileId: 'ws3', pluginName: 'Yoast SEO', description: 'WordPress SEO', cost: 0, currency: 'USD', billingCycle: 'lifetime', status: 'active', autoRenew: false },
    { id: 'pl11', websiteProfileId: 'ws3', pluginName: 'WPML', description: '多語言插件', cost: 79, currency: 'USD', billingCycle: 'annual', expiryDate: '2024-12-30', status: 'active', autoRenew: true, notes: '即將到期！' },
    { id: 'pl12', websiteProfileId: 'ws3', pluginName: 'Contact Form 7', description: '聯絡表單', cost: 0, currency: 'USD', billingCycle: 'lifetime', status: 'active', autoRenew: false },
  ],
  ws5: [
    { id: 'pl13', websiteProfileId: 'ws5', pluginName: 'Shopify POS', description: '銷售系統', cost: 89, currency: 'USD', billingCycle: 'monthly', status: 'active', autoRenew: true },
    { id: 'pl14', websiteProfileId: 'ws5', pluginName: 'Klaviyo', description: '電郵行銷自動化', cost: 45, currency: 'USD', billingCycle: 'monthly', status: 'active', autoRenew: true },
    { id: 'pl15', websiteProfileId: 'ws5', pluginName: 'Judge.me', description: '產品評價', cost: 15, currency: 'USD', billingCycle: 'monthly', status: 'active', autoRenew: true },
    { id: 'pl16', websiteProfileId: 'ws5', pluginName: 'ReConvert', description: '結帳頁優化', cost: 7.99, currency: 'USD', billingCycle: 'monthly', expiryDate: '2024-12-25', status: 'expired', autoRenew: false, notes: '已過期' },
  ],
};

// === External Links per website (enhanced with types) ===
export interface ExternalLink {
  id: string;
  websiteProfileId: string;
  label: string;
  url: string;
  linkType: 'figma' | 'github' | 'staging' | 'dev' | 'analytics' | 'cms' | 'documentation' | 'other';
}

export const websiteExternalLinks: Record<string, ExternalLink[]> = {
  ws1: [
    { id: 'el1', websiteProfileId: 'ws1', label: 'Figma 設計稿', url: 'https://figma.com/file/bw-design', linkType: 'figma' },
    { id: 'el2', websiteProfileId: 'ws1', label: 'GitHub Repo', url: 'https://github.com/bw-design', linkType: 'github' },
    { id: 'el3', websiteProfileId: 'ws1', label: 'Staging 環境', url: 'https://staging.bwdesign.com.hk', linkType: 'staging' },
    { id: 'el4', websiteProfileId: 'ws1', label: 'GA4 Dashboard', url: 'https://analytics.google.com/bw', linkType: 'analytics' },
    { id: 'el5', websiteProfileId: 'ws1', label: 'WordPress Admin', url: 'https://www.bwdesign.com.hk/wp-admin', linkType: 'cms' },
  ],
  ws2: [
    { id: 'el6', websiteProfileId: 'ws2', label: 'Staging', url: 'https://staging.aciglobal.com', linkType: 'staging' },
    { id: 'el7', websiteProfileId: 'ws2', label: 'GitHub', url: 'https://github.com/aci-global', linkType: 'github' },
    { id: 'el8', websiteProfileId: 'ws2', label: 'GA4 Dashboard', url: 'https://analytics.google.com/aci', linkType: 'analytics' },
  ],
  ws3: [
    { id: 'el9', websiteProfileId: 'ws3', label: 'Figma 設計稿', url: 'https://figma.com/file/fcc-media', linkType: 'figma' },
    { id: 'el10', websiteProfileId: 'ws3', label: 'Dev URL', url: 'https://dev.fccmedia.hk', linkType: 'dev' },
    { id: 'el11', websiteProfileId: 'ws3', label: '開發文檔', url: 'https://docs.fccmedia.hk', linkType: 'documentation' },
  ],
  ws5: [
    { id: 'el12', websiteProfileId: 'ws5', label: 'Shopify Admin', url: 'https://admin.shopify.com/wineclubhk', linkType: 'cms' },
    { id: 'el13', websiteProfileId: 'ws5', label: 'GA4 Dashboard', url: 'https://analytics.google.com/wchk', linkType: 'analytics' },
  ],
};

// Helper functions
export function getVideosForWebsite(websiteId: string): Video[] {
  return websiteVideos[websiteId] || [];
}

export function getSocialPostsForWebsite(websiteId: string): SocialPost[] {
  return websiteSocialPosts[websiteId] || [];
}

export function getPaidAdsForWebsite(websiteId: string): PaidAd[] {
  return websitePaidAds[websiteId] || [];
}

export function getSeoKeywordsForWebsite(websiteId: string): SeoKeyword[] {
  return websiteSeoKeywords[websiteId] || [];
}

export function getEdmCampaignsForWebsite(websiteId: string): EdmCampaign[] {
  return websiteEdmCampaigns[websiteId] || [];
}

export function getPluginsForWebsite(websiteId: string): Plugin[] {
  return websitePlugins[websiteId] || [];
}

export function getExternalLinksForWebsite(websiteId: string): ExternalLink[] {
  return websiteExternalLinks[websiteId] || [];
}
