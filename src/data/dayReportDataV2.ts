/**
 * ============================================================
 * Day Report Module Data V2 — Enhanced outcome-oriented work reporting
 * 13 work categories + AI tracking + auto-pull integration
 * ============================================================
 */
import { websiteProfiles } from '@/data/websiteData';
import { projects, companies, brands } from '@/data/mockData';

// === Enhanced Types ===
export type WorkCategory =
  | 'website_design'
  | 'website_dev'
  | 'article_writing'
  | 'video_shooting'
  | 'video_editing'
  | 'social_media'
  | 'edm'
  | 'paid_ads'
  | 'seo'
  | 'graphic_design'
  | 'client_meeting'
  | 'internal_meeting'
  | 'training';

export type OutcomeType = 'url' | 'image' | 'growth_experience';
export type ReportStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type AITool = 'chatgpt' | 'claude' | 'midjourney' | 'cursor' | 'other';

export interface WorkEntryV2 {
  id: string;
  dailyReportId: string;
  category: WorkCategory;
  relatedType?: 'project' | 'website' | 'article' | 'video' | 'social_post' | 'paid_ad';
  relatedId?: string;
  relatedName?: string;
  title: string;
  description: string;
  hours: number;
  outcomeType: OutcomeType;
  outcomeUrl?: string;
  outcomeImages?: string[];
  growthExperience?: string;
  isAiAssisted: boolean;
  aiTools?: AITool[];
  createdAt: string;
}

export interface DailyReportV2 {
  id: string;
  userId: string;
  userName: string;
  reportDate: string;
  totalHours: number;
  otHours: number;
  status: ReportStatus;
  isLeave: boolean;
  isHalfDay: boolean;
  leaveType?: string;
  aiUsed: boolean;
  aiTools?: AITool[];
  note?: string;
  entries: WorkEntryV2[];
  submittedAt?: string;
  reviewedAt?: string;
  reviewerId?: string;
  underHoursReason?: string;
}

export interface StaffMemberV2 {
  id: string;
  name: string;
  role: string;
  department: string;
  avatar?: string;
  position: string;
}

// === Staff Data ===
export const staffMembersV2: (StaffMemberV2 & { __sampleData: true })[] = [
  // System Department
  { __sampleData: true, id: 'u1', name: 'Lowell Lo', role: 'super_admin', department: 'System', position: '系統管理員' },
  { __sampleData: true, id: 'u2', name: 'Leo Tse', role: 'project_manager', department: 'System', position: '項目經理' },
  { __sampleData: true, id: 'u3', name: 'Bis Sit', role: 'designer', department: 'System', position: '資深設計師' },
  // FC Department
  { __sampleData: true, id: 'u4', name: '陳小華', role: 'project_manager', department: 'FC', position: '高級項目經理' },
  { __sampleData: true, id: 'u5', name: '戴維斯', role: 'project_manager', department: 'FC', position: '項目經理' },
  // Wine Department
  { __sampleData: true, id: 'u6', name: '朴賢俊', role: 'video_editor', department: 'Wine', position: '影片剪輯師' },
  { __sampleData: true, id: 'u7', name: '張偉明', role: 'management', department: 'Wine', position: '總監' },
  // Accounting & Admin
  { __sampleData: true, id: 'u8', name: '李芳', role: 'accountant', department: 'Accounting & Admin', position: '會計師' },
  // Marketing & Video
  { __sampleData: true, id: 'u9', name: '林美玲', role: 'copywriter', department: 'Marketing & Video', position: '資深文案' },
  { __sampleData: true, id: 'u10', name: '黃大偉', role: 'marketing', department: 'Marketing & Video', position: '行銷主管' },
  { __sampleData: true, id: 'u11', name: '王志明', role: 'designer', department: 'Marketing & Video', position: '平面設計師' },
];

