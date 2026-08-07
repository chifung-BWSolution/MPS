/** 客戶需求問卷（網頁與系統開發估價）— 選項與摘要生成 */

export type SiteType = 'static' | 'ecommerce' | 'custom' | 'hybrid' | 'other' | '';

export type ClientRequirementsForm = {
  companyName: string;
  contactName: string;
  contactPhone: string;
  email: string;
  existingWebsite: string;
  existingEcommerceUrl: string;
  businessSummary: string;
  projectGoals: string[];
  projectGoalsOther: string;
  currentProblems: string[];
  currentProblemsOther: string;
  siteType: SiteType;
  siteTypeOther: string;
  staticDesign: string[];
  staticDesignOther: string;
  staticContent: string[];
  staticContentOther: string;
  ecommerceProduct: string[];
  ecommerceMember: string[];
  ecommercePayment: string[];
  ecommerceMarketing: string[];
  ecommerceMarketingOther: string;
  customSystemDescription: string;
  commonFeatures: string[];
  commonFeaturesOther: string;
  languageSupport: string;
  languageSupportOther: string;
  languageSwitcher: 'yes' | 'no' | '';
  materialStatus: string;
  materialStatusOther: string;
  brandGuidelines: string;
  brandGuidelinesOther: string;
  stylePreferences: string[];
  styleOther: string;
  referenceUrls: string;
  maintenanceServices: string[];
  maintenanceTier: string;
  marketingServices: string[];
  marketingServicesOther: string;
  budgetRange: string;
  launchTimeline: string;
  additionalNotes: string;
};

export const emptyClientRequirementsForm = (): ClientRequirementsForm => ({
  companyName: '',
  contactName: '',
  contactPhone: '',
  email: '',
  existingWebsite: '',
  existingEcommerceUrl: '',
  businessSummary: '',
  projectGoals: [],
  projectGoalsOther: '',
  currentProblems: [],
  currentProblemsOther: '',
  siteType: '',
  siteTypeOther: '',
  staticDesign: [],
  staticDesignOther: '',
  staticContent: [],
  staticContentOther: '',
  ecommerceProduct: [],
  ecommerceMember: [],
  ecommercePayment: [],
  ecommerceMarketing: [],
  ecommerceMarketingOther: '',
  customSystemDescription: '',
  commonFeatures: [],
  commonFeaturesOther: '',
  languageSupport: '',
  languageSupportOther: '',
  languageSwitcher: '',
  materialStatus: '',
  materialStatusOther: '',
  brandGuidelines: '',
  brandGuidelinesOther: '',
  stylePreferences: [],
  styleOther: '',
  referenceUrls: '',
  maintenanceServices: [],
  maintenanceTier: '',
  marketingServices: [],
  marketingServicesOther: '',
  budgetRange: '',
  launchTimeline: '',
  additionalNotes: '',
});

export const PROJECT_GOAL_OPTIONS = [
  '全新開發網站',
  '重新設計現有網站（全面改版）',
  '網站版面與 UI/UX 優化（局部）',
  '重新設計／重建網上商城',
  '網站維護與故障排除',
  '網絡營銷與 SEO 推廣',
  '其他',
];

export const CURRENT_PROBLEM_OPTIONS = [
  '版面過時、不夠吸引',
  '手機版顯示不理想',
  '速度太慢',
  '後台無法登入／聯絡不上舊公司',
  '功能不足（沒有付款、會員、產品管理等）',
  'SEO 表現差、搜尋不到',
  '其他',
];

export const SITE_TYPE_OPTIONS: { value: SiteType; label: string }[] = [
  { value: 'static', label: 'Static Site 純內容／展示型網站' },
  { value: 'ecommerce', label: 'Ecommerce 電商網站' },
  { value: 'custom', label: '客製化 Web System／Web App' },
  { value: 'hybrid', label: '混合型（主站是內容網站 + 獨立網上商城）' },
  { value: 'other', label: '其他' },
];

export const STATIC_DESIGN_OPTIONS = [
  '品牌 UI/UX 全新視覺設計',
  '動態效果／微互動',
  'RWD 響應式設計（建議必選）',
];

export const STATIC_CONTENT_OPTIONS = [
  'Blog／文章發布系統',
  '聯絡表單 + 自動 Email 通知',
  'WhatsApp／Live Chat 快速查詢按鈕',
  'Google Maps 地圖整合',
  '基礎 SEO 搜尋引擎優化設定',
  '成功案例／作品集展示',
  '其他',
];

export const ECOMMERCE_PRODUCT_OPTIONS = [
  '基礎產品上架與分類',
  '變體規格管理（顏色、尺寸、容量等）',
  '庫存管理與低庫存提示',
  '數位商品下載',
];

export const ECOMMERCE_MEMBER_OPTIONS = [
  '電郵／手機號碼註冊登入',
  '第三方快速登入（Google／Facebook／Apple）',
  '會員等級與專屬折扣',
  '訂單紀錄與追蹤',
];

