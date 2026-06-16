/**
 * ============================================================
 * Quotation Types & Mock Data
 * ============================================================
 * ⚠️ quotationEntries, clientProjects, termsTemplates 記錄帶有 __sampleData: true 標記
 * ⚠️ quotationTypes, presetQuotationItems 為系統設定，非模擬數據
 * ⚠️ 清除方法: 使用 isSampleData() 判斷
 * ============================================================
 */

export interface TermsTemplate {
  id: string;
  name: string;
  content: string;
  quotationTypeId: string; // which quotation type this belongs to, or 'all' for shared
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuotationType {
  id: string;
  name: string;
  nameEn: string;
  logoUrl: string;
  defaultTerms: string;
  paymentArrangement: PaymentStage[];
  defaultServices: DefaultServiceItem[];
  isActive: boolean;
}

export interface PaymentStage {
  id: string;
  label: string;
  percentage: number;
  description: string;
}

export interface DefaultServiceItem {
  id: string;
  name: string;
  defaultPrice: number;
  defaultCost: number;
  supplierName: string;
}

export interface QuotationServiceItem {
  id: string;
  name: string;
  price: number;
  cost: number;
  supplierName: string;
  quantity: number;
  discount: number;
  discountType: 'percentage' | 'fixed';
  isVisible: boolean;
  isSelected: boolean;
}

export interface CostStructureItem {
  id: string;
  name: string;
  amount: number;
  supplierName: string;
}

export interface CostStructure {
  totalRevenue: number;
  laborCost: number;
  supplierCost: number;
  outsourcingCost: number;
  otherCost: number;
  grossProfit: number;
  grossMargin: number;
  items?: CostStructureItem[];
}

// === Preset Quotation Items ===
export interface PresetQuotationItem {
  id: string;
  name: string;
  category: string; // quotation type id or 'comprehensive'
  defaultPrice: number;
  defaultCost: number;
  supplierName: string;
  isPackage?: boolean;
  packageItems?: string[]; // IDs of other preset items
}

export interface ComprehensivePackage {
  id: string;
  name: string;
  description: string;
  items: PresetQuotationItem[];
  totalPrice: number;
  totalCost: number;
}

// Version history for quotations
export interface QuotationVersion {
  id: string;
  version: number;
  modifiedBy: string;
  modifiedAt: string;
  changeDescription: string;
  snapshot: Partial<QuotationEntry>;
}

// Preset quotation items data
export const presetQuotationItems: PresetQuotationItem[] = [
  // 網站設計
  { id: 'pi1', name: 'UI/UX 介面設計', category: 'qt1', defaultPrice: 18000, defaultCost: 8000, supplierName: '內部設計團隊' },
  { id: 'pi2', name: '前端開發（響應式）', category: 'qt1', defaultPrice: 25000, defaultCost: 12000, supplierName: '內部開發團隊' },
  { id: 'pi3', name: '後端系統整合', category: 'qt1', defaultPrice: 15000, defaultCost: 8000, supplierName: '內部開發團隊' },
  { id: 'pi4', name: '內容管理系統 (CMS)', category: 'qt1', defaultPrice: 8000, defaultCost: 3000, supplierName: '內部開發團隊' },
  { id: 'pi5', name: 'SEO 基礎優化', category: 'qt1', defaultPrice: 5000, defaultCost: 2000, supplierName: '內部SEO團隊' },
  { id: 'pi6', name: 'QA 測試及上線部署', category: 'qt1', defaultPrice: 6000, defaultCost: 3000, supplierName: '內部QA團隊' },
  // 系統設計
  { id: 'pi7', name: '需求分析及系統規劃', category: 'qt2', defaultPrice: 15000, defaultCost: 6000, supplierName: '內部分析師' },
  { id: 'pi8', name: '系統架構設計', category: 'qt2', defaultPrice: 20000, defaultCost: 10000, supplierName: '內部架構師' },
  { id: 'pi9', name: '資料庫設計', category: 'qt2', defaultPrice: 12000, defaultCost: 5000, supplierName: '內部開發團隊' },
  { id: 'pi10', name: 'API 開發', category: 'qt2', defaultPrice: 25000, defaultCost: 12000, supplierName: '內部開發團隊' },
  { id: 'pi11', name: '前端介面開發', category: 'qt2', defaultPrice: 20000, defaultCost: 10000, supplierName: '內部開發團隊' },
  { id: 'pi12', name: '系統整合測試', category: 'qt2', defaultPrice: 10000, defaultCost: 5000, supplierName: '內部QA團隊' },
  // 平面設計
  { id: 'pi13', name: '品牌標誌設計', category: 'qt3', defaultPrice: 12000, defaultCost: 5000, supplierName: '內部設計團隊' },
  { id: 'pi14', name: '名片設計', category: 'qt3', defaultPrice: 3000, defaultCost: 1200, supplierName: '內部設計團隊' },
  { id: 'pi15', name: '海報設計', category: 'qt3', defaultPrice: 5000, defaultCost: 2000, supplierName: '內部設計團隊' },
  { id: 'pi16', name: '宣傳單張設計', category: 'qt3', defaultPrice: 4000, defaultCost: 1500, supplierName: '內部設計團隊' },
  // 影片製作
  { id: 'pi17', name: '影片策劃及腳本', category: 'qt5', defaultPrice: 8000, defaultCost: 3000, supplierName: '內部創意團隊' },
  { id: 'pi18', name: '拍攝（1天）', category: 'qt5', defaultPrice: 15000, defaultCost: 8000, supplierName: '外包攝影團隊' },
  { id: 'pi19', name: '後期剪輯', category: 'qt5', defaultPrice: 12000, defaultCost: 5000, supplierName: '內部剪輯師' },
  { id: 'pi20', name: '動態圖像 (Motion Graphics)', category: 'qt5', defaultPrice: 10000, defaultCost: 5000, supplierName: '外包動畫師' },
  // SEO升級
  { id: 'pi21', name: '網站SEO審計', category: 'qt6', defaultPrice: 8000, defaultCost: 3000, supplierName: '內部SEO團隊' },
  { id: 'pi22', name: '關鍵字策略規劃', category: 'qt6', defaultPrice: 6000, defaultCost: 2500, supplierName: '內部SEO團隊' },
  { id: 'pi23', name: '站內優化 (On-Page)', category: 'qt6', defaultPrice: 10000, defaultCost: 4000, supplierName: '內部SEO團隊' },
  { id: 'pi24', name: '外部連結建設', category: 'qt6', defaultPrice: 12000, defaultCost: 6000, supplierName: '外包SEO供應商' },
  // 行銷推廣
  { id: 'pi25', name: '行銷策略規劃', category: 'qt7', defaultPrice: 15000, defaultCost: 6000, supplierName: '內部行銷團隊' },
  { id: 'pi26', name: '社交媒體管理（月費）', category: 'qt7', defaultPrice: 8000, defaultCost: 3500, supplierName: '內部行銷團隊' },
  { id: 'pi27', name: 'Google Ads 管理', category: 'qt7', defaultPrice: 6000, defaultCost: 2500, supplierName: '內部行銷團隊' },
  // 活動策劃
  { id: 'pi28', name: '活動策劃及統籌', category: 'qt8', defaultPrice: 20000, defaultCost: 8000, supplierName: '內部活動團隊' },
  { id: 'pi29', name: '舞台及場地佈置', category: 'qt8', defaultPrice: 35000, defaultCost: 20000, supplierName: '佈置供應商A' },
  { id: 'pi30', name: '音響及燈光設備', category: 'qt8', defaultPrice: 15000, defaultCost: 8000, supplierName: '設備供應商B' },
  // 綜合方案
  { id: 'pi31', name: '網站 + SEO + 社媒管理方案', category: 'comprehensive', defaultPrice: 55000, defaultCost: 25000, supplierName: '內部綜合團隊', isPackage: true, packageItems: ['pi1', 'pi2', 'pi3', 'pi5', 'pi21', 'pi23', 'pi26'] },
  { id: 'pi32', name: '品牌全套設計方案', category: 'comprehensive', defaultPrice: 80000, defaultCost: 35000, supplierName: '內部設計團隊', isPackage: true, packageItems: ['pi13', 'pi14', 'pi15', 'pi16', 'pi1'] },
  { id: 'pi33', name: '數碼行銷全方位方案', category: 'comprehensive', defaultPrice: 45000, defaultCost: 20000, supplierName: '內部行銷團隊', isPackage: true, packageItems: ['pi25', 'pi26', 'pi27', 'pi21', 'pi22'] },
];

export interface QuotationEntry {
  id: string;
  quoteId: string;
  client: string;
  clientId: string;
  companyId: string;
  brandId: string;
  projectType: string;
  quotationType: string;
  quotationMode: 'single' | 'comprehensive';
  amount: number;
  costTotal: number;
  grossProfit: number;
  grossMargin: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'sent' | 'won' | 'lost';
  createdDate: string;
  approvedDate?: string;
  signedPdfUrl?: string;
  terms: string;
  paymentArrangement: PaymentStage[];
  services: QuotationServiceItem[];
  costStructure: CostStructure;
  overallDiscount: number;
  overallDiscountType: 'percentage' | 'fixed';
  createdBy: string;
  approvedBy?: string;
  rejectionReason?: string;
  versionHistory?: QuotationVersion[];
  linkedProjectId?: string;
}

export interface ClientProject {
  id: string;
  quotationId: string;
  quoteId: string;
  clientName: string;
  clientId: string;
  companyId: string;
  brandId: string;
  totalAmount: number;
  billingModel: string;
  status: 'setup' | 'active' | 'completed' | 'on_hold';
  deliveryProgress: number;
  milestones: Milestone[];
  assignedStaff: string[];
  wonDate: string;
  serviceDetails: { name: string; quantity: number }[];
}

export interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed';
  assignee?: string;
  completedDate?: string;
  sortOrder: number;
}

