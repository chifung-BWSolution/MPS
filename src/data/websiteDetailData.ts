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

// === Social Posts per website (模擬數據) ===
export const websiteSocialPosts: Record<string, (SocialPost & { __sampleData: true })[]> = {
  ws1: [
    { __sampleData: true, id: 'sp1', websiteProfileId: 'ws1', platform: 'facebook', platforms: ['facebook', 'instagram'], topic: '客戶案例', postType: 'image', content: '🎨 全新網站設計案例分享！看看我們如何為客戶打造現代感十足的企業官網。', scheduledDate: '2024-12-15T10:00:00', status: 'published', publishedDate: '2024-12-15', hoursSpent: 1.5, postUrl: 'https://fb.com/bwdesign/post1', engagementData: { likes: 45, comments: 8, shares: 12, reach: 2400, impressions: 3100 } },
    { __sampleData: true, id: 'sp2', websiteProfileId: 'ws1', platform: 'instagram', platforms: ['instagram', 'xiaohongshu'], topic: '教學內容', postType: 'carousel', content: '📱 響應式設計的 5 大秘訣！滑動查看完整攻略 →', scheduledDate: '2024-12-18T14:00:00', status: 'published', publishedDate: '2024-12-18', hoursSpent: 2, postUrl: 'https://instagram.com/bwdesign/p/1', engagementData: { likes: 128, comments: 15, shares: 32, reach: 4500, impressions: 5800 } },
    { __sampleData: true, id: 'sp3', websiteProfileId: 'ws1', platform: 'facebook', platforms: ['facebook', 'youtube'], topic: '教學內容', postType: 'video', content: '🎬 新影片上線！WordPress SEO 快速教學，5分鐘學會基礎設定。', scheduledDate: '2024-12-22T09:00:00', status: 'scheduled', hoursSpent: 1, engagementData: { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0 } },
    { __sampleData: true, id: 'sp4', websiteProfileId: 'ws1', platform: 'xiaohongshu', platforms: ['xiaohongshu'], topic: '行業趨勢', postType: 'image', content: '【小紅書獨家】2025年網站設計趨勢預測 🔮', scheduledDate: '2025-01-05T11:00:00', status: 'draft', hoursSpent: 0.5 },
  ],
  ws2: [
    { __sampleData: true, id: 'sp5', websiteProfileId: 'ws2', platform: 'linkedin', platforms: ['linkedin', 'facebook'], topic: '品牌形象', postType: 'image', content: 'ACI Global 助力企業數碼轉型，了解我們的全方位諮詢服務。', scheduledDate: '2024-12-20T08:00:00', status: 'published', publishedDate: '2024-12-20', hoursSpent: 1, postUrl: 'https://linkedin.com/aci/post1', engagementData: { likes: 67, comments: 5, shares: 18, reach: 3200, impressions: 4100 } },
    { __sampleData: true, id: 'sp6', websiteProfileId: 'ws2', platform: 'facebook', platforms: ['facebook', 'instagram', 'linkedin'], topic: '產品推廣', postType: 'image', content: '📊 企業品牌建設完整攻略即將上線！敬請期待。', scheduledDate: '2025-01-08T10:00:00', status: 'scheduled', hoursSpent: 0.5 },
  ],
  ws3: [
    { __sampleData: true, id: 'sp7', websiteProfileId: 'ws3', platform: 'instagram', platforms: ['instagram', 'tiktok', 'facebook'], topic: '教學內容', postType: 'reel', content: '🍷 30秒學會品酒！法國波爾多紅酒的品鑑技巧', scheduledDate: '2024-12-12T18:00:00', status: 'published', publishedDate: '2024-12-12', hoursSpent: 2.5, postUrl: 'https://instagram.com/fccmedia/reel/1', engagementData: { likes: 340, comments: 42, shares: 78, reach: 12000, impressions: 18000 } },
    { __sampleData: true, id: 'sp8', websiteProfileId: 'ws3', platform: 'xiaohongshu', platforms: ['xiaohongshu', 'instagram'], topic: '產品推廣', postType: 'carousel', content: '【紅酒入門】適合初學者的5款法國紅酒推薦 🇫🇷', scheduledDate: '2024-12-16T12:00:00', status: 'published', publishedDate: '2024-12-16', hoursSpent: 1.5, postUrl: '', engagementData: { likes: 520, comments: 65, shares: 120, reach: 15000, impressions: 22000 } },
  ],
  ws5: [
    { __sampleData: true, id: 'sp9', websiteProfileId: 'ws5', platform: 'facebook', platforms: ['facebook', 'instagram'], topic: '節日活動', postType: 'image', content: '🛒 聖誕限定紅酒禮盒套裝，立即選購！', scheduledDate: '2024-12-20T10:00:00', status: 'published', publishedDate: '2024-12-20', hoursSpent: 1, postUrl: 'https://fb.com/wineclubhk/post1', engagementData: { likes: 89, comments: 12, shares: 25, reach: 5600, impressions: 7200 } },
  ],
};