export const ECOMMERCE_PAYMENT_OPTIONS = [
  '香港在地金流（PayMe／FPS／AlipayHK／WeChat Pay）',
  '信用卡線上刷卡',
  '物流運費計算（順豐 API／自提點／滿額免運）',
  '銀行轉帳手動確認',
];

export const ECOMMERCE_MARKETING_OPTIONS = [
  '折扣碼／優惠券系統',
  '滿額贈／加價購',
  '自動化 Email（購物車未結帳提醒等）',
  'Blog／專欄文章系統',
  '其他',
];

export const COMMON_FEATURE_OPTIONS = [
  '後台內容管理系統（CMS）',
  'Google Analytics／數據追蹤',
  '其他',
];

export const LANGUAGE_OPTIONS = [
  '單一語言（繁體中文）',
  '雙語（繁體中文 + 英文）',
  '三語（繁體中文 + 簡體中文 + 英文）',
  '其他／多國語言',
];

export const MATERIAL_OPTIONS = [
  '客戶自行提供所有文案與圖片',
  '需要我們協助 UI/UX 設計與圖片美化',
  '需要我們提供文案撰寫／攝影服務',
  '其他',
];

export const BRAND_GUIDELINE_OPTIONS = [
  '有（請提供檔案）',
  '沒有，需要我們協助設計',
  '其他',
];

export const STYLE_OPTIONS = ['簡約現代', '高級奢華', '活潑年輕', '專業穩重', '其他'];

export const MAINTENANCE_OPTIONS = [
  '網站託管與 Domain 代管',
  '定期備份與安全性更新',
  '內容定期更新（每月固定工時）',
  '技術支援與故障緊急排障',
  '分級方案：基本／標準／進階',
  '暫時不需要',
];

export const MAINTENANCE_TIER_OPTIONS = ['基本', '標準', '進階'];

export const MARKETING_OPTIONS = [
  'Google 廣告',
  'Facebook／Instagram 廣告',
  'SEO 持續優化',
  '其他',
];

export const BUDGET_OPTIONS = [
  '$15,000 以下（極簡展示型）',
  '$15,000 – $30,000（標準展示型／基礎電商）',
  '$30,000 – $60,000（客製化電商／多功能）',
  '$60,000 – $100,000+（大型企業／複雜 Web System）',
  '尚無概念，希望先取得建議報價',
];

export const TIMELINE_OPTIONS = [
  '急件（1 個月內）',
  '標準時程（1–2 個月）',
  '充裕（3 個月以上）',
  '尚未確定',
];

function joinChecked(items: string[], other?: string, otherLabel = '其他'): string[] {
  const out = items.filter((i) => i !== otherLabel);
  if (items.includes(otherLabel) && other?.trim()) out.push(`${otherLabel}：${other.trim()}`);
  else if (items.includes(otherLabel)) out.push(otherLabel);
  return out;
}

function siteTypeLabel(type: SiteType, other?: string): string {
  const found = SITE_TYPE_OPTIONS.find((o) => o.value === type);
  if (type === 'other' && other?.trim()) return `其他：${other.trim()}`;
  return found?.label || '—';
}

export function validateClientRequirementsForm(form: ClientRequirementsForm): string[] {
  const errors: string[] = [];
  if (!form.companyName.trim()) errors.push('請填寫公司／品牌名稱');
  if (!form.contactName.trim()) errors.push('請填寫聯絡人姓名');
  if (!form.contactPhone.trim()) errors.push('請填寫聯絡電話／WhatsApp');
  if (!form.email.trim()) errors.push('請填寫電郵');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.push('電郵格式不正確');
  if (!form.businessSummary.trim()) errors.push('請填寫主要業務簡述');
  if (form.projectGoals.length === 0) errors.push('請至少選擇一項專案主要目標');
  if (form.projectGoals.includes('其他') && !form.projectGoalsOther.trim()) errors.push('請填寫專案目標「其他」說明');
  if (!form.siteType) errors.push('請選擇主要網站類型');
  if (form.siteType === 'other' && !form.siteTypeOther.trim()) errors.push('請填寫網站類型「其他」說明');
  if (!form.languageSupport) errors.push('請選擇語言支援');
  if (form.languageSupport === '其他／多國語言' && !form.languageSupportOther.trim()) errors.push('請填寫語言支援「其他」說明');
  if (!form.languageSwitcher) errors.push('請選擇是否需要語言切換按鈕');
  if (!form.materialStatus) errors.push('請選擇素材狀態');
  if (form.materialStatus === '其他' && !form.materialStatusOther.trim()) errors.push('請填寫素材狀態「其他」說明');
  if (!form.brandGuidelines) errors.push('請選擇品牌指引');
  if (!form.budgetRange) errors.push('請選擇預算範圍');
  if (!form.launchTimeline) errors.push('請選擇預計上線時間');
  return errors;
}

