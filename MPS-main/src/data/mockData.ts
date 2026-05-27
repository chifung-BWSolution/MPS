/**
 * ============================================================
 * Core Mock Data — Companies, Brands, Projects, Year Plans
 * ============================================================
 * ⚠️ 所有記錄帶有 __sampleData: true 標記
 * ⚠️ 清除方法: 使用 filterOutSampleData() 或 isSampleData() 判斷
 * ⚠️ 未來真實數據不會帶有 __sampleData 標記，可以輕鬆分辨
 * ============================================================
 */
import { Company, Brand, Project, YearPlan, ServiceItem } from '@/types/app';

// Re-export registry utilities for convenience
export { isSampleData, filterOutSampleData, getOnlySampleData, SAMPLE_BADGE_TEXT } from '@/data/sampleDataRegistry';

export const companies: (Company & { __sampleData: true })[] = [
  {
    __sampleData: true,
    id: 'c1',
    companyCode: 'BWD',
    companyNameZh: '志豐企業有限公司',
    companyNameEn: 'BWDesign Centre Limited',
    brNo: '12345678-000-01-25-0',
    bankName: '恒生銀行',
    bankAccount: '024-123-456789-001',
    address: '香港九龍觀塘開源道62號駱駝漆大廈3座10樓A室',
    contactPerson: '張偉明',
    contactPhone: '+852 2345 6789',
    contactEmail: 'info@bwdesign.hk',
    logoUrl: '',
    isActive: true,
    brandCount: 3,
    activeProjectCount: 5,
  },
  {
    __sampleData: true,
    id: 'c2',
    companyCode: 'ZF',
    companyNameZh: '志豐國際貿易有限公司',
    companyNameEn: 'ZhiFeng International Trading Ltd',
    brNo: '98765432-000-02-25-0',
    bankName: '中國銀行(香港)',
    bankAccount: '012-987-654321-002',
    address: '香港灣仔軒尼詩道288號8樓',
    contactPerson: '李志豐',
    contactPhone: '+852 2876 5432',
    contactEmail: 'info@zhifeng.hk',
    logoUrl: '',
    isActive: true,
    brandCount: 5,
    activeProjectCount: 3,
  },
  {
    __sampleData: true,
    id: 'c3',
    companyCode: 'GLE',
    companyNameZh: '綠色生活體驗有限公司',
    companyNameEn: 'Green Living Experience Ltd',
    brNo: '55667788-000-03-25-0',
    bankName: '匯豐銀行',
    bankAccount: '004-555-888999-003',
    address: '香港中環皇后大道中99號15樓',
    contactPerson: '王美玲',
    contactPhone: '+852 2111 3333',
    contactEmail: 'contact@greenlife.hk',
    logoUrl: '',
    isActive: false,
    brandCount: 1,
    activeProjectCount: 0,
  },
];

export const brands: (Brand & { __sampleData: true })[] = [
  {
    __sampleData: true,
    id: 'b1',
    companyId: 'c1',
    brandCode: 'BW',
    brandNameZh: '志豐企業',
    brandNameEn: 'BWDesign Centre',
    industry: 'IT & Design',
    primaryColor: '#0D9488',
    description: '品牌設計與活動策劃公司',
    isActive: true,
    projectCount: 3,
  },
  {
    __sampleData: true,
    id: 'b2',
    companyId: 'c1',
    brandCode: 'ACI',
    brandNameZh: '亞洲信譽國際',
    brandNameEn: 'Asia Credibility International',
    industry: 'Business Consulting',
    primaryColor: '#3B82F6',
    description: '國際商務顧問及認證服務',
    isActive: true,
    projectCount: 2,
  },
  {
    __sampleData: true,
    id: 'b3',
    companyId: 'c1',
    brandCode: 'BSC',
    brandNameZh: '商業服務中心',
    brandNameEn: 'Business Service Centre',
    industry: 'Business Services',
    primaryColor: '#F59E0B',
    description: '企業服務與顧問支援',
    isActive: true,
    projectCount: 1,
  },
  {
    __sampleData: true,
    id: 'b6',
    companyId: 'c3',
    brandCode: 'GLE',
    brandNameZh: '綠色生活體驗',
    brandNameEn: 'Green Living Experience',
    industry: 'Eco Products',
    primaryColor: '#10B981',
    description: '環保生活產品推廣',
    isActive: false,
    projectCount: 0,
  },
  {
    __sampleData: true,
    id: 'b7',
    companyId: 'c2',
    brandCode: 'WP',
    brandNameZh: 'Wine Passions',
    brandNameEn: 'Wine Passions',
    industry: 'Wine & Beverage',
    primaryColor: '#8B0000',
    description: '葡萄酒相關品牌',
    isActive: true,
    projectCount: 0,
  },
  {
    __sampleData: true,
    id: 'b8',
    companyId: 'c2',
    brandCode: 'FC',
    brandNameZh: 'Food Channels 開餐廳',
    brandNameEn: 'Food Channels',
    industry: 'F&B Services',
    primaryColor: '#E85D04',
    description: '餐飲服務及到會品牌',
    isActive: true,
    projectCount: 0,
  },
  {
    __sampleData: true,
    id: 'b9',
    companyId: 'c2',
    brandCode: 'CFG',
    brandNameZh: '志豐集團',
    brandNameEn: 'ChiFung Group',
    industry: 'Conglomerate',
    primaryColor: '#1E3A5F',
    description: '志豐集團及旗下多元業務',
    isActive: true,
    projectCount: 0,
  },
];