// === 13 Category Config ===
export const categoryConfig: Record<WorkCategory, { label: string; color: string; bg: string; icon: string; textColor: string }> = {
  website_design: { label: '網站設計', color: 'text-blue-700', bg: 'bg-blue-100', icon: '🎨', textColor: '#1d4ed8' },
  website_dev: { label: '網站開發', color: 'text-indigo-700', bg: 'bg-indigo-100', icon: '💻', textColor: '#4338ca' },
  article_writing: { label: '文章撰寫', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: '✍️', textColor: '#047857' },
  video_shooting: { label: '影片拍攝', color: 'text-purple-700', bg: 'bg-purple-100', icon: '🎥', textColor: '#7e22ce' },
  video_editing: { label: '影片剪輯', color: 'text-violet-700', bg: 'bg-violet-100', icon: '🎬', textColor: '#6d28d9' },
  social_media: { label: '社交媒體', color: 'text-pink-700', bg: 'bg-pink-100', icon: '📱', textColor: '#be185d' },
  edm: { label: 'EDM 行銷', color: 'text-rose-700', bg: 'bg-rose-100', icon: '📧', textColor: '#be123c' },
  paid_ads: { label: '付費廣告', color: 'text-orange-700', bg: 'bg-orange-100', icon: '📊', textColor: '#c2410c' },
  seo: { label: 'SEO 優化', color: 'text-lime-700', bg: 'bg-lime-100', icon: '🔍', textColor: '#4d7c0f' },
  graphic_design: { label: '平面設計', color: 'text-cyan-700', bg: 'bg-cyan-100', icon: '🖼️', textColor: '#0e7490' },
  client_meeting: { label: '客戶會議', color: 'text-amber-700', bg: 'bg-amber-100', icon: '🤝', textColor: '#b45309' },
  internal_meeting: { label: '內部會議', color: 'text-teal-700', bg: 'bg-teal-100', icon: '💼', textColor: '#0f766e' },
  training: { label: '學習培訓', color: 'text-yellow-700', bg: 'bg-yellow-100', icon: '📚', textColor: '#a16207' },
};

export const outcomeTypeConfigV2: Record<OutcomeType, { label: string; icon: string; placeholder: string }> = {
  url: { label: '網址連結', icon: '🔗', placeholder: '輸入完成成果的URL...' },
  image: { label: '成果圖片', icon: '🖼️', placeholder: '輸入圖片連結或上傳...' },
  growth_experience: { label: '成長經驗', icon: '🌱', placeholder: '描述學習到的經驗和技能提升...' },
};

export const aiToolConfig: Record<AITool, { label: string; icon: string }> = {
  chatgpt: { label: 'ChatGPT', icon: '🤖' },
  claude: { label: 'Claude', icon: '🧠' },
  midjourney: { label: 'Midjourney', icon: '🎨' },
  cursor: { label: 'Cursor', icon: '⚡' },
  other: { label: '其他AI工具', icon: '🔧' },
};