export function generateClientRequirementsSummary(form: ClientRequirementsForm): string {
  const lines: string[] = ['【客戶需求清單】', ''];

  lines.push('── 基本資訊 ──');
  lines.push(`公司／品牌名稱：${form.companyName.trim()}`);
  lines.push(`聯絡人姓名：${form.contactName.trim()}`);
  lines.push(`聯絡電話／WhatsApp：${form.contactPhone.trim()}`);
  lines.push(`電郵：${form.email.trim()}`);
  if (form.existingWebsite.trim()) lines.push(`現有網站網址：${form.existingWebsite.trim()}`);
  if (form.existingEcommerceUrl.trim()) lines.push(`現有網上商城網址：${form.existingEcommerceUrl.trim()}`);
  lines.push(`主要業務簡述：${form.businessSummary.trim()}`);
  lines.push('');

  lines.push('── 專案性質與現有狀況 ──');
  lines.push(`專案主要目標：${joinChecked(form.projectGoals, form.projectGoalsOther).join('、') || '—'}`);
  if (form.existingWebsite.trim()) {
    lines.push(`目前最大問題：${joinChecked(form.currentProblems, form.currentProblemsOther).join('、') || '—'}`);
  }
  lines.push('');

  lines.push('── 網站類型 ──');
  lines.push(`主要網站類型：${siteTypeLabel(form.siteType, form.siteTypeOther)}`);
  lines.push('');

  const showStatic = form.siteType === 'static' || form.siteType === 'hybrid';
  const showEcommerce = form.siteType === 'ecommerce' || form.siteType === 'hybrid';
  const showCustom = form.siteType === 'custom';

  if (showStatic || showEcommerce || showCustom || form.commonFeatures.length) {
    lines.push('── 功能需求 ──');
  }

  if (showStatic) {
    lines.push('【Static Site 功能】');
    if (form.staticDesign.length) {
      lines.push('  設計與體驗：');
      form.staticDesign.forEach((i) => lines.push(`    - ${i}`));
    }
    const content = joinChecked(form.staticContent, form.staticContentOther);
    if (content.length) {
      lines.push('  內容與行銷：');
      content.forEach((i) => lines.push(`    - ${i}`));
    }
  }

  if (showEcommerce) {
    lines.push('【Ecommerce 功能】');
    if (form.ecommerceProduct.length) {
      lines.push('  產品管理：');
      form.ecommerceProduct.forEach((i) => lines.push(`    - ${i}`));
    }
    if (form.ecommerceMember.length) {
      lines.push('  會員與客戶：');
      form.ecommerceMember.forEach((i) => lines.push(`    - ${i}`));
    }
    if (form.ecommercePayment.length) {
      lines.push('  金流與物流：');
      form.ecommercePayment.forEach((i) => lines.push(`    - ${i}`));
    }
    const marketing = joinChecked(form.ecommerceMarketing, form.ecommerceMarketingOther);
    if (marketing.length) {
      lines.push('  行銷與促銷：');
      marketing.forEach((i) => lines.push(`    - ${i}`));
    }
  }

  if (showCustom && form.customSystemDescription.trim()) {
    lines.push('【客製化 Web System】');
    lines.push(`  ${form.customSystemDescription.trim()}`);
  }

  const common = joinChecked(form.commonFeatures, form.commonFeaturesOther);
  if (common.length) {
    lines.push('【共通功能】');
    common.forEach((i) => lines.push(`  - ${i}`));
  }
  lines.push('');

  lines.push('── 語系、素材與設計 ──');
  lines.push(`語言支援：${form.languageSupport}${form.languageSupport === '其他／多國語言' && form.languageSupportOther.trim() ? `（${form.languageSupportOther.trim()}）` : ''}`);
  lines.push(`語言切換按鈕：${form.languageSwitcher === 'yes' ? '是' : form.languageSwitcher === 'no' ? '否' : '—'}`);
  lines.push(`素材狀態：${form.materialStatus}${form.materialStatus === '其他' && form.materialStatusOther.trim() ? `（${form.materialStatusOther.trim()}）` : ''}`);
  lines.push(`品牌指引：${form.brandGuidelines}`);
  const styles = joinChecked(form.stylePreferences, form.styleOther);
  lines.push(`希望風格：${styles.join('、') || '—'}`);
  if (form.referenceUrls.trim()) lines.push(`參考網站網址：${form.referenceUrls.trim()}`);
  lines.push('');

  lines.push('── 維護、推廣、預算、時程 ──');
  if (form.maintenanceServices.length) {
    const maint = form.maintenanceServices.map((m) =>
      m === '分級方案：基本／標準／進階' && form.maintenanceTier
        ? `${m}（${form.maintenanceTier}）`
        : m,
    );
    lines.push(`全年維護服務：${maint.join('、')}`);
  }
  const marketingSvc = joinChecked(form.marketingServices, form.marketingServicesOther);
  if (marketingSvc.length) lines.push(`網上推廣服務：${marketingSvc.join('、')}`);
  lines.push(`預算範圍：${form.budgetRange || '—'}`);
  lines.push(`預計上線時間：${form.launchTimeline || '—'}`);
  if (form.additionalNotes.trim()) {
    lines.push('');
    lines.push(`其他特別要求：${form.additionalNotes.trim()}`);
  }

  return lines.join('\n');
}