export const projects: (Project & { __sampleData: true })[] = [
  { __sampleData: true, id: 'p1', name: 'BW 官網重建', clientName: undefined, companyId: 'c1', brandId: 'b1', projectType: 'web_design', projectCategory: 'internal', status: 'active', progress: 72, assignedPm: '陳小華', brand: 'BW', company: 'BWD', budgetTotal: 45000, budgetUsed: 32400, startDate: '2024-10-01', endDate: '2025-01-15', priority: 'high' },
  { __sampleData: true, id: 'p7', name: 'FCC 電商網站', clientName: undefined, companyId: 'c2', brandId: 'b4', projectType: 'web_design', projectCategory: 'internal', status: 'completed', progress: 100, assignedPm: '陳小華', brand: 'FCC', company: 'ZF', budgetTotal: 68000, budgetUsed: 65000, startDate: '2024-07-01', endDate: '2024-12-31', priority: 'high' },
];

export const yearPlans: (YearPlan & { __sampleData: true })[] = [
  { __sampleData: true, id: 'yp1', companyId: 'c1', brandId: 'b1', year: 2025, targetRevenue: 500000, targetProjects: 10, targetArticles: 48, targetVideos: 24, targetSocialPosts: 120, notes: 'BW 2025年目標' },
  { __sampleData: true, id: 'yp2', companyId: 'c1', brandId: 'b2', year: 2025, targetRevenue: 300000, targetProjects: 6, targetArticles: 24, targetVideos: 12, targetSocialPosts: 60, notes: 'ACI 2025年目標' },
  { __sampleData: true, id: 'yp3', companyId: 'c2', brandId: 'b4', year: 2025, targetRevenue: 200000, targetProjects: 4, targetArticles: 12, targetVideos: 6, targetSocialPosts: 36, notes: 'FCC 2025年目標' },
];

export const projectTypeLabels: Record<string, string> = {
  web_design: '網站設計',
  system: '系統開發',
  graphic_design: '平面設計',
  event: '活動策劃',
  wine: '紅酒推廣',
  branding: '品牌設計',
  marketing: '行銷推廣',
  video: '影片製作',
  social_media: '社交媒體',
  edm: 'EDM 營銷',
  paid_ads: '付費廣告',
  seo_upgrade: 'SEO 升級',
  other: '其他',
};

export const statusConfig: Record<string, { label: string; color: string; textColor: string; bgColor: string }> = {
  planning: { label: '規劃中', color: 'bg-blue-500', textColor: 'text-blue-700', bgColor: 'bg-blue-50' },
  active: { label: '進行中', color: 'bg-teal-600', textColor: 'text-teal-700', bgColor: 'bg-teal-50' },
  on_hold: { label: '暫停', color: 'bg-amber-500', textColor: 'text-amber-700', bgColor: 'bg-amber-50' },
  completed: { label: '已完成', color: 'bg-slate-500', textColor: 'text-slate-700', bgColor: 'bg-slate-50' },
  cancelled: { label: '已取消', color: 'bg-rose-500', textColor: 'text-rose-700', bgColor: 'bg-rose-50' },
};

export const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: '低', color: 'bg-green-100 text-green-700' },
  medium: { label: '中', color: 'bg-blue-100 text-blue-700' },
  high: { label: '高', color: 'bg-amber-100 text-amber-700' },
  urgent: { label: '緊急', color: 'bg-rose-100 text-rose-700' },
};