// === Paid Ads per website (模擬數據) ===
export const websitePaidAds: Record<string, (PaidAd & { __sampleData: true })[]> = {
  ws1: [
    { __sampleData: true, id: 'ad1', websiteProfileId: 'ws1', campaignName: 'BW Design 品牌搜尋廣告', platform: 'google_ads', adType: 'search', budget: 8000, actualSpend: 6500, currency: 'HKD', startDate: '2024-11-01', endDate: '2024-12-31', status: 'active', impressions: 45000, clicks: 1200, conversions: 35, cpc: 5.42, ctr: 2.67, roas: 4.2, creditCardId: 'cc1', notes: '' },
    { __sampleData: true, id: 'ad2', websiteProfileId: 'ws1', campaignName: 'FB 網頁設計服務推廣', platform: 'facebook', adType: 'social', budget: 5000, actualSpend: 4200, currency: 'HKD', startDate: '2024-12-01', endDate: '2025-01-31', status: 'active', impressions: 32000, clicks: 800, conversions: 18, cpc: 5.25, ctr: 2.5, roas: 3.5, creditCardId: 'cc1', notes: '' },
  ],
  ws2: [
    { __sampleData: true, id: 'ad3', websiteProfileId: 'ws2', campaignName: 'ACI 商務諮詢 Google Ads', platform: 'google_ads', adType: 'search', budget: 15000, actualSpend: 12800, currency: 'HKD', startDate: '2024-10-01', endDate: '2024-12-31', status: 'active', impressions: 68000, clicks: 2100, conversions: 52, cpc: 6.1, ctr: 3.09, roas: 5.1, creditCardId: 'cc2', notes: '高單價客戶' },
  ],
  ws3: [
    { __sampleData: true, id: 'ad4', websiteProfileId: 'ws3', campaignName: 'FCC 小紅書推廣', platform: 'xiaohongshu', adType: 'social', budget: 3000, actualSpend: 1800, currency: 'HKD', startDate: '2024-12-01', endDate: '2025-02-28', status: 'active', impressions: 25000, clicks: 650, conversions: 12, cpc: 2.77, ctr: 2.6, roas: 2.8, notes: '' },
  ],
  ws5: [
    { __sampleData: true, id: 'ad5', websiteProfileId: 'ws5', campaignName: 'Wine Club 聖誕推廣', platform: 'facebook', adType: 'social', budget: 6000, actualSpend: 5400, currency: 'HKD', startDate: '2024-12-01', endDate: '2024-12-31', status: 'completed', impressions: 42000, clicks: 1500, conversions: 45, cpc: 3.6, ctr: 3.57, roas: 6.2, creditCardId: 'cc1', notes: '效果非常好' },
  ],
};

// === SEO Keywords per website (real data via Supabase / GSC — no sample seeds) ===
export const websiteSeoKeywords: Record<string, (SeoKeyword & { __sampleData: true })[]> = {};

// === EDM Campaigns per website (模擬數據) ===
export const websiteEdmCampaigns: Record<string, (EdmCampaign & { __sampleData: true })[]> = {
  ws1: [
    { __sampleData: true, id: 'edm1', websiteProfileId: 'ws1', campaignType: 'email', subject: '【BW Design】12月電子報 — 最新設計趨勢', templateName: '月度電子報', recipientType: '全部訂閱者', recipientCount: 1200, sendDate: '2024-12-01', status: 'sent', hoursSpent: 2, openRate: 28.5, clickRate: 4.2 },
    { __sampleData: true, id: 'edm2', websiteProfileId: 'ws1', campaignType: 'email', subject: '【聖誕優惠】網站建設 8 折限時優惠', templateName: '促銷模板', recipientType: '潛在客戶', recipientCount: 800, sendDate: '2024-12-15', status: 'sent', hoursSpent: 1.5, openRate: 35.2, clickRate: 8.1 },
    { __sampleData: true, id: 'edm3', websiteProfileId: 'ws1', campaignType: 'email', subject: '【BW Design】1月電子報', templateName: '月度電子報', recipientType: '全部訂閱者', recipientCount: 1250, sendDate: '2025-01-01', status: 'scheduled', hoursSpent: 1 },
  ],
  ws2: [
    { __sampleData: true, id: 'edm4', websiteProfileId: 'ws2', campaignType: 'email', subject: 'ACI Insights: 2025 企業發展策略', templateName: 'Insights Newsletter', recipientType: '企業訂閱者', recipientCount: 650, sendDate: '2024-12-20', status: 'sent', hoursSpent: 3, openRate: 42.1, clickRate: 6.8 },
  ],
  ws5: [
    { __sampleData: true, id: 'edm5', websiteProfileId: 'ws5', campaignType: 'email', subject: '🍷 聖誕限定紅酒禮盒 — 最後機會！', templateName: '產品推廣', recipientType: '會員', recipientCount: 2100, sendDate: '2024-12-18', status: 'sent', hoursSpent: 2, openRate: 38.7, clickRate: 12.3 },
    { __sampleData: true, id: 'edm6', websiteProfileId: 'ws5', campaignType: 'sms', subject: '【Wine Club HK】新年特惠 — 全場 85 折', recipientType: 'VIP 會員', recipientCount: 450, sendDate: '2024-12-28', status: 'scheduled', hoursSpent: 0.5 },
  ],
};

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