// Quotation Types (configurable from settings)
export const quotationTypes: QuotationType[] = [
  {
    id: 'qt1',
    name: '網站設計',
    nameEn: 'Web Design',
    logoUrl: '',
    defaultTerms: '1. 本報價有效期為30天。\n2. 設計稿修改不超過3次。\n3. 專案完成後提供30天免費維護。\n4. 額外功能需另行報價。\n5. 客戶需提供所有文字及圖片素材。',
    paymentArrangement: [
      { id: 'ps1', label: '訂金', percentage: 30, description: '簽約後3個工作天內支付' },
      { id: 'ps2', label: '中期款', percentage: 40, description: '設計稿確認後支付' },
      { id: 'ps3', label: '尾款', percentage: 30, description: '網站上線後7天內支付' },
    ],
    defaultServices: [
      { id: 'ds1', name: 'UI/UX 介面設計', defaultPrice: 18000, defaultCost: 8000, supplierName: '內部設計團隊' },
      { id: 'ds2', name: '前端開發（響應式）', defaultPrice: 25000, defaultCost: 12000, supplierName: '內部開發團隊' },
      { id: 'ds3', name: '後端系統整合', defaultPrice: 15000, defaultCost: 8000, supplierName: '內部開發團隊' },
      { id: 'ds4', name: '內容管理系統 (CMS)', defaultPrice: 8000, defaultCost: 3000, supplierName: '內部開發團隊' },
      { id: 'ds5', name: 'SEO 基礎優化', defaultPrice: 5000, defaultCost: 2000, supplierName: '內部SEO團隊' },
      { id: 'ds6', name: 'QA 測試及上線部署', defaultPrice: 6000, defaultCost: 3000, supplierName: '內部QA團隊' },
    ],
    isActive: true,
  },
  {
    id: 'qt2',
    name: '系統設計',
    nameEn: 'System Design',
    logoUrl: '',
    defaultTerms: '1. 本報價有效期為30天。\n2. 需求確認後不接受重大變更。\n3. 專案完成後提供90天免費維護。\n4. 包含技術文檔交付。\n5. 額外伺服器費用由客戶承擔。',
    paymentArrangement: [
      { id: 'ps1', label: '訂金', percentage: 30, description: '簽約後3個工作天內支付' },
      { id: 'ps2', label: '需求確認款', percentage: 20, description: '需求文檔確認後支付' },
      { id: 'ps3', label: '中期款', percentage: 30, description: '系統測試通過後支付' },
      { id: 'ps4', label: '尾款', percentage: 20, description: '系統上線後14天內支付' },
    ],
    defaultServices: [
      { id: 'ds1', name: '需求分析及系統規劃', defaultPrice: 15000, defaultCost: 6000, supplierName: '內部分析師' },
      { id: 'ds2', name: '系統架構設計', defaultPrice: 20000, defaultCost: 10000, supplierName: '內部架構師' },
      { id: 'ds3', name: '資料庫設計', defaultPrice: 12000, defaultCost: 5000, supplierName: '內部開發團隊' },
      { id: 'ds4', name: 'API 開發', defaultPrice: 25000, defaultCost: 12000, supplierName: '內部開發團隊' },
      { id: 'ds5', name: '前端介面開發', defaultPrice: 20000, defaultCost: 10000, supplierName: '內部開發團隊' },
      { id: 'ds6', name: '系統整合測試', defaultPrice: 10000, defaultCost: 5000, supplierName: '內部QA團隊' },
      { id: 'ds7', name: '部署及文檔', defaultPrice: 8000, defaultCost: 4000, supplierName: '內部DevOps' },
    ],
    isActive: true,
  },
  {
    id: 'qt3',
    name: '平面設計',
    nameEn: 'Graphic Design',
    logoUrl: '',
    defaultTerms: '1. 本報價有效期為14天。\n2. 每項設計含2次免費修改。\n3. 設計版權於付清全款後轉讓。\n4. 印刷費用另計。',
    paymentArrangement: [
      { id: 'ps1', label: '訂金', percentage: 50, description: '確認訂單後支付' },
      { id: 'ps2', label: '尾款', percentage: 50, description: '定稿確認後支付' },
    ],
    defaultServices: [
      { id: 'ds1', name: '品牌標誌設計', defaultPrice: 12000, defaultCost: 5000, supplierName: '內部設計團隊' },
      { id: 'ds2', name: '名片設計', defaultPrice: 3000, defaultCost: 1200, supplierName: '內部設計團隊' },
      { id: 'ds3', name: '海報設計', defaultPrice: 5000, defaultCost: 2000, supplierName: '內部設計團隊' },
      { id: 'ds4', name: '宣傳單張設計', defaultPrice: 4000, defaultCost: 1500, supplierName: '內部設計團隊' },
      { id: 'ds5', name: '社交媒體圖片製作', defaultPrice: 3000, defaultCost: 1200, supplierName: '內部設計團隊' },
    ],
    isActive: true,
  },
  {
    id: 'qt4',
    name: '品牌設計',
    nameEn: 'Branding',
    logoUrl: '',
    defaultTerms: '1. 本報價有效期為30天。\n2. 品牌策略及視覺系統含3次修改。\n3. 完成後提供品牌指引手冊。\n4. 版權於付清全款後完全轉讓。',
    paymentArrangement: [
      { id: 'ps1', label: '訂金', percentage: 40, description: '簽約後支付' },
      { id: 'ps2', label: '中期款', percentage: 30, description: '品牌策略確認後支付' },
      { id: 'ps3', label: '尾款', percentage: 30, description: '品牌手冊交付後支付' },
    ],
    defaultServices: [
      { id: 'ds1', name: '品牌策略研究', defaultPrice: 20000, defaultCost: 8000, supplierName: '內部策略團隊' },
      { id: 'ds2', name: '品牌命名', defaultPrice: 10000, defaultCost: 4000, supplierName: '內部策略團隊' },
      { id: 'ds3', name: '品牌標誌設計', defaultPrice: 25000, defaultCost: 10000, supplierName: '內部設計團隊' },
      { id: 'ds4', name: '視覺識別系統 (VI)', defaultPrice: 30000, defaultCost: 12000, supplierName: '內部設計團隊' },
      { id: 'ds5', name: '品牌指引手冊', defaultPrice: 15000, defaultCost: 6000, supplierName: '內部設計團隊' },
    ],
    isActive: true,
  },
  {
    id: 'qt5',
    name: '影片製作',
    nameEn: 'Video Production',
    logoUrl: '',
    defaultTerms: '1. 本報價有效期為14天。\n2. 含前期策劃、拍攝及後期剪輯。\n3. 修改不超過2次。\n4. 演員及場地費用另計。\n5. 原始素材歸客戶所有。',
    paymentArrangement: [
      { id: 'ps1', label: '訂金', percentage: 40, description: '確認訂單後支付' },
      { id: 'ps2', label: '拍攝款', percentage: 30, description: '拍攝完成後支付' },
      { id: 'ps3', label: '尾款', percentage: 30, description: '成片確認後支付' },
    ],
    defaultServices: [
      { id: 'ds1', name: '影片策劃及腳本', defaultPrice: 8000, defaultCost: 3000, supplierName: '內部創意團隊' },
      { id: 'ds2', name: '拍攝（1天）', defaultPrice: 15000, defaultCost: 8000, supplierName: '外包攝影團隊' },
      { id: 'ds3', name: '後期剪輯', defaultPrice: 12000, defaultCost: 5000, supplierName: '內部剪輯師' },
      { id: 'ds4', name: '動態圖像 (Motion Graphics)', defaultPrice: 10000, defaultCost: 5000, supplierName: '外包動畫師' },
      { id: 'ds5', name: '配音及音效', defaultPrice: 5000, defaultCost: 3000, supplierName: '外包配音員' },
    ],
    isActive: true,
  },
  {
    id: 'qt6',
    name: 'SEO升級',
    nameEn: 'SEO Upgrade',
    logoUrl: '',
    defaultTerms: '1. SEO 優化為持續性服務。\n2. 預計3-6個月見效。\n3. 每月提供排名報告。\n4. 不保證特定排名位置。',
    paymentArrangement: [
      { id: 'ps1', label: '首月付款', percentage: 50, description: '服務開始時支付' },
      { id: 'ps2', label: '第二期', percentage: 50, description: '第3個月初支付' },
    ],
    defaultServices: [
      { id: 'ds1', name: '網站SEO審計', defaultPrice: 8000, defaultCost: 3000, supplierName: '內部SEO團隊' },
      { id: 'ds2', name: '關鍵字策略規劃', defaultPrice: 6000, defaultCost: 2500, supplierName: '內部SEO團隊' },
      { id: 'ds3', name: '站內優化 (On-Page)', defaultPrice: 10000, defaultCost: 4000, supplierName: '內部SEO團隊' },
      { id: 'ds4', name: '外部連結建設', defaultPrice: 12000, defaultCost: 6000, supplierName: '外包SEO供應商' },
      { id: 'ds5', name: '內容優化（6篇文章）', defaultPrice: 9000, defaultCost: 4500, supplierName: '內部文案團隊' },
    ],
    isActive: true,
  },
  {
    id: 'qt7',
    name: '行銷推廣',
    nameEn: 'Marketing Campaign',
    logoUrl: '',
    defaultTerms: '1. 本報價有效期為14天。\n2. 廣告費用由客戶另行支付。\n3. 每月提供成效報告。\n4. 最少合約期為3個月。',
    paymentArrangement: [
      { id: 'ps1', label: '首月付款', percentage: 40, description: '服務開始時支付' },
      { id: 'ps2', label: '第二期', percentage: 30, description: '第2個月初支付' },
      { id: 'ps3', label: '第三期', percentage: 30, description: '第3個月初支付' },
    ],
    defaultServices: [
      { id: 'ds1', name: '行銷策略規劃', defaultPrice: 15000, defaultCost: 6000, supplierName: '內部行銷團隊' },
      { id: 'ds2', name: '社交媒體管理（月費）', defaultPrice: 8000, defaultCost: 3500, supplierName: '內部行銷團隊' },
      { id: 'ds3', name: 'Google Ads 管理', defaultPrice: 6000, defaultCost: 2500, supplierName: '內部行銷團隊' },
      { id: 'ds4', name: 'Facebook/IG 廣告管理', defaultPrice: 6000, defaultCost: 2500, supplierName: '內部行銷團隊' },
      { id: 'ds5', name: 'EDM 製作及發送', defaultPrice: 5000, defaultCost: 2000, supplierName: '內部行銷團隊' },
    ],
    isActive: true,
  },
  {
    id: 'qt8',
    name: '活動策劃',
    nameEn: 'Event Planning',
    logoUrl: '',
    defaultTerms: '1. 本報價有效期為14天。\n2. 場地租金及餐飲費用另計。\n3. 活動日期確認後不可更改。\n4. 取消政策：7天前免費取消，7天內收取50%費用。',
    paymentArrangement: [
      { id: 'ps1', label: '訂金', percentage: 30, description: '確認後3天內支付' },
      { id: 'ps2', label: '中期款', percentage: 40, description: '活動前14天支付' },
      { id: 'ps3', label: '尾款', percentage: 30, description: '活動後7天內支付' },
    ],
    defaultServices: [
      { id: 'ds1', name: '活動策劃及統籌', defaultPrice: 20000, defaultCost: 8000, supplierName: '內部活動團隊' },
      { id: 'ds2', name: '舞台及場地佈置', defaultPrice: 35000, defaultCost: 20000, supplierName: '佈置供應商A' },
      { id: 'ds3', name: '音響及燈光設備', defaultPrice: 15000, defaultCost: 8000, supplierName: '設備供應商B' },
      { id: 'ds4', name: '攝影及錄影', defaultPrice: 12000, defaultCost: 6000, supplierName: '外包攝影團隊' },
      { id: 'ds5', name: '活動主持', defaultPrice: 8000, defaultCost: 5000, supplierName: '外包主持人' },
    ],
    isActive: true,
  },
];

