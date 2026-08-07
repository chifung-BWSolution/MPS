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
    uuid: '25709685-229e-5efa-80bb-a0da30269f59',
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
    uuid: 'c2a51e7a-f50d-5ed3-b93f-42ee94b510c7',
    companyCode: 'WP',
    companyNameZh: '意酒會洋行有限公司',
    companyNameEn: 'WINE PASSIONS LIMITED',
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
    uuid: '954961df-ae61-57c6-bdcc-09e92eddba42',
    companyCode: 'BWA',
    companyNameZh: '志豐設計工程有限公司',
    companyNameEn: 'BRAND STORY ASIA LIMITED',
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
  { __sampleData: true, id: 'b056bcb8-67b5-592f-b265-711df4b657f1', companyId: 'dacb20dc-2181-5138-982e-989a853acc12', brandCode: 'BSC', displayName: 'BSC', isActive: true, projectCount: 1 },
  { __sampleData: true, id: 'f13c0169-6513-58be-bd6d-baa3fd813cc5', companyId: '954961df-ae61-57c6-bdcc-09e92eddba42', brandCode: 'BWA', displayName: 'BWA', isActive: true, projectCount: 3 },
  { __sampleData: true, id: '74c13191-55d0-5074-bc5e-65bbb3934dc9', companyId: '25709685-229e-5efa-80bb-a0da30269f59', brandCode: 'BWD', displayName: 'BWD', isActive: true, projectCount: 0 },
  { __sampleData: true, id: '3b7d3552-6335-5f04-894b-bb00bf52d7e2', companyId: '25709685-229e-5efa-80bb-a0da30269f59', brandCode: 'BWF', displayName: 'BWF', isActive: true, projectCount: 0 },
  { __sampleData: true, id: 'f1f8a3a6-187f-58a9-8270-428df26c6666', companyId: 'b1a22b78-3e4b-56ac-bd83-3a3795cb6ae9', brandCode: 'FCC', displayName: 'FCC', isActive: true, projectCount: 0 },
  { __sampleData: true, id: '3b345631-6870-5924-9eb7-347e28a27fa8', companyId: 'c2a51e7a-f50d-5ed3-b93f-42ee94b510c7', brandCode: 'Wine', displayName: 'Wine', isActive: true, projectCount: 0 },
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
