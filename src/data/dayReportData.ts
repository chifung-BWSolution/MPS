/**
 * ============================================================
 * Day Report Module Data — Enhanced outcome-oriented work reporting
 * ============================================================
 * ⚠️ 所有記錄帶有 __sampleData: true 標記
 * ⚠️ 清除方法: 使用 isSampleData() 判斷
 * ============================================================
 */
import { websiteProfiles } from '@/data/websiteData';
import { projects, companies, brands } from '@/data/mockData';

// === Types ===
export type WorkModule = 'website' | 'marketing' | 'video' | 'training' | 'company_event' | 'internal_meeting' | 'client_meeting' | 'project_meeting' | 'other';
export type OutcomeType = 'url' | 'image' | 'growth_experience';
export type ReportStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface WorkEntry {
  id: string;
  dailyReportId: string;
  module: WorkModule;
  relatedId?: string; // website_id / video_id etc.
  relatedName?: string;
  title: string;
  description: string;
  hours: number;
  outcomeType: OutcomeType;
  outcomeValue: string;
  createdAt: string;
}

export interface DailyReport {
  id: string;
  userId: string;
  userName: string;
  reportDate: string;
  totalHours: number;
  status: ReportStatus;
  isLeave: boolean;
  isHalfDay: boolean;
  leaveType?: string;
  entries: WorkEntry[];
  submittedAt?: string;
  reviewedAt?: string;
  reviewerId?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  department: string;
  avatar?: string;
}

// === Staff Data (模擬數據) ===
export const staffMembers: (StaffMember & { __sampleData: true })[] = [
  { __sampleData: true, id: 'u1', name: '陳小華', role: 'project_manager', department: '項目管理' },
  { __sampleData: true, id: 'u2', name: '王志明', role: 'designer', department: '設計部' },
  { __sampleData: true, id: 'u3', name: '戴維斯', role: 'project_manager', department: '項目管理' },
  { __sampleData: true, id: 'u4', name: '李芳', role: 'designer', department: '設計部' },
  { __sampleData: true, id: 'u5', name: '朴賢俊', role: 'video_editor', department: '影片部' },
  { __sampleData: true, id: 'u6', name: '張偉明', role: 'management', department: '管理層' },
  { __sampleData: true, id: 'u7', name: '林美玲', role: 'copywriter', department: '文案部' },
  { __sampleData: true, id: 'u8', name: '黃大偉', role: 'marketing', department: '行銷部' },
];

// Module display config
export const moduleConfig: Record<WorkModule, { label: string; color: string; bg: string; icon: string }> = {
  website: { label: '網站管理', color: 'text-blue-700', bg: 'bg-blue-100', icon: '🌐' },
  marketing: { label: '行銷管理', color: 'text-pink-700', bg: 'bg-pink-100', icon: '📢' },
  video: { label: '影片製作', color: 'text-purple-700', bg: 'bg-purple-100', icon: '🎬' },
  training: { label: '參加培訓', color: 'text-yellow-700', bg: 'bg-yellow-100', icon: '📚' },
  company_event: { label: '公司活動', color: 'text-teal-700', bg: 'bg-teal-100', icon: '🎉' },
  internal_meeting: { label: '內部會議', color: 'text-cyan-700', bg: 'bg-cyan-100', icon: '💼' },
  client_meeting: { label: '客人會議', color: 'text-indigo-700', bg: 'bg-indigo-100', icon: '🤝' },
  project_meeting: { label: '項目會議', color: 'text-orange-700', bg: 'bg-orange-100', icon: '📊' },
  other: { label: '其他工作', color: 'text-gray-700', bg: 'bg-gray-100', icon: '📋' },
};

export const outcomeTypeConfig: Record<OutcomeType, { label: string; icon: string; placeholder: string }> = {
  url: { label: '網址連結', icon: '🔗', placeholder: '輸入完成成果的URL...' },
  image: { label: '已完成圖片', icon: '🖼️', placeholder: '輸入已完成圖片連結...' },
  growth_experience: { label: '成長經驗', icon: '🌱', placeholder: '描述對公司進步的成長經驗...' },
};