// === Mock Daily Reports V2 ===
export const dailyReportsV2: (DailyReportV2 & { __sampleData: true })[] = [
  {
    __sampleData: true,
    id: 'dr1',
    userId: 'u4',
    userName: '陳小華',
    reportDate: '2025-01-20',
    totalHours: 8.5,
    otHours: 0.5,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    aiUsed: true,
    aiTools: ['chatgpt', 'midjourney'],
    submittedAt: '2025-01-20T18:30:00',
    reviewedAt: '2025-01-21T09:00:00',
    entries: [
      { id: 'we1', dailyReportId: 'dr1', category: 'website_design', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: '首頁改版設計', description: '完成首頁 Hero Section 重新設計，包含動態輪播與 CTA 按鈕優化', hours: 3.5, outcomeType: 'url', outcomeUrl: 'https://staging.bwdesign.com.hk/homepage-v2', growthExperience: '學到了更好的視覺層次安排方法', isAiAssisted: true, aiTools: ['midjourney'], createdAt: '2025-01-20T10:00:00' },
      { id: 'we2', dailyReportId: 'dr1', category: 'article_writing', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'SEO 文章撰寫', description: '完成「2025年網頁設計趨勢」文章 2000字，優化關鍵字密度', hours: 2.5, outcomeType: 'url', outcomeUrl: 'https://bwdesign.com.hk/blog/web-design-trends-2025', growthExperience: '利用 ChatGPT 加快大綱撰寫速度 3 倍', isAiAssisted: true, aiTools: ['chatgpt'], createdAt: '2025-01-20T14:00:00' },
      { id: 'we3', dailyReportId: 'dr1', category: 'client_meeting', relatedType: 'project', relatedId: 'p2', relatedName: 'ACI 品牌推廣活動', title: 'ACI 客戶會議', description: '與 ACI 客戶討論品牌推廣活動的進度及修改方向', hours: 1.5, outcomeType: 'growth_experience', growthExperience: '學到客戶對色彩搭配的偏好，未來品牌設計需先確認色彩系統再開始版面設計', isAiAssisted: false, createdAt: '2025-01-20T16:00:00' },
      { id: 'we4', dailyReportId: 'dr1', category: 'training', title: 'Figma 進階功能學習', description: '學習 Figma Auto Layout 及 Component Variants 進階使用方法', hours: 1.0, outcomeType: 'growth_experience', growthExperience: '掌握了 Auto Layout 嵌套技巧，未來可節省 30% 排版時間', isAiAssisted: false, createdAt: '2025-01-20T17:30:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr2',
    userId: 'u5',
    userName: '戴維斯',
    reportDate: '2025-01-20',
    totalHours: 9.0,
    otHours: 1.0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    aiUsed: true,
    aiTools: ['chatgpt', 'cursor'],
    submittedAt: '2025-01-20T19:00:00',
    entries: [
      { id: 'we5', dailyReportId: 'dr2', category: 'website_dev', relatedType: 'website', relatedId: 'ws2', relatedName: 'ACI Global', title: 'ACI 網站功能開發', description: '完成客戶管理後台的表單驗證及數據提交功能', hours: 4.0, outcomeType: 'url', outcomeUrl: 'https://staging.aciglobal.com/admin/clients', isAiAssisted: true, aiTools: ['cursor'], createdAt: '2025-01-20T10:00:00' },
      { id: 'we6', dailyReportId: 'dr2', category: 'internal_meeting', title: 'ACI 項目進度會議', description: '討論 ACI 網站開發進度及里程碑確認', hours: 1.5, outcomeType: 'growth_experience', growthExperience: '確認了 Q1 重點項目排序，協助團隊理清任務依賴關係', isAiAssisted: false, createdAt: '2025-01-20T14:30:00' },
      { id: 'we7', dailyReportId: 'dr2', category: 'video_shooting', relatedType: 'website', relatedId: 'ws3', relatedName: 'FCC Media', title: 'FCC 品酒會拍攝腳本', description: '撰寫品酒會活動宣傳影片腳本及鏡頭分鏡', hours: 2.0, outcomeType: 'url', outcomeUrl: 'https://docs.google.com/document/d/fcc-script-v1', isAiAssisted: true, aiTools: ['chatgpt'], createdAt: '2025-01-20T16:00:00' },
      { id: 'we8', dailyReportId: 'dr2', category: 'social_media', relatedType: 'website', relatedId: 'ws2', relatedName: 'ACI Global', title: 'ACI 社媒內容發布', description: '製作並發佈 3 篇 Instagram Story 及 1 篇 FB Post', hours: 1.5, outcomeType: 'image', outcomeImages: ['https://drive.google.com/aci-social-jan20'], isAiAssisted: false, createdAt: '2025-01-20T18:00:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr3',
    userId: 'u6',
    userName: '朴賢俊',
    reportDate: '2025-01-20',
    totalHours: 10.0,
    otHours: 2.0,
    status: 'submitted',
    isLeave: false,
    isHalfDay: false,
    aiUsed: false,
    submittedAt: '2025-01-20T20:00:00',
    entries: [
      { id: 'we9', dailyReportId: 'dr3', category: 'video_editing', relatedType: 'website', relatedId: 'ws3', relatedName: 'FCC Media', title: 'FCC 影片剪輯', description: '剪輯品酒會花絮影片第3集，完成調色及字幕', hours: 5.0, outcomeType: 'url', outcomeUrl: 'https://vimeo.com/fcc-ep3-draft', isAiAssisted: false, createdAt: '2025-01-20T10:00:00' },
      { id: 'we10', dailyReportId: 'dr3', category: 'video_shooting', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 企業影片', description: '拍攝 BW 辦公室環境及團隊介紹片段', hours: 3.0, outcomeType: 'image', outcomeImages: ['https://drive.google.com/bw-video-raw-jan20'], isAiAssisted: false, createdAt: '2025-01-20T15:00:00' },
      { id: 'we11', dailyReportId: 'dr3', category: 'training', title: 'DaVinci Resolve 調色', description: '觀看 YouTube 教學影片學習高級調色工具 Color Page 操作', hours: 2.0, outcomeType: 'growth_experience', growthExperience: '學會使用 Qualifier 工具精確選取膚色範圍並進行美化調整', isAiAssisted: false, createdAt: '2025-01-20T19:00:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr4',
    userId: 'u11',
    userName: '王志明',
    reportDate: '2025-01-20',
    totalHours: 8.0,
    otHours: 0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    aiUsed: true,
    aiTools: ['chatgpt', 'midjourney'],
    submittedAt: '2025-01-20T18:00:00',
    entries: [
      { id: 'we12', dailyReportId: 'dr4', category: 'website_design', relatedType: 'website', relatedId: 'ws4', relatedName: 'BSC Tech Solutions', title: 'BSC 前端設計', description: '完成服務列表頁面響應式設計及交互動畫', hours: 4.0, outcomeType: 'url', outcomeUrl: 'https://staging.bsctech.com/services', isAiAssisted: true, aiTools: ['midjourney'], createdAt: '2025-01-20T10:00:00' },
      { id: 'we13', dailyReportId: 'dr4', category: 'website_dev', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 網站 Bug 修復', description: '修復手機版選單切換動畫卡頓問題', hours: 2.0, outcomeType: 'url', outcomeUrl: 'https://github.com/bw-design/pull/45', isAiAssisted: true, aiTools: ['chatgpt'], createdAt: '2025-01-20T14:00:00' },
      { id: 'we14', dailyReportId: 'dr4', category: 'training', title: 'React 19 新特性學習', description: '學習 React 19 Server Components 及 Actions 概念', hours: 2.0, outcomeType: 'growth_experience', growthExperience: '理解了 Server Actions 的使用場景，可應用於 BW 網站的表單提交優化', isAiAssisted: false, createdAt: '2025-01-20T16:00:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr5',
    userId: 'u8',
    userName: '李芳',
    reportDate: '2025-01-20',
    totalHours: 0,
    otHours: 0,
    status: 'approved',
    isLeave: true,
    isHalfDay: false,
    leaveType: '年假',
    aiUsed: false,
    submittedAt: '2025-01-19T09:00:00',
    entries: [],
  },
  {
    __sampleData: true,
    id: 'dr6',
    userId: 'u9',
    userName: '林美玲',
    reportDate: '2025-01-20',
    totalHours: 8.0,
    otHours: 0,
    status: 'submitted',
    isLeave: false,
    isHalfDay: false,
    aiUsed: true,
    aiTools: ['chatgpt'],
    submittedAt: '2025-01-20T18:30:00',
    entries: [
      { id: 'we15', dailyReportId: 'dr6', category: 'article_writing', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 部落格文章', description: '撰寫「如何選擇企業網站設計公司」SEO 文章 1800字', hours: 3.5, outcomeType: 'url', outcomeUrl: 'https://docs.google.com/doc/bw-blog-jan20', isAiAssisted: true, aiTools: ['chatgpt'], createdAt: '2025-01-20T10:00:00' },
      { id: 'we16', dailyReportId: 'dr6', category: 'edm', relatedType: 'website', relatedId: 'ws2', relatedName: 'ACI Global', title: 'ACI EDM 文案', description: '撰寫農曆新年推廣 EDM 主題及內文', hours: 2.0, outcomeType: 'url', outcomeUrl: 'https://mailchimp.com/templates/aci-cny2025', isAiAssisted: false, createdAt: '2025-01-20T14:00:00' },
      { id: 'we17', dailyReportId: 'dr6', category: 'social_media', relatedType: 'website', relatedId: 'ws5', relatedName: 'Wine Club HK', title: 'Wine Club 社媒文案', description: '撰寫 Wine Club 本週 IG 及 FB 貼文文案 x5', hours: 2.5, outcomeType: 'image', outcomeImages: ['https://drive.google.com/wineclub-social-jan20'], isAiAssisted: true, aiTools: ['chatgpt'], createdAt: '2025-01-20T17:00:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr7',
    userId: 'u10',
    userName: '黃大偉',
    reportDate: '2025-01-20',
    totalHours: 9.0,
    otHours: 1.0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    aiUsed: true,
    aiTools: ['chatgpt'],
    submittedAt: '2025-01-20T18:45:00',
    entries: [
      { id: 'we18', dailyReportId: 'dr7', category: 'paid_ads', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW Google Ads 優化', description: '調整 Google Ads 出價策略及廣告文案 A/B 測試', hours: 3.0, outcomeType: 'url', outcomeUrl: 'https://ads.google.com/campaigns/bw-jan', isAiAssisted: true, aiTools: ['chatgpt'], createdAt: '2025-01-20T10:00:00' },
      { id: 'we19', dailyReportId: 'dr7', category: 'seo', relatedType: 'website', relatedId: 'ws2', relatedName: 'ACI Global', title: 'ACI SEO 關鍵字研究', description: '使用 Ahrefs 分析 ACI 相關關鍵字排名及競爭對手', hours: 2.5, outcomeType: 'url', outcomeUrl: 'https://docs.google.com/sheets/aci-seo-research', isAiAssisted: false, createdAt: '2025-01-20T14:00:00' },
      { id: 'we20', dailyReportId: 'dr7', category: 'paid_ads', relatedType: 'website', relatedId: 'ws5', relatedName: 'Wine Club HK', title: 'Wine Club FB 廣告投放', description: '設定農曆新年紅酒禮盒推廣廣告系列', hours: 2.0, outcomeType: 'url', outcomeUrl: 'https://business.facebook.com/adsmanager/wineclub', isAiAssisted: false, createdAt: '2025-01-20T17:00:00' },
      { id: 'we21', dailyReportId: 'dr7', category: 'internal_meeting', title: '行銷策略會議', description: '討論 Q1 各品牌行銷預算分配及 KPI 設定', hours: 1.0, outcomeType: 'growth_experience', growthExperience: '確認 Q1 重點投放在 BW 及 Wine Club，調整 ROAS 目標為 3.5', isAiAssisted: false, createdAt: '2025-01-20T09:00:00' },
      { id: 'we21b', dailyReportId: 'dr7', category: 'graphic_design', title: '廣告素材設計', description: '製作 Wine Club 廣告 Banner 3 組', hours: 0.5, outcomeType: 'image', outcomeImages: ['https://drive.google.com/wineclub-banners'], isAiAssisted: false, createdAt: '2025-01-20T18:00:00' },
    ],
  },
  // System Department Reports (2025-01-20)
  {
    __sampleData: true,
    id: 'dr14',
    userId: 'u1',
    userName: 'Lowell Lo',
    reportDate: '2025-01-20',
    totalHours: 9.0,
    otHours: 1.0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    aiUsed: true,
    aiTools: ['chatgpt', 'cursor'],
    submittedAt: '2025-01-20T19:30:00',
    reviewedAt: '2025-01-20T20:00:00',
    entries: [
      { id: 'we40', dailyReportId: 'dr14', category: 'website_dev', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: '系統架構設計', description: '完成新版日報系統的部門篩選架構及 RLS 策略設計', hours: 4.0, outcomeType: 'url', outcomeUrl: 'https://github.com/bw-system/pull/89', isAiAssisted: true, aiTools: ['cursor'], createdAt: '2025-01-20T10:00:00' },
      { id: 'we41', dailyReportId: 'dr14', category: 'internal_meeting', title: '團隊週會', description: '與 System 部門成員確認本週 Sprint 進度', hours: 1.5, outcomeType: 'growth_experience', growthExperience: '確認 Q1 系統升級路線圖，優先處理權限模組', isAiAssisted: false, createdAt: '2025-01-20T14:00:00' },
      { id: 'we42', dailyReportId: 'dr14', category: 'website_dev', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'API 權限模組開發', description: '完成 Edge Function 權限中間件及部門過濾邏輯', hours: 3.5, outcomeType: 'url', outcomeUrl: 'https://github.com/bw-system/pull/90', isAiAssisted: true, aiTools: ['chatgpt'], createdAt: '2025-01-20T16:00:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr15',
    userId: 'u2',
    userName: 'Leo Tse',
    reportDate: '2025-01-20',
    totalHours: 8.5,
    otHours: 0.5,
    status: 'submitted',
    isLeave: false,
    isHalfDay: false,
    aiUsed: true,
    aiTools: ['chatgpt'],
    submittedAt: '2025-01-20T18:45:00',
    entries: [
      { id: 'we43', dailyReportId: 'dr15', category: 'website_dev', relatedType: 'website', relatedId: 'ws2', relatedName: 'ACI Global', title: 'ACI 後台模組開發', description: '完成客戶管理列表的分頁及搜尋功能', hours: 4.5, outcomeType: 'url', outcomeUrl: 'https://staging.aciglobal.com/admin/clients-v2', isAiAssisted: true, aiTools: ['chatgpt'], createdAt: '2025-01-20T10:00:00' },
      { id: 'we44', dailyReportId: 'dr15', category: 'website_design', relatedType: 'website', relatedId: 'ws4', relatedName: 'BSC Tech Solutions', title: 'BSC UI Review', description: '審核 BSC 網站前端設計稿及提出優化建議', hours: 2.0, outcomeType: 'growth_experience', growthExperience: '建議採用更簡潔的導航結構，減少客戶認知負荷', isAiAssisted: false, createdAt: '2025-01-20T15:00:00' },
      { id: 'we45', dailyReportId: 'dr15', category: 'training', title: 'Supabase RLS 學習', description: '研究 Supabase Row Level Security 最佳實踐', hours: 2.0, outcomeType: 'growth_experience', growthExperience: '掌握了多租戶 RLS 策略配置，可用於公司隔離方案', isAiAssisted: false, createdAt: '2025-01-20T17:00:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr16',
    userId: 'u3',
    userName: 'Bis Sit',
    reportDate: '2025-01-20',
    totalHours: 8.0,
    otHours: 0,
    status: 'submitted',
    isLeave: false,
    isHalfDay: false,
    aiUsed: true,
    aiTools: ['midjourney', 'chatgpt'],
    submittedAt: '2025-01-20T18:00:00',
    entries: [
      { id: 'we46', dailyReportId: 'dr16', category: 'website_design', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 產品頁面設計', description: '完成產品展示頁面 UI 設計及動效原型', hours: 4.0, outcomeType: 'url', outcomeUrl: 'https://figma.com/bw-products-v2', isAiAssisted: true, aiTools: ['midjourney'], createdAt: '2025-01-20T10:00:00' },
      { id: 'we47', dailyReportId: 'dr16', category: 'graphic_design', relatedType: 'website', relatedId: 'ws2', relatedName: 'ACI Global', title: 'ACI Banner 設計', description: '設計 ACI 首頁 Hero Banner 3 款方案', hours: 2.5, outcomeType: 'image', outcomeImages: ['https://figma.com/aci-banners-jan20'], isAiAssisted: true, aiTools: ['midjourney'], createdAt: '2025-01-20T14:30:00' },
      { id: 'we48', dailyReportId: 'dr16', category: 'internal_meeting', title: '設計評審會議', description: '參與 BW 網站改版設計評審', hours: 1.5, outcomeType: 'growth_experience', growthExperience: '確認了品牌色彩系統更新方向，統一使用新的 Teal 色調', isAiAssisted: false, createdAt: '2025-01-20T16:30:00' },
    ],
  },
  // Previous day
  {
    __sampleData: true,
    id: 'dr8',
    userId: 'u4',
    userName: '陳小華',
    reportDate: '2025-01-17',
    totalHours: 9.0,
    otHours: 1.0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    aiUsed: true,
    aiTools: ['midjourney'],
    submittedAt: '2025-01-17T19:00:00',
    entries: [
      { id: 'we22', dailyReportId: 'dr8', category: 'website_design', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 服務頁面設計', description: '完成服務頁面整體版面設計及互動原型', hours: 4.0, outcomeType: 'url', outcomeUrl: 'https://figma.com/bw-services-v3', isAiAssisted: true, aiTools: ['midjourney'], createdAt: '2025-01-17T10:00:00' },
      { id: 'we23', dailyReportId: 'dr8', category: 'website_design', relatedType: 'website', relatedId: 'ws4', relatedName: 'BSC Tech Solutions', title: 'BSC 首頁設計稿', description: '完成 BSC 首頁線稿 3 個方案', hours: 3.0, outcomeType: 'image', outcomeImages: ['https://figma.com/bsc-homepage-drafts'], isAiAssisted: false, createdAt: '2025-01-17T14:00:00' },
      { id: 'we24', dailyReportId: 'dr8', category: 'client_meeting', relatedType: 'project', relatedId: 'p5', relatedName: 'BSC 企業形象影片', title: 'BSC 客戶需求確認', description: '與創新科技客戶確認影片拍攝需求及時間表', hours: 2.0, outcomeType: 'growth_experience', growthExperience: '了解客戶希望強調「創新科技」形象，需在影片中加入科技元素特效', isAiAssisted: false, createdAt: '2025-01-17T16:30:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr9',
    userId: 'u5',
    userName: '戴維斯',
    reportDate: '2025-01-17',
    totalHours: 8.0,
    otHours: 0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    aiUsed: true,
    aiTools: ['cursor', 'chatgpt'],
    submittedAt: '2025-01-17T18:00:00',
    entries: [
      { id: 'we25', dailyReportId: 'dr9', category: 'website_dev', relatedType: 'website', relatedId: 'ws2', relatedName: 'ACI Global', title: 'ACI 後台開發', description: '完成報告生成模組的 PDF 匯出功能', hours: 5.0, outcomeType: 'url', outcomeUrl: 'https://github.com/aci-global/pull/112', isAiAssisted: true, aiTools: ['cursor'], createdAt: '2025-01-17T10:00:00' },
      { id: 'we26', dailyReportId: 'dr9', category: 'internal_meeting', title: '公司年度聚餐籌備', description: '確認餐廳場地及節目安排', hours: 1.5, outcomeType: 'growth_experience', growthExperience: '完成場地預訂及節目流程表，確保 50 人活動順利進行', isAiAssisted: false, createdAt: '2025-01-17T16:00:00' },
      { id: 'we27', dailyReportId: 'dr9', category: 'training', title: 'TypeScript 進階學習', description: '學習 TypeScript 泛型及類型守衛', hours: 1.5, outcomeType: 'growth_experience', growthExperience: '掌握了條件類型和映射類型的使用，可提升代碼類型安全性', isAiAssisted: false, createdAt: '2025-01-17T17:30:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr10',
    userId: 'u4',
    userName: '陳小華',
    reportDate: '2025-01-16',
    totalHours: 4.5,
    otHours: 0,
    status: 'approved',
    isLeave: false,
    isHalfDay: true,
    aiUsed: false,
    submittedAt: '2025-01-16T13:30:00',
    entries: [
      { id: 'we28', dailyReportId: 'dr10', category: 'website_design', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 關於我們頁面', description: '完成公司介紹頁面內容更新', hours: 2.5, outcomeType: 'url', outcomeUrl: 'https://staging.bwdesign.com.hk/about', isAiAssisted: false, createdAt: '2025-01-16T09:00:00' },
      { id: 'we29', dailyReportId: 'dr10', category: 'internal_meeting', title: '半日工作討論', description: '與 PM 確認下週工作安排', hours: 1.0, outcomeType: 'growth_experience', growthExperience: '確認下週重點是 BSC 網站首頁開發', isAiAssisted: false, createdAt: '2025-01-16T11:30:00' },
      { id: 'we30', dailyReportId: 'dr10', category: 'training', title: 'UI 設計趨勢研究', description: '研究 2025 年 UI 設計趨勢報告', hours: 1.0, outcomeType: 'url', outcomeUrl: 'https://notion.so/ui-trends-notes-2025', isAiAssisted: false, createdAt: '2025-01-16T12:30:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr11',
    userId: 'u6',
    userName: '朴賢俊',
    reportDate: '2025-01-17',
    totalHours: 8.0,
    otHours: 0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    aiUsed: false,
    submittedAt: '2025-01-17T18:00:00',
    entries: [
      { id: 'we31', dailyReportId: 'dr11', category: 'video_editing', relatedType: 'website', relatedId: 'ws3', relatedName: 'FCC Media', title: 'FCC 影片剪輯 EP2', description: '完成第2集最終版本剪輯', hours: 6.0, outcomeType: 'url', outcomeUrl: 'https://vimeo.com/fcc-ep2-final', isAiAssisted: false, createdAt: '2025-01-17T10:00:00' },
      { id: 'we32', dailyReportId: 'dr11', category: 'video_shooting', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 短視頻拍攝', description: '拍攝 BW 服務介紹 30 秒短視頻 x3', hours: 2.0, outcomeType: 'image', outcomeImages: ['https://drive.google.com/bw-shorts-jan17'], isAiAssisted: false, createdAt: '2025-01-17T16:00:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr12',
    userId: 'u9',
    userName: '林美玲',
    reportDate: '2025-01-17',
    totalHours: 8.0,
    otHours: 0,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    aiUsed: true,
    aiTools: ['chatgpt'],
    submittedAt: '2025-01-17T18:00:00',
    entries: [
      { id: 'we33', dailyReportId: 'dr12', category: 'article_writing', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 文章撰寫', description: '撰寫「響應式設計最佳實踐」文章', hours: 4.0, outcomeType: 'url', outcomeUrl: 'https://docs.google.com/doc/bw-rwd-article', isAiAssisted: true, aiTools: ['chatgpt'], createdAt: '2025-01-17T10:00:00' },
      { id: 'we34', dailyReportId: 'dr12', category: 'article_writing', relatedType: 'website', relatedId: 'ws5', relatedName: 'Wine Club HK', title: 'Wine Club 產品描述', description: '撰寫 10 款紅酒產品描述及推薦語', hours: 3.0, outcomeType: 'url', outcomeUrl: 'https://docs.google.com/doc/wineclub-products', isAiAssisted: true, aiTools: ['chatgpt'], createdAt: '2025-01-17T14:00:00' },
      { id: 'we35', dailyReportId: 'dr12', category: 'training', title: 'SEO 文案技巧', description: '學習 SEO 文案寫作框架 AIDA 及 PAS', hours: 1.0, outcomeType: 'growth_experience', growthExperience: '掌握了 PAS 框架：Problem-Agitate-Solve，可應用於產品頁面文案', isAiAssisted: false, createdAt: '2025-01-17T17:00:00' },
    ],
  },
  {
    __sampleData: true,
    id: 'dr13',
    userId: 'u10',
    userName: '黃大偉',
    reportDate: '2025-01-17',
    totalHours: 8.5,
    otHours: 0.5,
    status: 'approved',
    isLeave: false,
    isHalfDay: false,
    aiUsed: true,
    aiTools: ['chatgpt'],
    submittedAt: '2025-01-17T18:30:00',
    entries: [
      { id: 'we36', dailyReportId: 'dr13', category: 'paid_ads', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: 'BW 廣告投放優化', description: '調整廣告受眾及出價策略', hours: 3.0, outcomeType: 'url', outcomeUrl: 'https://ads.google.com/bw-optimize', isAiAssisted: true, aiTools: ['chatgpt'], createdAt: '2025-01-17T10:00:00' },
      { id: 'we37', dailyReportId: 'dr13', category: 'seo', relatedType: 'website', relatedId: 'ws5', relatedName: 'Wine Club HK', title: 'Wine Club SEO 報告', description: '撰寫月度 SEO 成效報告', hours: 2.5, outcomeType: 'url', outcomeUrl: 'https://docs.google.com/seo-report-wc', isAiAssisted: false, createdAt: '2025-01-17T14:00:00' },
      { id: 'we38', dailyReportId: 'dr13', category: 'social_media', relatedType: 'website', relatedId: 'ws2', relatedName: 'ACI Global', title: 'ACI 社媒排程', description: '排定下週社媒發佈計劃', hours: 2.0, outcomeType: 'url', outcomeUrl: 'https://business.suite.com/aci-schedule', isAiAssisted: false, createdAt: '2025-01-17T16:00:00' },
      { id: 'we39', dailyReportId: 'dr13', category: 'client_meeting', relatedType: 'project', relatedId: 'p3', relatedName: 'Wine Club 線上商城', title: 'Wine Club 客戶匯報', description: '向客戶匯報本月行銷成效', hours: 1.0, outcomeType: 'growth_experience', growthExperience: '客戶對 ROAS 提升 40% 表示滿意', isAiAssisted: false, createdAt: '2025-01-17T17:30:00' },
    ],
  },
];

// === Helper Functions ===
export function getReportsByDateV2(date: string): DailyReportV2[] {
  return dailyReportsV2.filter(r => r.reportDate === date);
}

export function getReportsByUserV2(userId: string): DailyReportV2[] {
  return dailyReportsV2.filter(r => r.userId === userId);
}

export function getRelatedItemsV2(category: WorkCategory) {
  switch (category) {
    case 'website_design':
    case 'website_dev':
      return websiteProfiles.map(ws => ({ id: ws.id, name: ws.websiteName, type: 'website' as const }));
    case 'article_writing':
      return websiteProfiles.map(ws => ({ id: ws.id, name: ws.websiteName, type: 'website' as const }));
    case 'video_shooting':
    case 'video_editing':
      return websiteProfiles.map(ws => ({ id: ws.id, name: ws.websiteName, type: 'website' as const }));
    case 'social_media':
    case 'edm':
    case 'paid_ads':
    case 'seo':
    case 'graphic_design':
      return websiteProfiles.map(ws => ({ id: ws.id, name: ws.websiteName, type: 'website' as const }));
    case 'client_meeting':
      return projects.map(p => ({ id: p.id, name: p.name, type: 'project' as const }));
    case 'internal_meeting':
    case 'training':
    default:
      return projects.map(p => ({ id: p.id, name: p.name, type: 'project' as const }));
  }
}

export function getMonthlyStatsV2(year: number, month: number) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  return staffMembersV2.map(staff => {
    const reports = dailyReportsV2.filter(r => r.userId === staff.id && r.reportDate.startsWith(monthStr));
    const totalHours = reports.reduce((s, r) => s + r.totalHours, 0);
    const workDays = reports.filter(r => !r.isLeave).length;
    const otDays = reports.filter(r => r.otHours > 0).length;
    const avgHours = workDays > 0 ? totalHours / workDays : 0;
    const aiUsedCount = reports.filter(r => r.aiUsed).length;
    const aiRate = reports.length > 0 ? (aiUsedCount / reports.length) * 100 : 0;
    const missingDays = getWorkingDaysInMonth(year, month) - reports.length;
    return {
      ...staff,
      totalHours,
      workDays,
      reportDays: reports.length,
      otDays,
      avgHours,
      aiUsedCount,
      aiRate,
      missingDays,
      entries: reports.flatMap(r => r.entries),
    };
  });
}

export function getTopProjectsByHoursV2(year: number, month: number, limit = 10) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const reports = dailyReportsV2.filter(r => r.reportDate.startsWith(monthStr) && !r.isLeave);
  const entries = reports.flatMap(r => r.entries);

  const projectHours: Record<string, { name: string; hours: number; aiHours: number; entryCount: number }> = {};

  entries.forEach(entry => {
    const key = entry.relatedName || entry.title;
    if (!projectHours[key]) {
      projectHours[key] = { name: key, hours: 0, aiHours: 0, entryCount: 0 };
    }
    projectHours[key].hours += entry.hours;
    projectHours[key].entryCount += 1;
    if (entry.isAiAssisted) projectHours[key].aiHours += entry.hours;
  });

  return Object.values(projectHours)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, limit);
}

function getWorkingDaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0 && day !== 6) workingDays++;
  }
  return workingDays;
}

// Simulated "auto-pull" data for today
export function getAutoPullData(): Partial<WorkEntryV2>[] {
  return [
    { category: 'website_design', relatedType: 'website', relatedId: 'ws1', relatedName: 'BW Design Centre', title: '更新網站聯絡頁面', hours: 1.5, outcomeType: 'url', outcomeUrl: 'https://staging.bwdesign.com.hk/contact' },
    { category: 'social_media', relatedType: 'website', relatedId: 'ws2', relatedName: 'ACI Global', title: '發佈 IG 限時動態 x3', hours: 1.0, outcomeType: 'image' },
    { category: 'article_writing', relatedType: 'website', relatedId: 'ws5', relatedName: 'Wine Club HK', title: '「紅酒保存指南」文章草稿完成', hours: 2.0, outcomeType: 'url', outcomeUrl: 'https://docs.google.com/wineclub-storage-guide' },
  ];
}
