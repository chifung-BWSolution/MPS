/**
 * ============================================================
 * Pitching Records Data & Types
 * ============================================================
 * ⚠️ 所有記錄帶有 __sampleData: true 標記
 * ⚠️ 清除方法: 使用 isSampleData() 判斷
 * ============================================================
 */

export type PitchingStatus = 'initial' | 'following_up' | 'converted' | 'abandoned';

export interface PitchingFollowUp {
  id: string;
  date: string;
  content: string;
  result: string;
  createdBy: string;
}

export interface PitchingRecord {
  id: string;
  pitchingId: string;
  clientName: string;
  clientId?: string;
  inquiryDate: string;
  topic: string;
  requirementSummary: string;
  estimatedBudgetMin: number;
  estimatedBudgetMax: number;
  currency: string;
  pitchDate: string;
  assignedPm: string;
  assignedPmName: string;
  status: PitchingStatus;
  notes: string;
  nextAction: string;
  followUps: PitchingFollowUp[];
  linkedQuotationId?: string;
  linkedQuotationNumber?: string;
  lastFollowUpDate?: string;
  createdAt: string;
  updatedAt: string;
}

export const pitchingStatusConfig: Record<PitchingStatus, { label: string; color: string; bgColor: string }> = {
  initial: { label: '初步提案', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  following_up: { label: '跟進中', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  converted: { label: '已轉報價單', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  abandoned: { label: '已放棄', color: 'text-slate-500', bgColor: 'bg-slate-100' },
};

export const pitchingRecords: (PitchingRecord & { __sampleData: true })[] = [];

// Archived sample records — kept for reference, not exported.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _archivedSamples: (PitchingRecord & { __sampleData: true })[] = [
  {
    __sampleData: true,
    id: 'pitch-1',
    pitchingId: 'PTC-2025-001',
    clientName: '恒生銀行',
    clientId: 'client-1',
    inquiryDate: '2025-01-10',
    topic: '企業網站全面改版方案',
    requirementSummary: '客戶希望將現有網站進行全面升級，包括UI/UX重設計、響應式開發、SEO優化及CMS整合。預計6個月內完成。',
    estimatedBudgetMin: 150000,
    estimatedBudgetMax: 250000,
    currency: 'HKD',
    pitchDate: '2025-01-15',
    assignedPm: 'u1',
    assignedPmName: '張偉明',
    status: 'following_up',
    notes: '客戶對我們的Portfolio很滿意，但需要比較其他供應商的報價。',
    nextAction: '安排第二次會議展示原型設計',
    followUps: [
      { id: 'fu-1', date: '2025-01-15', content: '初步會議，了解客戶需求及預算範圍', result: '客戶反應正面，要求提供初步方案', createdBy: '張偉明' },
      { id: 'fu-2', date: '2025-01-22', content: '發送初步方案大綱及時間表', result: '客戶正在內部討論', createdBy: '張偉明' },
    ],
    lastFollowUpDate: '2025-01-22',
    createdAt: '2025-01-10',
    updatedAt: '2025-01-22',
  },
  {
    __sampleData: true,
    id: 'pitch-2',
    pitchingId: 'PTC-2025-002',
    clientName: '太古地產',
    clientId: 'client-2',
    inquiryDate: '2025-01-12',
    topic: '品牌形象重塑及視覺系統設計',
    requirementSummary: '太古地產旗下新商場需要完整品牌形象設計，包含Logo設計、品牌手冊、宣傳物料及數碼素材製作。',
    estimatedBudgetMin: 80000,
    estimatedBudgetMax: 120000,
    currency: 'HKD',
    pitchDate: '2025-01-18',
    assignedPm: 'u2',
    assignedPmName: '李美珊',
    status: 'converted',
    notes: '已成功轉為正式報價單，客戶確認預算範圍。',
    nextAction: '—',
    followUps: [
      { id: 'fu-3', date: '2025-01-18', content: '提案會議，展示3套設計概念方向', result: '客戶選擇方案B，要求細化', createdBy: '李美珊' },
      { id: 'fu-4', date: '2025-01-25', content: '細化方案B並提交報價', result: '客戶確認，轉正式報價單', createdBy: '李美珊' },
    ],
    linkedQuotationId: 'q-001',
    linkedQuotationNumber: 'QT-2025-001',
    lastFollowUpDate: '2025-01-25',
    createdAt: '2025-01-12',
    updatedAt: '2025-01-25',
  },
  {
    __sampleData: true,
    id: 'pitch-3',
    pitchingId: 'PTC-2025-003',
    clientName: '周大福珠寶',
    clientId: 'client-3',
    inquiryDate: '2025-01-20',
    topic: '社交媒體行銷全年方案',
    requirementSummary: '客戶需要全年社交媒體管理方案，涵蓋Facebook、Instagram、小紅書，每月12篇帖文 + 每季1條短影片。',
    estimatedBudgetMin: 200000,
    estimatedBudgetMax: 350000,
    currency: 'HKD',
    pitchDate: '2025-01-25',
    assignedPm: 'u1',
    assignedPmName: '張偉明',
    status: 'initial',
    notes: '等待客戶回覆會議時間',
    nextAction: '確認第一次提案會議日期',
    followUps: [],
    lastFollowUpDate: undefined,
    createdAt: '2025-01-20',
    updatedAt: '2025-01-20',
  },
  {
    __sampleData: true,
    id: 'pitch-4',
    pitchingId: 'PTC-2025-004',
    clientName: '國泰航空',
    clientId: 'client-4',
    inquiryDate: '2025-01-05',
    topic: '活動策劃及線上推廣',
    requirementSummary: '為新航線啟動禮策劃線下發佈會 + 線上宣傳活動，預計500人規模場地。',
    estimatedBudgetMin: 300000,
    estimatedBudgetMax: 500000,
    currency: 'HKD',
    pitchDate: '2025-01-08',
    assignedPm: 'u2',
    assignedPmName: '李美珊',
    status: 'abandoned',
    notes: '客戶內部預算調整，暫時擱置此計劃。',
    nextAction: '—',
    followUps: [
      { id: 'fu-5', date: '2025-01-08', content: '初步會議，了解活動規模及需求', result: '客戶滿意方案方向', createdBy: '李美珊' },
      { id: 'fu-6', date: '2025-01-15', content: '提交詳細報價及時間表', result: '客戶表示需要內部審批', createdBy: '李美珊' },
      { id: 'fu-7', date: '2025-01-28', content: '跟進客戶決定', result: '客戶通知因預算調整暫時擱置', createdBy: '李美珊' },
    ],
    lastFollowUpDate: '2025-01-28',
    createdAt: '2025-01-05',
    updatedAt: '2025-01-28',
  },
  {
    __sampleData: true,
    id: 'pitch-5',
    pitchingId: 'PTC-2025-005',
    clientName: '新世界發展',
    clientId: 'client-5',
    inquiryDate: '2025-02-01',
    topic: 'SEO優化及Google Ads管理',
    requirementSummary: '客戶希望提升旗下3個物業網站的搜索排名，並配合Google Ads投放增加流量。預算每月$30,000。',
    estimatedBudgetMin: 30000,
    estimatedBudgetMax: 50000,
    currency: 'HKD',
    pitchDate: '2025-02-05',
    assignedPm: 'u1',
    assignedPmName: '張偉明',
    status: 'following_up',
    notes: '正在準備詳細的SEO審計報告作為提案附件',
    nextAction: '完成SEO審計報告後安排會議',
    followUps: [
      { id: 'fu-8', date: '2025-02-05', content: '初步會議，了解3個網站現狀及目標關鍵字', result: '取得網站存取權限，開始審計', createdBy: '張偉明' },
    ],
    lastFollowUpDate: '2025-02-05',
    createdAt: '2025-02-01',
    updatedAt: '2025-02-05',
  },
];