// === Mock Daily Reports (模擬數據) ===
export const dailyReports: (DailyReport & { __sampleData: true })[] = [
  {
    __sampleData: true,
    id: 'dr1',
    userId: 'u1',
    userName: '陳小華',
    reportDate: '2025-01-20',
    totalHours: 8.5,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    submittedAt: '2025-01-20T18:30:00',
    reviewedAt: '2025-01-21T09:00:00',
    entries: [
      { id: 'we1', dailyReportId: 'dr1', module: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: '首頁改版設計', description: '完成首頁 Hero Section 重新設計，包含動態輪播與 CTA 按鈕優化', hours: 3.5, outcomeType: 'url', outcomeValue: 'https://staging.bwdesign.com.hk/homepage-v2', createdAt: '2025-01-20T10:00:00' },
      { id: 'we2', dailyReportId: 'dr1', module: 'marketing', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'SEO 文章撰寫', description: '完成「2025年網頁設計趨勢」文章 2000字，優化關鍵字密度', hours: 2.5, outcomeType: 'url', outcomeValue: 'https://bwdesign.com.hk/blog/web-design-trends-2025', createdAt: '2025-01-20T14:00:00' },
      { id: 'we4', dailyReportId: 'dr1', module: 'training', title: 'Figma 進階功能學習', description: '學習 Figma Auto Layout 及 Component Variants 進階使用方法', hours: 1.0, outcomeType: 'growth_experience', outcomeValue: '掌握了 Auto Layout 嵌套技巧，未來可節省 30% 排版時間', createdAt: '2025-01-20T17:30:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr2',
    userId: 'u3',
    userName: '戴維斯',
    reportDate: '2025-01-20',
    totalHours: 9.0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    submittedAt: '2025-01-20T19:00:00',
    entries: [
      { id: 'we5', dailyReportId: 'dr2', module: 'website', relatedId: 'ws2', relatedName: 'ACI Global', title: 'ACI 網站功能開發', description: '完成客戶管理後台的表單驗證及數據提交功能', hours: 4.0, outcomeType: 'url', outcomeValue: 'https://staging.aciglobal.com/admin/clients', createdAt: '2025-01-20T10:00:00' },
      { id: 'we6', dailyReportId: 'dr2', module: 'project_meeting', title: 'ACI 項目進度會議', description: '討論 ACI 網站開發進度及里程碑確認', hours: 1.5, outcomeType: 'growth_experience', outcomeValue: '確認了 Q1 重點項目排序，協助團隊理清任務依賴關係', createdAt: '2025-01-20T14:30:00' },
      { id: 'we7', dailyReportId: 'dr2', module: 'video', relatedId: 'ws3', relatedName: 'FCC Media', title: 'FCC 品酒會拍攝腳本', description: '撰寫品酒會活動宣傳影片腳本及鏡頭分鏡', hours: 2.0, outcomeType: 'url', outcomeValue: 'https://docs.google.com/document/d/fcc-script-v1', createdAt: '2025-01-20T16:00:00' },
      { id: 'we8', dailyReportId: 'dr2', module: 'marketing', relatedId: 'ws2', relatedName: 'ACI Global', title: 'ACI 社媒內容發布', description: '製作並發佈 3 篇 Instagram Story 及 1 篇 FB Post', hours: 1.5, outcomeType: 'image', outcomeValue: 'https://drive.google.com/aci-social-jan20', createdAt: '2025-01-20T18:00:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr3',
    userId: 'u5',
    userName: '朴賢俊',
    reportDate: '2025-01-20',
    totalHours: 10.0,
    status: 'submitted',
    isLeave: false,
    isHalfDay: false,
    submittedAt: '2025-01-20T20:00:00',
    entries: [
      { id: 'we9', dailyReportId: 'dr3', module: 'video', relatedId: 'ws3', relatedName: 'FCC Media', title: 'FCC 影片剪輯', description: '剪輯品酒會花絮影片第3集，完成調色及字幕', hours: 5.0, outcomeType: 'url', outcomeValue: 'https://vimeo.com/fcc-ep3-draft', createdAt: '2025-01-20T10:00:00' },
      { id: 'we10', dailyReportId: 'dr3', module: 'video', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 企業影片', description: '拍攝 BW 辦公室環境及團隊介紹片段', hours: 3.0, outcomeType: 'image', outcomeValue: 'https://drive.google.com/bw-video-raw-jan20', createdAt: '2025-01-20T15:00:00' },
      { id: 'we11', dailyReportId: 'dr3', module: 'training', title: 'DaVinci Resolve 調色', description: '觀看 YouTube 教學影片學習高級調色工具 Color Page 操作', hours: 2.0, outcomeType: 'growth_experience', outcomeValue: '學會使用 Qualifier 工具精確選取膚色範圍並進行美化調整', createdAt: '2025-01-20T19:00:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr4',
    userId: 'u2',
    userName: '王志明',
    reportDate: '2025-01-20',
    totalHours: 8.0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    submittedAt: '2025-01-20T18:00:00',
    entries: [
      { id: 'we12', dailyReportId: 'dr4', module: 'website', relatedId: 'ws4', relatedName: 'BSC Tech Solutions', title: 'BSC 前端開發', description: '完成服務列表頁面響應式設計及交互動畫', hours: 4.0, outcomeType: 'url', outcomeValue: 'https://staging.bsctech.com/services', createdAt: '2025-01-20T10:00:00' },
      { id: 'we13', dailyReportId: 'dr4', module: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 網站 Bug 修復', description: '修復手機版選單切換動畫卡頓問題', hours: 2.0, outcomeType: 'url', outcomeValue: 'https://github.com/bw-design/pull/45', createdAt: '2025-01-20T14:00:00' },
      { id: 'we14', dailyReportId: 'dr4', module: 'training', title: 'React 19 新特性學習', description: '學習 React 19 Server Components 及 Actions 概念', hours: 2.0, outcomeType: 'growth_experience', outcomeValue: '理解了 Server Actions 的使用場景，可應用於 BW 網站的表單提交優化', createdAt: '2025-01-20T16:00:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr5',
    userId: 'u4',
    userName: '李芳',
    reportDate: '2025-01-20',
    totalHours: 0,
    status: 'approved',
    isLeave: true,
    isHalfDay: false,
    leaveType: '年假',
    submittedAt: '2025-01-19T09:00:00',
    entries: [],
  },
  {
    __sampleData: true,
    id: 'dr6',
    userId: 'u7',
    userName: '林美玲',
    reportDate: '2025-01-20',
    totalHours: 8.0,
    status: 'submitted',
    isLeave: false,
    isHalfDay: false,
    submittedAt: '2025-01-20T18:30:00',
    entries: [
      { id: 'we15', dailyReportId: 'dr6', module: 'marketing', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 部落格文章', description: '撰寫「如何選擇企業網站設計公司」SEO 文章 1800字', hours: 3.5, outcomeType: 'url', outcomeValue: 'https://docs.google.com/doc/bw-blog-jan20', createdAt: '2025-01-20T10:00:00' },
      { id: 'we16', dailyReportId: 'dr6', module: 'marketing', relatedId: 'ws2', relatedName: 'ACI Global', title: 'ACI EDM 文案', description: '撰寫農曆新年推廣 EDM 主題及內文', hours: 2.0, outcomeType: 'url', outcomeValue: 'https://mailchimp.com/templates/aci-cny2025', createdAt: '2025-01-20T14:00:00' },
      { id: 'we17', dailyReportId: 'dr6', module: 'marketing', relatedId: 'ws5', relatedName: 'Wine Club HK', title: 'Wine Club 社媒文案', description: '撰寫 Wine Club 本週 IG 及 FB 貼文文案 x5', hours: 2.5, outcomeType: 'image', outcomeValue: 'https://drive.google.com/wineclub-social-jan20', createdAt: '2025-01-20T17:00:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr7',
    userId: 'u8',
    userName: '黃大偉',
    reportDate: '2025-01-20',
    totalHours: 9.0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    submittedAt: '2025-01-20T18:45:00',
    entries: [
      { id: 'we18', dailyReportId: 'dr7', module: 'marketing', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW Google Ads 優化', description: '調整 Google Ads 出價策略及廣告文案 A/B 測試', hours: 3.0, outcomeType: 'url', outcomeValue: 'https://ads.google.com/campaigns/bw-jan', createdAt: '2025-01-20T10:00:00' },
      { id: 'we19', dailyReportId: 'dr7', module: 'marketing', relatedId: 'ws2', relatedName: 'ACI Global', title: 'ACI SEO 關鍵字研究', description: '使用 Ahrefs 分析 ACI 相關關鍵字排名及競爭對手', hours: 2.5, outcomeType: 'url', outcomeValue: 'https://docs.google.com/sheets/aci-seo-research', createdAt: '2025-01-20T14:00:00' },
      { id: 'we20', dailyReportId: 'dr7', module: 'marketing', relatedId: 'ws5', relatedName: 'Wine Club HK', title: 'Wine Club FB 廣告投放', description: '設定農曆新年紅酒禮盒推廣廣告系列', hours: 2.0, outcomeType: 'url', outcomeValue: 'https://business.facebook.com/adsmanager/wineclub', createdAt: '2025-01-20T17:00:00' },
      { id: 'we21', dailyReportId: 'dr7', module: 'internal_meeting', title: '行銷策略會議', description: '討論 Q1 各品牌行銷預算分配及 KPI 設定', hours: 1.0, outcomeType: 'growth_experience', outcomeValue: '確認 Q1 重點投放在 BW 及 Wine Club，調整 ROAS 目標為 3.5', createdAt: '2025-01-20T09:00:00' },
      { id: 'we21b', dailyReportId: 'dr7', module: 'other', title: '辦公室設備維護', description: '協助 IT 部門更換會議室投影設備', hours: 0.5, outcomeType: 'growth_experience', outcomeValue: '完成設備更新，會議室可正常使用', createdAt: '2025-01-20T18:00:00' },
    ],
  },
  // Previous days (模擬數據)
  {
    __sampleData: true,
    id: 'dr8',
    userId: 'u1',
    userName: '陳小華',
    reportDate: '2025-01-17',
    totalHours: 9.0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    submittedAt: '2025-01-17T19:00:00',
    entries: [
      { id: 'we22', dailyReportId: 'dr8', module: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 服務頁面設計', description: '完成服務頁面整體版面設計及互動原型', hours: 4.0, outcomeType: 'url', outcomeValue: 'https://figma.com/bw-services-v3', createdAt: '2025-01-17T10:00:00' },
      { id: 'we23', dailyReportId: 'dr8', module: 'website', relatedId: 'ws4', relatedName: 'BSC Tech Solutions', title: 'BSC 首頁設計稿', description: '完成 BSC 首頁線稿 3 個方案', hours: 3.0, outcomeType: 'image', outcomeValue: 'https://figma.com/bsc-homepage-drafts', createdAt: '2025-01-17T14:00:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr9',
    userId: 'u3',
    userName: '戴維斯',
    reportDate: '2025-01-17',
    totalHours: 8.0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    submittedAt: '2025-01-17T18:00:00',
    entries: [
      { id: 'we25', dailyReportId: 'dr9', module: 'website', relatedId: 'ws2', relatedName: 'ACI Global', title: 'ACI 後台開發', description: '完成報告生成模組的 PDF 匯出功能', hours: 5.0, outcomeType: 'url', outcomeValue: 'https://github.com/aci-global/pull/112', createdAt: '2025-01-17T10:00:00' },
      { id: 'we26', dailyReportId: 'dr9', module: 'company_event', title: '公司年度聚餐籌備', description: '確認餐廳場地及節目安排', hours: 1.5, outcomeType: 'growth_experience', outcomeValue: '完成場地預訂及節目流程表，確保 50 人活動順利進行', createdAt: '2025-01-17T16:00:00' },
      { id: 'we27', dailyReportId: 'dr9', module: 'training', title: 'TypeScript 進階學習', description: '學習 TypeScript 泛型及類型守衛', hours: 1.5, outcomeType: 'growth_experience', outcomeValue: '掌握了條件類型和映射類型的使用，可提升代碼類型安全性', createdAt: '2025-01-17T17:30:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr10',
    userId: 'u1',
    userName: '陳小華',
    reportDate: '2025-01-16',
    totalHours: 4.5,
    status: 'approved',
    isLeave: false,
    isHalfDay: true,
    submittedAt: '2025-01-16T13:30:00',
    entries: [
      { id: 'we28', dailyReportId: 'dr10', module: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 關於我們頁面', description: '完成公司介紹頁面內容更新', hours: 2.5, outcomeType: 'url', outcomeValue: 'https://staging.bwdesign.com.hk/about', createdAt: '2025-01-16T09:00:00' },
      { id: 'we29', dailyReportId: 'dr10', module: 'internal_meeting', title: '半日工作討論', description: '與 PM 確認下週工作安排', hours: 1.0, outcomeType: 'growth_experience', outcomeValue: '確認下週重點是 BSC 網站首頁開發', createdAt: '2025-01-16T11:30:00' },
      { id: 'we30', dailyReportId: 'dr10', module: 'training', title: 'UI 設計趨勢研究', description: '研究 2025 年 UI 設計趨勢報告', hours: 1.0, outcomeType: 'url', outcomeValue: 'https://notion.so/ui-trends-notes-2025', createdAt: '2025-01-16T12:30:00' },
    ],
  },
  // More for month stats (模擬數據)
  {
    __sampleData: true,
    id: 'dr11',
    userId: 'u5',
    userName: '朴賢俊',
    reportDate: '2025-01-17',
    totalHours: 8.0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    submittedAt: '2025-01-17T18:00:00',
    entries: [
      { id: 'we31', dailyReportId: 'dr11', module: 'video', relatedId: 'ws3', relatedName: 'FCC Media', title: 'FCC 影片剪輯 EP2', description: '完成第2集最終版本剪輯', hours: 6.0, outcomeType: 'url', outcomeValue: 'https://vimeo.com/fcc-ep2-final', createdAt: '2025-01-17T10:00:00' },
      { id: 'we32', dailyReportId: 'dr11', module: 'video', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 短視頻拍攝', description: '拍攝 BW 服務介紹 30 秒短視頻 x3', hours: 2.0, outcomeType: 'image', outcomeValue: 'https://drive.google.com/bw-shorts-jan17', createdAt: '2025-01-17T16:00:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr12',
    userId: 'u7',
    userName: '林美玲',
    reportDate: '2025-01-17',
    totalHours: 8.0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    submittedAt: '2025-01-17T18:00:00',
    entries: [
      { id: 'we33', dailyReportId: 'dr12', module: 'marketing', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 文章撰寫', description: '撰寫「響應式設計最佳實踐」文章', hours: 4.0, outcomeType: 'url', outcomeValue: 'https://docs.google.com/doc/bw-rwd-article', createdAt: '2025-01-17T10:00:00' },
      { id: 'we34', dailyReportId: 'dr12', module: 'marketing', relatedId: 'ws5', relatedName: 'Wine Club HK', title: 'Wine Club 產品描述', description: '撰寫 10 款紅酒產品描述及推薦語', hours: 3.0, outcomeType: 'url', outcomeValue: 'https://docs.google.com/doc/wineclub-products', createdAt: '2025-01-17T14:00:00' },
      { id: 'we35', dailyReportId: 'dr12', module: 'training', title: 'SEO 文案技巧', description: '學習 SEO 文案寫作框架 AIDA 及 PAS', hours: 1.0, outcomeType: 'growth_experience', outcomeValue: '掌握了 PAS 框架：Problem-Agitate-Solve，可應用於產品頁面文案', createdAt: '2025-01-17T17:00:00' },
    ],
  },
];

// Helper: Get reports by date
export function getReportsByDate(date: string): DailyReport[] {
  return dailyReports.filter(r => r.reportDate === date);
}

// Helper: Get reports by user
export function getReportsByUser(userId: string): DailyReport[] {
  return dailyReports.filter(r => r.userId === userId);
}

// Helper: Get all work entries for a date range
export function getEntriesForDateRange(startDate: string, endDate: string): WorkEntry[] {
  const reports = dailyReports.filter(r => r.reportDate >= startDate && r.reportDate <= endDate);
  return reports.flatMap(r => r.entries);
}

// Helper: Get related items for module
export function getRelatedItems(module: WorkModule) {
  switch (module) {
    case 'website':
      return websiteProfiles.map(ws => ({ id: ws.id, name: ws.websiteName, company: ws.company, brand: ws.brand }));
    case 'marketing':
      return websiteProfiles.map(ws => ({ id: ws.id, name: ws.websiteName, company: ws.company, brand: ws.brand }));
    case 'video':
      return websiteProfiles.map(ws => ({ id: ws.id, name: ws.websiteName, company: ws.company, brand: ws.brand }));
    case 'project_meeting':
      return projects.map(p => ({ id: p.id, name: p.name, company: p.company || '', brand: p.brand || '' }));
    case 'client_meeting':
      return projects.map(p => ({ id: p.id, name: p.name, company: p.company || '', brand: p.brand || '' }));
    default:
      return projects.map(p => ({ id: p.id, name: p.name, company: p.company || '', brand: p.brand || '' }));
  }
}

// Non-project work module types (for "其他匯報總表")
export const nonProjectModules: WorkModule[] = ['client_meeting', 'project_meeting', 'training', 'company_event', 'other'];

// Helper: Get non-project entries statistics
export function getNonProjectStats(year: number, month: number) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const reports = dailyReports.filter(r => r.reportDate.startsWith(monthStr) && !r.isLeave);
  const allEntries = reports.flatMap(r => r.entries);
  const nonProjectEntries = allEntries.filter(e => nonProjectModules.includes(e.module));
  
  // Stats per module type
  const moduleStats = nonProjectModules.map(mod => {
    const entries = nonProjectEntries.filter(e => e.module === mod);
    const totalHours = entries.reduce((s, e) => s + e.hours, 0);
    const uniqueStaff = [...new Set(reports.filter(r => r.entries.some(e => e.module === mod)).map(r => r.userId))];
    return {
      module: mod,
      config: moduleConfig[mod],
      entryCount: entries.length,
      totalHours,
      staffCount: uniqueStaff.length,
      entries,
    };
  });

  // Stats per staff
  const staffStats = staffMembers.map(staff => {
    const staffReports = reports.filter(r => r.userId === staff.id);
    const staffEntries = staffReports.flatMap(r => r.entries).filter(e => nonProjectModules.includes(e.module));
    const byModule: Record<string, { hours: number; count: number }> = {};
    nonProjectModules.forEach(mod => {
      const modEntries = staffEntries.filter(e => e.module === mod);
      byModule[mod] = { hours: modEntries.reduce((s, e) => s + e.hours, 0), count: modEntries.length };
    });
    return {
      ...staff,
      totalNonProjectHours: staffEntries.reduce((s, e) => s + e.hours, 0),
      entryCount: staffEntries.length,
      byModule,
    };
  }).filter(s => s.totalNonProjectHours > 0).sort((a, b) => b.totalNonProjectHours - a.totalNonProjectHours);

  return { moduleStats, staffStats, totalEntries: nonProjectEntries.length, totalHours: nonProjectEntries.reduce((s, e) => s + e.hours, 0) };
}

// Helper: Get monthly stats per staff
export function getMonthlyStats(year: number, month: number) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  return staffMembers.map(staff => {
    const reports = dailyReports.filter(r => r.userId === staff.id && r.reportDate.startsWith(monthStr));
    const totalHours = reports.reduce((s, r) => s + r.totalHours, 0);
    const workDays = reports.filter(r => !r.isLeave).length;
    const otDays = reports.filter(r => r.totalHours > 8).length;
    const avgHours = workDays > 0 ? totalHours / workDays : 0;
    return {
      ...staff,
      totalHours,
      workDays,
      reportDays: reports.length,
      otDays,
      avgHours,
      entries: reports.flatMap(r => r.entries),
    };
  });
}

// Helper: get top projects by hours for a month
export function getTopProjectsByHours(year: number, month: number, limit = 10) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const reports = dailyReports.filter(r => r.reportDate.startsWith(monthStr) && !r.isLeave);
  const entries = reports.flatMap(r => r.entries);
  
  const projectHours: Record<string, { name: string; hours: number; companyId?: string; brandId?: string }> = {};
  
  entries.forEach(entry => {
    const key = entry.relatedName || entry.title;
    if (!projectHours[key]) {
      // Find company/brand info
      const ws = websiteProfiles.find(w => w.id === entry.relatedId);
      const proj = projects.find(p => p.id === entry.relatedId);
      projectHours[key] = {
        name: key,
        hours: 0,
        companyId: ws?.companyId || proj?.companyId,
        brandId: ws?.brandId || proj?.brandId,
      };
    }
    projectHours[key].hours += entry.hours;
  });
  
  return Object.values(projectHours)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, limit)
    .map(item => ({
      ...item,
      companyName: companies.find(c => c.id === item.companyId)?.companyNameZh || '—',
      brandName: brands.find(b => b.id === item.brandId)?.displayName || '—',
    }));
}
