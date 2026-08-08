/** 客戶需求記錄表（網頁與系統開發估價用｜內部 PM 填寫）— 選項與摘要生成 */

export type SiteType = 'static' | 'ecommerce' | 'custom' | 'hybrid' | 'other' | '';

export type ClientRequirementsForm = {
  filledBy: string;
  filledDate: string;
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

const todayIso = () => new Date().toISOString().slice(0, 10);

export const emptyClientRequirementsForm = (): ClientRequirementsForm => ({
  filledBy: '',
  filledDate: todayIso(),
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
  'RWD 響應式設計',
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
  '客戶已有品牌指引（Logo、主色、字體）',
  '客戶沒有，需要我們協助設計',
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
  '$15,000 以下',
  '$15,000 – $30,000',
  '$30,000 – $60,000',
  '$60,000 – $100,000+',
  '尚無明確預算，需建議報價',
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
  if (!form.filledBy.trim()) errors.push('請填寫填寫人（項目經理姓名）');
  if (!form.filledDate) errors.push('請選擇填寫日期');
  if (!form.companyName.trim()) errors.push('請填寫客戶公司／品牌名稱');
  if (!form.contactName.trim()) errors.push('請填寫客戶聯絡人');
  if (!form.contactPhone.trim()) errors.push('請填寫客戶電話／WhatsApp');
  if (!form.email.trim()) errors.push('請填寫客戶電郵');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.push('客戶電郵格式不正確');
  if (!form.businessSummary.trim()) errors.push('請填寫客戶主要業務簡述');
  if (form.projectGoals.length === 0) errors.push('請至少選擇一項專案主要目標');
  if (form.projectGoals.includes('其他') && !form.projectGoalsOther.trim()) errors.push('請填寫專案目標「其他」說明');
  if (!form.siteType) errors.push('請選擇客戶需要的網站類型');
  if (form.siteType === 'other' && !form.siteTypeOther.trim()) errors.push('請填寫網站類型「其他」說明');
  if (!form.languageSupport) errors.push('請選擇語言支援');
  if (form.languageSupport === '其他／多國語言' && !form.languageSupportOther.trim()) errors.push('請填寫語言支援「其他」說明');
  if (!form.languageSwitcher) errors.push('請選擇是否需要語言切換按鈕');
  if (!form.materialStatus) errors.push('請選擇素材狀態');
  if (form.materialStatus === '其他' && !form.materialStatusOther.trim()) errors.push('請填寫素材狀態「其他」說明');
  if (!form.brandGuidelines) errors.push('請選擇品牌指引');
  if (form.brandGuidelines === '其他' && !form.brandGuidelinesOther.trim()) errors.push('請填寫品牌指引「其他」說明');
  if (!form.budgetRange) errors.push('請選擇客戶預算範圍');
  if (!form.launchTimeline) errors.push('請選擇客戶希望上線時間');
  return errors;
}

export function generateClientRequirementsSummary(form: ClientRequirementsForm): string {
  const lines: string[] = ['【客戶需求清單】', ''];

  lines.push(`填寫人：${form.filledBy.trim()}`);
  lines.push(`填寫日期：${form.filledDate}`);
  lines.push(`客戶公司：${form.companyName.trim()}`);
  lines.push(`聯絡人：${form.contactName.trim()}`);
  lines.push(`電話／WhatsApp：${form.contactPhone.trim()}`);
  lines.push(`電郵：${form.email.trim()}`);
  if (form.existingWebsite.trim()) lines.push(`現有網站網址：${form.existingWebsite.trim()}`);
  if (form.existingEcommerceUrl.trim()) lines.push(`現有網上商城網址：${form.existingEcommerceUrl.trim()}`);
  lines.push(`主要業務簡述：${form.businessSummary.trim()}`);
  lines.push('');

  lines.push(`專案性質：${joinChecked(form.projectGoals, form.projectGoalsOther).join('、') || '—'}`);
  if (form.existingWebsite.trim()) {
    lines.push(`現有網站主要問題：${joinChecked(form.currentProblems, form.currentProblemsOther).join('、') || '—'}`);
  }
  lines.push('');

  lines.push(`網站類型：${siteTypeLabel(form.siteType, form.siteTypeOther)}`);
  lines.push('');

  const showStatic = form.siteType === 'static' || form.siteType === 'hybrid';
  const showEcommerce = form.siteType === 'ecommerce' || form.siteType === 'hybrid';
  const showCustom = form.siteType === 'custom';

  const featureLines: string[] = [];

  if (showStatic) {
    if (form.staticDesign.length) form.staticDesign.forEach((i) => featureLines.push(i));
    joinChecked(form.staticContent, form.staticContentOther).forEach((i) => featureLines.push(i));
  }
  if (showEcommerce) {
    form.ecommerceProduct.forEach((i) => featureLines.push(i));
    form.ecommerceMember.forEach((i) => featureLines.push(i));
    form.ecommercePayment.forEach((i) => featureLines.push(i));
    joinChecked(form.ecommerceMarketing, form.ecommerceMarketingOther).forEach((i) => featureLines.push(i));
  }
  if (showCustom && form.customSystemDescription.trim()) {
    featureLines.push(`客製化需求：${form.customSystemDescription.trim()}`);
  }
  joinChecked(form.commonFeatures, form.commonFeaturesOther).forEach((i) => featureLines.push(i));

  lines.push('主要功能：');
  if (featureLines.length) featureLines.forEach((i) => lines.push(`- ${i}`));
  else lines.push('- —');
  lines.push('');

  lines.push(`語系：${form.languageSupport}${form.languageSupport === '其他／多國語言' && form.languageSupportOther.trim() ? `（${form.languageSupportOther.trim()}）` : ''}｜語言切換：${form.languageSwitcher === 'yes' ? '是' : form.languageSwitcher === 'no' ? '否' : '—'}`);
  lines.push(`素材狀態：${form.materialStatus}${form.materialStatus === '其他' && form.materialStatusOther.trim() ? `（${form.materialStatusOther.trim()}）` : ''}`);
  lines.push(`品牌指引：${form.brandGuidelines}${form.brandGuidelines === '其他' && form.brandGuidelinesOther.trim() ? `（${form.brandGuidelinesOther.trim()}）` : ''}`);
  const styles = joinChecked(form.stylePreferences, form.styleOther);
  lines.push(`希望風格：${styles.join('、') || '—'}`);
  if (form.referenceUrls.trim()) lines.push(`參考網站：${form.referenceUrls.trim()}`);
  lines.push('');

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
  lines.push(`希望上線時間：${form.launchTimeline || '—'}`);
  if (form.additionalNotes.trim()) {
    lines.push('');
    lines.push(`其他備註：${form.additionalNotes.trim()}`);
  }

  return lines.join('\n');
}