// Mock quotation entries
export const quotationEntries: (QuotationEntry & { __sampleData: true })[] = [
  {
    __sampleData: true,
    id: 'q1',
    quoteId: 'QT-2024-031',
    client: 'Acme Corp',
    clientId: 'cl1',
    companyId: 'c1',
    brandId: 'b1',
    projectType: 'web_design',
    quotationType: 'qt1',
    quotationMode: 'single',
    amount: 77000,
    costTotal: 34000,
    grossProfit: 43000,
    grossMargin: 55.8,
    status: 'pending_approval',
    createdDate: '2024-12-15',
    terms: '1. 本報價有效期為30天。\n2. 設計稿修改不超過3次。',
    paymentArrangement: [
      { id: 'ps1', label: '訂金', percentage: 30, description: '簽約後3個工作天內支付' },
      { id: 'ps2', label: '中期款', percentage: 40, description: '設計稿確認後支付' },
      { id: 'ps3', label: '尾款', percentage: 30, description: '網站上線後7天內支付' },
    ],
    services: [
      { id: 's1', name: 'UI/UX 介面設計', price: 18000, cost: 8000, supplierName: '內部設計團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's2', name: '前端開發（響應式）', price: 25000, cost: 12000, supplierName: '內部開發團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's3', name: '後端系統整合', price: 15000, cost: 8000, supplierName: '內部開發團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's4', name: 'CMS 系統', price: 8000, cost: 3000, supplierName: '內部開發團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's5', name: 'SEO 基礎優化', price: 5000, cost: 2000, supplierName: '內部SEO團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's6', name: 'QA 測試', price: 6000, cost: 3000, supplierName: '內部QA團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
    ],
    costStructure: { totalRevenue: 77000, laborCost: 20000, supplierCost: 8000, outsourcingCost: 3000, otherCost: 3000, grossProfit: 43000, grossMargin: 55.8 },
    overallDiscount: 0,
    overallDiscountType: 'percentage',
    createdBy: '陳小華',
  },
  {
    __sampleData: true,
    id: 'q2',
    quoteId: 'QT-2024-030',
    client: 'Bella Wines',
    clientId: 'cl2',
    companyId: 'c2',
    brandId: 'b4',
    projectType: 'event',
    quotationType: 'qt8',
    quotationMode: 'single',
    amount: 120000,
    costTotal: 52000,
    grossProfit: 68000,
    grossMargin: 56.7,
    status: 'approved',
    createdDate: '2024-12-13',
    approvedDate: '2024-12-14',
    terms: '1. 本報價有效期為14天。\n2. 場地租金及餐飲費用另計。',
    paymentArrangement: [
      { id: 'ps1', label: '訂金', percentage: 30, description: '確認後3天內支付' },
      { id: 'ps2', label: '中期款', percentage: 40, description: '活動前14天支付' },
      { id: 'ps3', label: '尾款', percentage: 30, description: '活動後7天內支付' },
    ],
    services: [
      { id: 's1', name: '活動策劃及統籌', price: 25000, cost: 10000, supplierName: '內部活動團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's2', name: '舞台及場地佈置', price: 40000, cost: 22000, supplierName: '佈置供應商A', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's3', name: '音響及燈光設備', price: 20000, cost: 10000, supplierName: '設備供應商B', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's4', name: '攝影及錄影', price: 15000, cost: 6000, supplierName: '外包攝影團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's5', name: '活動主持', price: 10000, cost: 5000, supplierName: '外包主持人', quantity: 1, discount: 10, discountType: 'percentage', isVisible: true, isSelected: true },
    ],
    costStructure: { totalRevenue: 120000, laborCost: 15000, supplierCost: 25000, outsourcingCost: 8000, otherCost: 4000, grossProfit: 68000, grossMargin: 56.7 },
    overallDiscount: 0,
    overallDiscountType: 'percentage',
    createdBy: '戴維斯',
    approvedBy: '張偉明',
  },
  {
    __sampleData: true,
    id: 'q3',
    quoteId: 'QT-2024-029',
    client: 'TechStart Inc',
    clientId: 'cl3',
    companyId: 'c1',
    brandId: 'b1',
    projectType: 'system',
    quotationType: 'qt2',
    quotationMode: 'single',
    amount: 110000,
    costTotal: 48000,
    grossProfit: 62000,
    grossMargin: 56.4,
    status: 'won',
    createdDate: '2024-12-10',
    approvedDate: '2024-12-11',
    signedPdfUrl: '/signed/qt-2024-029.pdf',
    terms: '1. 本報價有效期為30天。',
    paymentArrangement: [
      { id: 'ps1', label: '訂金', percentage: 30, description: '簽約後3個工作天內支付' },
      { id: 'ps2', label: '需求確認款', percentage: 20, description: '需求文檔確認後支付' },
      { id: 'ps3', label: '中期款', percentage: 30, description: '系統測試通過後支付' },
      { id: 'ps4', label: '尾款', percentage: 20, description: '系統上線後14天內支付' },
    ],
    services: [
      { id: 's1', name: '需求分析及系統規劃', price: 15000, cost: 6000, supplierName: '內部分析師', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's2', name: '系統架構設計', price: 20000, cost: 10000, supplierName: '內部架構師', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's3', name: '資料庫設計', price: 12000, cost: 5000, supplierName: '內部開發團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's4', name: 'API 開發', price: 25000, cost: 12000, supplierName: '內部開發團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's5', name: '前端介面開發', price: 20000, cost: 10000, supplierName: '內部開發團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's6', name: '系統整合測試', price: 10000, cost: 5000, supplierName: '內部QA團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's7', name: '部署及文檔', price: 8000, cost: 4000, supplierName: '內部DevOps', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
    ],
    costStructure: { totalRevenue: 110000, laborCost: 25000, supplierCost: 12000, outsourcingCost: 6000, otherCost: 5000, grossProfit: 62000, grossMargin: 56.4 },
    overallDiscount: 0,
    overallDiscountType: 'percentage',
    createdBy: '陳小華',
    approvedBy: '張偉明',
  },
  {
    __sampleData: true,
    id: 'q4',
    quoteId: 'QT-2024-028',
    client: 'Green Living',
    clientId: 'cl4',
    companyId: 'c1',
    brandId: 'b2',
    projectType: 'branding',
    quotationType: 'qt4',
    quotationMode: 'single',
    amount: 85000,
    costTotal: 35000,
    grossProfit: 50000,
    grossMargin: 58.8,
    status: 'won',
    createdDate: '2024-12-08',
    approvedDate: '2024-12-09',
    signedPdfUrl: '/signed/qt-2024-028.pdf',
    terms: '1. 本報價有效期為30天。',
    paymentArrangement: [
      { id: 'ps1', label: '訂金', percentage: 40, description: '簽約後支付' },
      { id: 'ps2', label: '中期款', percentage: 30, description: '品牌策略確認後支付' },
      { id: 'ps3', label: '尾款', percentage: 30, description: '品牌手冊交付後支付' },
    ],
    services: [
      { id: 's1', name: '品牌策略研究', price: 20000, cost: 8000, supplierName: '內部策略團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's2', name: '品牌標誌設計', price: 25000, cost: 10000, supplierName: '內部設計團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's3', name: '視覺識別系統', price: 30000, cost: 12000, supplierName: '內部設計團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's4', name: '品牌指引手冊', price: 10000, cost: 5000, supplierName: '內部設計團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
    ],
    costStructure: { totalRevenue: 85000, laborCost: 18000, supplierCost: 10000, outsourcingCost: 4000, otherCost: 3000, grossProfit: 50000, grossMargin: 58.8 },
    overallDiscount: 0,
    overallDiscountType: 'percentage',
    createdBy: '戴維斯',
    approvedBy: '張偉明',
  },
  {
    __sampleData: true,
    id: 'q5',
    quoteId: 'QT-2024-027',
    client: 'SportMax',
    clientId: 'cl5',
    companyId: 'c1',
    brandId: 'b1',
    projectType: 'web_design',
    quotationType: 'qt1',
    quotationMode: 'single',
    amount: 55000,
    costTotal: 26000,
    grossProfit: 29000,
    grossMargin: 52.7,
    status: 'rejected',
    createdDate: '2024-12-05',
    terms: '1. 本報價有效期為30天。',
    paymentArrangement: [
      { id: 'ps1', label: '訂金', percentage: 30, description: '簽約後3個工作天內支付' },
      { id: 'ps2', label: '中期款', percentage: 40, description: '設計稿確認後支付' },
      { id: 'ps3', label: '尾款', percentage: 30, description: '網站上線後7天內支付' },
    ],
    services: [
      { id: 's1', name: 'UI/UX 介面設計', price: 18000, cost: 8000, supplierName: '內部設計團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's2', name: '前端開發', price: 22000, cost: 10000, supplierName: '內部開發團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's3', name: 'QA 測試', price: 8000, cost: 4000, supplierName: '內部QA團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's4', name: 'SEO 基礎優化', price: 7000, cost: 4000, supplierName: '內部SEO團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
    ],
    costStructure: { totalRevenue: 55000, laborCost: 14000, supplierCost: 6000, outsourcingCost: 3000, otherCost: 3000, grossProfit: 29000, grossMargin: 52.7 },
    overallDiscount: 0,
    overallDiscountType: 'percentage',
    createdBy: '朴賢俊',
    rejectionReason: '客戶預算不足，已轉為較低規格方案重新報價',
  },
  {
    __sampleData: true,
    id: 'q6',
    quoteId: 'QT-2024-026',
    client: 'FoodCraft',
    clientId: 'cl6',
    companyId: 'c2',
    brandId: 'b4',
    projectType: 'video',
    quotationType: 'qt5',
    quotationMode: 'single',
    amount: 50000,
    costTotal: 24000,
    grossProfit: 26000,
    grossMargin: 52.0,
    status: 'sent',
    createdDate: '2024-12-01',
    terms: '1. 本報價有效期為14天。',
    paymentArrangement: [
      { id: 'ps1', label: '訂金', percentage: 40, description: '確認訂單後支付' },
      { id: 'ps2', label: '拍攝款', percentage: 30, description: '拍攝完成後支付' },
      { id: 'ps3', label: '尾款', percentage: 30, description: '成片確認後支付' },
    ],
    services: [
      { id: 's1', name: '影片策劃及腳本', price: 8000, cost: 3000, supplierName: '內部創意團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's2', name: '拍攝（1天）', price: 15000, cost: 8000, supplierName: '外包攝影團隊', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's3', name: '後期剪輯', price: 12000, cost: 5000, supplierName: '內部剪輯師', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's4', name: '動態圖像', price: 10000, cost: 5000, supplierName: '外包動畫師', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
      { id: 's5', name: '配音及音效', price: 5000, cost: 3000, supplierName: '外包配音員', quantity: 1, discount: 0, discountType: 'percentage', isVisible: true, isSelected: true },
    ],
    costStructure: { totalRevenue: 50000, laborCost: 10000, supplierCost: 8000, outsourcingCost: 4000, otherCost: 2000, grossProfit: 26000, grossMargin: 52.0 },
    overallDiscount: 0,
    overallDiscountType: 'percentage',
    createdBy: '戴維斯',
  },
];

// Mock client projects (from won deals)
export const clientProjects: (ClientProject & { __sampleData: true })[] = [
  {
    __sampleData: true,
    id: 'cp1',
    quotationId: 'q3',
    quoteId: 'QT-2024-029',
    clientName: 'TechStart Inc',
    clientId: 'cl3',
    companyId: 'c1',
    brandId: 'b1',
    totalAmount: 110000,
    billingModel: '分期付款',
    status: 'active',
    deliveryProgress: 45,
    milestones: [
      { id: 'm1', title: '需求確認', dueDate: '2024-12-20', status: 'completed', assignee: '陳小華', completedDate: '2024-12-19', sortOrder: 0 },
      { id: 'm2', title: '系統架構設計', dueDate: '2025-01-05', status: 'completed', assignee: '張偉明', completedDate: '2025-01-04', sortOrder: 1 },
      { id: 'm3', title: 'API 開發完成', dueDate: '2025-01-20', status: 'in_progress', assignee: '朴賢俊', sortOrder: 2 },
      { id: 'm4', title: '前端開發完成', dueDate: '2025-02-05', status: 'pending', assignee: '陳小華', sortOrder: 3 },
      { id: 'm5', title: '系統測試及上線', dueDate: '2025-02-20', status: 'pending', assignee: '戴維斯', sortOrder: 4 },
    ],
    assignedStaff: ['陳小華', '朴賢俊', '戴維斯'],
    wonDate: '2024-12-12',
    serviceDetails: [
      { name: '需求分析及系統規劃', quantity: 1 },
      { name: '系統架構設計', quantity: 1 },
      { name: 'API 開發', quantity: 1 },
      { name: '前端介面開發', quantity: 1 },
      { name: '系統整合測試', quantity: 1 },
    ],
  },
  {
    __sampleData: true,
    id: 'cp2',
    quotationId: 'q4',
    quoteId: 'QT-2024-028',
    clientName: 'Green Living',
    clientId: 'cl4',
    companyId: 'c1',
    brandId: 'b2',
    totalAmount: 85000,
    billingModel: '分期付款',
    status: 'active',
    deliveryProgress: 70,
    milestones: [
      { id: 'm1', title: '品牌策略研究', dueDate: '2024-12-20', status: 'completed', assignee: '戴維斯', completedDate: '2024-12-18', sortOrder: 0 },
      { id: 'm2', title: '品牌標誌設計', dueDate: '2025-01-05', status: 'completed', assignee: '陳小華', completedDate: '2025-01-03', sortOrder: 1 },
      { id: 'm3', title: '視覺識別系統', dueDate: '2025-01-20', status: 'in_progress', assignee: '陳小華', sortOrder: 2 },
      { id: 'm4', title: '品牌手冊交付', dueDate: '2025-02-01', status: 'pending', assignee: '戴維斯', sortOrder: 3 },
    ],
    assignedStaff: ['戴維斯', '陳小華'],
    wonDate: '2024-12-10',
    serviceDetails: [
      { name: '品牌策略研究', quantity: 1 },
      { name: '品牌標誌設計', quantity: 1 },
      { name: '視覺識別系統', quantity: 1 },
      { name: '品牌指引手冊', quantity: 1 },
    ],
  },
];

// Helper functions
export function getQuotationTypeName(typeId: string): string {
  const qt = quotationTypes.find(t => t.id === typeId);
  return qt ? qt.name : '未知';
}

export function getStatusConfig(status: QuotationEntry['status']) {
  const configs = {
    draft: { label: '草稿', color: 'text-slate-700', bgColor: 'bg-slate-50' },
    pending_approval: { label: '待批核', color: 'text-amber-700', bgColor: 'bg-amber-50' },
    approved: { label: '已批准', color: 'text-teal-700', bgColor: 'bg-teal-50' },
    rejected: { label: '已退回', color: 'text-rose-700', bgColor: 'bg-rose-50' },
    sent: { label: '已寄出', color: 'text-blue-700', bgColor: 'bg-blue-50' },
    won: { label: '已成交', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
    lost: { label: '已流失', color: 'text-gray-700', bgColor: 'bg-gray-50' },
  };
  return configs[status];
}

export function getClientProjectStatusConfig(status: ClientProject['status']) {
  const configs = {
    setup: { label: '設置中', color: 'text-blue-700', bgColor: 'bg-blue-50' },
    active: { label: '進行中', color: 'text-teal-700', bgColor: 'bg-teal-50' },
    completed: { label: '已完成', color: 'text-slate-700', bgColor: 'bg-slate-50' },
    on_hold: { label: '暫停', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  };
  return configs[status];
}

// === Terms & Conditions Templates ===
export const termsTemplates: TermsTemplate[] = [
  // 網站設計
  {
    id: 'tt1',
    name: '標準網站設計條款',
    content: '1. 本報價有效期為30天。\n2. 設計稿修改不超過3次。\n3. 專案完成後提供30天免費維護。\n4. 額外功能需另行報價。\n5. 客戶需提供所有文字及圖片素材。',
    quotationTypeId: 'qt1',
    isDefault: true,
    createdAt: '2024-01-15',
    updatedAt: '2024-01-15',
  },
  {
    id: 'tt2',
    name: '大型網站項目條款',
    content: '1. 本報價有效期為30天。\n2. 設計稿修改不超過5次。\n3. 專案完成後提供90天免費維護。\n4. 額外功能需另行報價。\n5. 客戶需提供所有文字及圖片素材。\n6. 項目延期超過30天需重新報價。\n7. 包含培訓1次（2小時）。',
    quotationTypeId: 'qt1',
    isDefault: false,
    createdAt: '2024-02-01',
    updatedAt: '2024-02-01',
  },
  // 系統設計
  {
    id: 'tt3',
    name: '標準系統設計條款',
    content: '1. 本報價有效期為30天。\n2. 需求確認後不接受重大變更。\n3. 專案完成後提供90天免費維護。\n4. 包含技術文檔交付。\n5. 額外伺服器費用由客戶承擔。',
    quotationTypeId: 'qt2',
    isDefault: true,
    createdAt: '2024-01-15',
    updatedAt: '2024-01-15',
  },
  {
    id: 'tt4',
    name: '系統設計（含SLA）',
    content: '1. 本報價有效期為30天。\n2. 需求確認後不接受重大變更。\n3. 專案完成後提供180天免費維護及SLA保障。\n4. 包含技術文檔及培訓交付。\n5. 額外伺服器費用由客戶承擔。\n6. SLA回應時間：緊急4小時，一般24小時。\n7. 每月維護報告。',
    quotationTypeId: 'qt2',
    isDefault: false,
    createdAt: '2024-03-01',
    updatedAt: '2024-03-01',
  },
  // 平面設計
  {
    id: 'tt5',
    name: '標準平面設計條款',
    content: '1. 本報價有效期為14天。\n2. 每項設計含2次免費修改。\n3. 設計版權於付清全款後轉讓。\n4. 印刷費用另計。',
    quotationTypeId: 'qt3',
    isDefault: true,
    createdAt: '2024-01-15',
    updatedAt: '2024-01-15',
  },
  // 品牌設計
  {
    id: 'tt6',
    name: '標準品牌設計條款',
    content: '1. 本報價有效期為30天。\n2. 品牌策略及視覺系統含3次修改。\n3. 完成後提供品牌指引手冊。\n4. 版權於付清全款後完全轉讓。',
    quotationTypeId: 'qt4',
    isDefault: true,
    createdAt: '2024-01-15',
    updatedAt: '2024-01-15',
  },
  // 影片製作
  {
    id: 'tt7',
    name: '標準影片製作條款',
    content: '1. 本報價有效期為14天。\n2. 含前期策劃、拍攝及後期剪輯。\n3. 修改不超過2次。\n4. 演員及場地費用另計。\n5. 原始素材歸客戶所有。',
    quotationTypeId: 'qt5',
    isDefault: true,
    createdAt: '2024-01-15',
    updatedAt: '2024-01-15',
  },
  {
    id: 'tt8',
    name: '影片製作（含版權購買）',
    content: '1. 本報價有效期為14天。\n2. 含前期策劃、拍攝及後期剪輯。\n3. 修改不超過3次。\n4. 演員及場地費用已含。\n5. 原始素材歸客戶所有。\n6. 含音樂版權購買費用。\n7. 製成品可用於商業廣播。',
    quotationTypeId: 'qt5',
    isDefault: false,
    createdAt: '2024-04-01',
    updatedAt: '2024-04-01',
  },
  // SEO升級
  {
    id: 'tt9',
    name: '標準SEO條款',
    content: '1. SEO 優化為持續性服務。\n2. 預計3-6個月見效。\n3. 每月提供排名報告。\n4. 不保證特定排名位置。',
    quotationTypeId: 'qt6',
    isDefault: true,
    createdAt: '2024-01-15',
    updatedAt: '2024-01-15',
  },
  // 行銷推廣
  {
    id: 'tt10',
    name: '標準行銷推廣條款',
    content: '1. 本報價有效期為14天。\n2. 廣告費用由客戶另行支付。\n3. 每月提供成效報告。\n4. 最少合約期為3個月。',
    quotationTypeId: 'qt7',
    isDefault: true,
    createdAt: '2024-01-15',
    updatedAt: '2024-01-15',
  },
  // 活動策劃
  {
    id: 'tt11',
    name: '標準活動策劃條款',
    content: '1. 本報價有效期為14天。\n2. 場地租金及餐飲費用另計。\n3. 活動日期確認後不可更改。\n4. 取消政策：7天前免費取消，7天內收取50%費用。',
    quotationTypeId: 'qt8',
    isDefault: true,
    createdAt: '2024-01-15',
    updatedAt: '2024-01-15',
  },
  // 通用 (all types)
  {
    id: 'tt12',
    name: '通用保密條款',
    content: '1. 雙方均須對項目內容保密。\n2. 未經書面同意，不得向第三方披露。\n3. 保密期限為合約結束後2年。\n4. 違反保密條款需承擔法律責任。',
    quotationTypeId: 'all',
    isDefault: false,
    createdAt: '2024-01-20',
    updatedAt: '2024-01-20',
  },
  {
    id: 'tt13',
    name: '通用付款逾期條款',
    content: '1. 逾期付款將按每日0.05%收取滯納金。\n2. 逾期超過30天，本公司有權暫停服務。\n3. 逾期超過60天，本公司保留法律追訴權利。\n4. 所有銀行手續費由客戶承擔。',
    quotationTypeId: 'all',
    isDefault: false,
    createdAt: '2024-01-20',
    updatedAt: '2024-01-20',
  },
];
