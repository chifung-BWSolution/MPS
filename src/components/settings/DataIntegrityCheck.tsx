import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useDataStore } from '@/context/DataStore';
import { companies, brands, yearPlans, projects as mockProjects } from '@/data/mockData';
import { dailyReports } from '@/data/dayReportData';
import { dailyReportsV2 } from '@/data/dayReportDataV2';
import { quotationEntries, clientProjects as quotClientProjects } from '@/data/quotationData';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Database,
  Link2,
  FileWarning,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';

// ===== Types =====
type Severity = 'pass' | 'warning' | 'error';

interface CheckResult {
  id: string;
  module: string;
  checkName: string;
  severity: Severity;
  message: string;
  details?: string[];
  affectedCount: number;
  totalCount: number;
}

interface ModuleCheckGroup {
  module: string;
  icon: string;
  checks: CheckResult[];
  passCount: number;
  warnCount: number;
  errorCount: number;
}

// ===== Component =====
export function DataIntegrityCheck() {
  const dataStore = useDataStore();
  const [results, setResults] = useState<ModuleCheckGroup[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRunTime, setLastRunTime] = useState<Date | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const toggleModule = (module: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  };

  const runIntegrityChecks = useCallback(() => {
    setIsRunning(true);

    // Simulate async scan
    setTimeout(() => {
      const allChecks: CheckResult[] = [];

      // ===== 1. Company Checks =====
      // Check: All companies have required fields
      const companyMissingFields = companies.filter(c => !c.companyCode || !c.companyNameZh || !c.brNo);
      allChecks.push({
        id: 'company-required-fields',
        module: '公司管理',
        checkName: '必填欄位完整性',
        severity: companyMissingFields.length > 0 ? 'error' : 'pass',
        message: companyMissingFields.length > 0
          ? `${companyMissingFields.length} 間公司缺少必填資料（公司代碼/中文名稱/BR No.）`
          : '所有公司必填欄位均已填寫',
        details: companyMissingFields.map(c => `${c.companyNameZh || c.id} — 缺少: ${[!c.companyCode && '公司代碼', !c.companyNameZh && '中文名稱', !c.brNo && 'BR No.'].filter(Boolean).join(', ')}`),
        affectedCount: companyMissingFields.length,
        totalCount: companies.length,
      });

      // ===== 2. Brand Checks =====
      // Check: All brands reference valid company
      const brandOrphans = brands.filter(b => !companies.find(c => c.uuid === b.companyId || c.id === b.companyId));
      allChecks.push({
        id: 'brand-company-fk',
        module: '品牌管理',
        checkName: '品牌→公司 外鍵關聯',
        severity: brandOrphans.length > 0 ? 'error' : 'pass',
        message: brandOrphans.length > 0
          ? `${brandOrphans.length} 個品牌找不到對應的公司記錄`
          : '所有品牌均正確關聯到公司',
        details: brandOrphans.map(b => `${b.displayName} (ID: ${b.id}) → 公司 ID: ${b.companyId} [不存在]`),
        affectedCount: brandOrphans.length,
        totalCount: brands.length,
      });

      // Check: Brand required fields
      const brandMissing = brands.filter(b => !b.brandCode || !b.displayName);
      allChecks.push({
        id: 'brand-required-fields',
        module: '品牌管理',
        checkName: '必填欄位完整性',
        severity: brandMissing.length > 0 ? 'warning' : 'pass',
        message: brandMissing.length > 0
          ? `${brandMissing.length} 個品牌缺少必填欄位`
          : '所有品牌必填欄位均已填寫',
        affectedCount: brandMissing.length,
        totalCount: brands.length,
      });

      // ===== 3. Project Checks =====
      // Mock projects remain in mockData for legacy integrity checks; live projects use Supabase.
      const projects = mockProjects;

      // Check: Projects reference valid company
      const projectCompanyOrphans = projects.filter(p => !companies.find(c => c.id === p.companyId));
      allChecks.push({
        id: 'project-company-fk',
        module: '專案管理',
        checkName: '項目→公司 外鍵關聯',
        severity: projectCompanyOrphans.length > 0 ? 'error' : 'pass',
        message: projectCompanyOrphans.length > 0
          ? `${projectCompanyOrphans.length} 個項目找不到對應的公司`
          : '所有項目均正確關聯到公司',
        details: projectCompanyOrphans.map(p => `${p.name} → 公司 ID: ${p.companyId} [不存在]`),
        affectedCount: projectCompanyOrphans.length,
        totalCount: projects.length,
      });

      // Check: Projects reference valid brand
      const projectBrandOrphans = projects.filter(p => !brands.find(b => b.id === p.brandId));
      allChecks.push({
        id: 'project-brand-fk',
        module: '專案管理',
        checkName: '項目→品牌 外鍵關聯',
        severity: projectBrandOrphans.length > 0 ? 'error' : 'pass',
        message: projectBrandOrphans.length > 0
          ? `${projectBrandOrphans.length} 個項目找不到對應的品牌`
          : '所有項目均正確關聯到品牌',
        details: projectBrandOrphans.map(p => `${p.name} → 品牌 ID: ${p.brandId} [不存在]`),
        affectedCount: projectBrandOrphans.length,
        totalCount: projects.length,
      });

      // Check: Brand belongs to same company as project
      const projectBrandMismatch = projects.filter(p => {
        const brand = brands.find(b => b.id === p.brandId);
        return brand && brand.companyId !== p.companyId;
      });
      allChecks.push({
        id: 'project-brand-company-mismatch',
        module: '專案管理',
        checkName: '項目品牌與公司一致性',
        severity: projectBrandMismatch.length > 0 ? 'error' : 'pass',
        message: projectBrandMismatch.length > 0
          ? `${projectBrandMismatch.length} 個項目的品牌不屬於其選定的公司`
          : '所有項目的品牌均屬於正確公司',
        details: projectBrandMismatch.map(p => {
          const brand = brands.find(b => b.id === p.brandId);
          return `${p.name}: 品牌 "${brand?.displayName}" 屬於公司 "${brand?.companyId}", 但項目指定公司 "${p.companyId}"`;
        }),
        affectedCount: projectBrandMismatch.length,
        totalCount: projects.length,
      });

      // Check: Project date logic
      const projectDateErrors = projects.filter(p => p.endDate && new Date(p.startDate) > new Date(p.endDate));
      allChecks.push({
        id: 'project-date-logic',
        module: '專案管理',
        checkName: '日期邏輯驗證',
        severity: projectDateErrors.length > 0 ? 'warning' : 'pass',
        message: projectDateErrors.length > 0
          ? `${projectDateErrors.length} 個項目的開始日期晚於結束日期`
          : '所有項目日期邏輯正確',
        details: projectDateErrors.map(p => `${p.name}: 開始 ${p.startDate} > 結束 ${p.endDate}`),
        affectedCount: projectDateErrors.length,
        totalCount: projects.length,
      });

      // ===== 4. Website Checks =====
      const { websites } = dataStore;

      // Check: Websites reference valid project
      const websiteProjectOrphans = websites.filter(w => !projects.find(p => p.id === w.projectId));
      allChecks.push({
        id: 'website-project-fk',
        module: '網站管理',
        checkName: '網站→項目 外鍵關聯',
        severity: websiteProjectOrphans.length > 0 ? 'error' : 'pass',
        message: websiteProjectOrphans.length > 0
          ? `${websiteProjectOrphans.length} 個網站找不到對應的項目`
          : '所有網站均正確關聯到項目',
        details: websiteProjectOrphans.map(w => `${w.websiteName} → 項目 ID: ${w.projectId} [不存在]`),
        affectedCount: websiteProjectOrphans.length,
        totalCount: websites.length,
      });

      // Check: Website company matches project company
      const websiteCompanyMismatch = websites.filter(w => {
        const project = projects.find(p => p.id === w.projectId);
        return project && w.companyId && w.companyId !== project.companyId;
      });
      allChecks.push({
        id: 'website-company-mismatch',
        module: '網站管理',
        checkName: '網站公司與項目公司一致性',
        severity: websiteCompanyMismatch.length > 0 ? 'warning' : 'pass',
        message: websiteCompanyMismatch.length > 0
          ? `${websiteCompanyMismatch.length} 個網站的公司 ID 與其項目的公司不一致`
          : '所有網站公司歸屬一致',
        affectedCount: websiteCompanyMismatch.length,
        totalCount: websites.length,
      });

      // ===== 5. Video Checks =====
      const { videos, videoChannels } = dataStore;
      const allVideos = Object.entries(videos).flatMap(([wsId, vids]) => vids.map(v => ({ ...v, _websiteId: wsId })));

      // Check: Videos in valid websites
      const videoWebsiteOrphans = Object.keys(videos).filter(wsId => !websites.find(w => w.id === wsId));
      allChecks.push({
        id: 'video-website-fk',
        module: '影片管理',
        checkName: '影片→網站 外鍵關聯',
        severity: videoWebsiteOrphans.length > 0 ? 'warning' : 'pass',
        message: videoWebsiteOrphans.length > 0
          ? `${videoWebsiteOrphans.length} 個網站 ID 下的影片找不到對應網站`
          : '所有影片的網站關聯正確',
        details: videoWebsiteOrphans.map(wsId => `網站 ID: ${wsId} [不存在] — 含 ${videos[wsId]?.length || 0} 部影片`),
        affectedCount: videoWebsiteOrphans.length,
        totalCount: Object.keys(videos).length,
      });

      // Check: Video channel references
      const videosWithInvalidChannel = allVideos.filter(v => v.videoChannelId && !videoChannels.find(vc => vc.id === v.videoChannelId));
      allChecks.push({
        id: 'video-channel-fk',
        module: '影片管理',
        checkName: '影片→頻道 外鍵關聯',
        severity: videosWithInvalidChannel.length > 0 ? 'warning' : 'pass',
        message: videosWithInvalidChannel.length > 0
          ? `${videosWithInvalidChannel.length} 部影片引用了不存在的頻道`
          : '所有影片頻道關聯正確',
        affectedCount: videosWithInvalidChannel.length,
        totalCount: allVideos.length,
      });

      // ===== 6. Social Posts Checks =====
      const { socialPosts } = dataStore;
      const socialPostWebsiteOrphans = Object.keys(socialPosts).filter(wsId => !websites.find(w => w.id === wsId));
      allChecks.push({
        id: 'social-website-fk',
        module: '社交媒體',
        checkName: '社交帖文→網站 外鍵關聯',
        severity: socialPostWebsiteOrphans.length > 0 ? 'warning' : 'pass',
        message: socialPostWebsiteOrphans.length > 0
          ? `${socialPostWebsiteOrphans.length} 個網站 ID 下的帖文找不到對應網站`
          : '所有社交帖文的網站關聯正確',
        affectedCount: socialPostWebsiteOrphans.length,
        totalCount: Object.keys(socialPosts).length,
      });

      // ===== 7. Paid Ads Checks =====
      const { paidAds } = dataStore;
      const adsWebsiteOrphans = Object.keys(paidAds).filter(wsId => !websites.find(w => w.id === wsId));
      allChecks.push({
        id: 'ads-website-fk',
        module: '付費廣告',
        checkName: '廣告→網站 外鍵關聯',
        severity: adsWebsiteOrphans.length > 0 ? 'warning' : 'pass',
        message: adsWebsiteOrphans.length > 0
          ? `${adsWebsiteOrphans.length} 個網站 ID 下的廣告找不到對應網站`
          : '所有廣告的網站關聯正確',
        affectedCount: adsWebsiteOrphans.length,
        totalCount: Object.keys(paidAds).length,
      });

      // ===== 8. SEO Keywords Checks =====
      const { seoKeywords } = dataStore;
      const seoWebsiteOrphans = Object.keys(seoKeywords).filter(wsId => !websites.find(w => w.id === wsId));
      allChecks.push({
        id: 'seo-website-fk',
        module: 'SEO 關鍵字',
        checkName: '關鍵字→網站 外鍵關聯',
        severity: seoWebsiteOrphans.length > 0 ? 'warning' : 'pass',
        message: seoWebsiteOrphans.length > 0
          ? `${seoWebsiteOrphans.length} 個網站 ID 下的關鍵字找不到對應網站`
          : '所有 SEO 關鍵字的網站關聯正確',
        affectedCount: seoWebsiteOrphans.length,
        totalCount: Object.keys(seoKeywords).length,
      });

      // ===== 9. EDM Checks =====
      const { edmCampaigns } = dataStore;
      const edmWebsiteOrphans = Object.keys(edmCampaigns).filter(wsId => !websites.find(w => w.id === wsId));
      allChecks.push({
        id: 'edm-website-fk',
        module: 'EDM 管理',
        checkName: 'EDM→網站 外鍵關聯',
        severity: edmWebsiteOrphans.length > 0 ? 'warning' : 'pass',
        message: edmWebsiteOrphans.length > 0
          ? `${edmWebsiteOrphans.length} 個網站 ID 下的 EDM 找不到對應網站`
          : '所有 EDM 活動的網站關聯正確',
        affectedCount: edmWebsiteOrphans.length,
        totalCount: Object.keys(edmCampaigns).length,
      });

      // ===== 10. Supplier Checks =====
      const { suppliers } = dataStore;
      const suppliersMissingFields = suppliers.filter(s => !s.name || !s.category);
      allChecks.push({
        id: 'supplier-required-fields',
        module: '供應商',
        checkName: '必填欄位完整性',
        severity: suppliersMissingFields.length > 0 ? 'warning' : 'pass',
        message: suppliersMissingFields.length > 0
          ? `${suppliersMissingFields.length} 個供應商缺少必填欄位`
          : '所有供應商資料完整',
        affectedCount: suppliersMissingFields.length,
        totalCount: suppliers.length,
      });

      // ===== 11. 工作匯報 → 網站 Cross Check =====
      const allDayReportEntries = dailyReports.flatMap(r => r.entries);
      const allDayReportEntriesV2 = dailyReportsV2.flatMap(r => r.entries);

      // V1: Day report entries referencing invalid websites
      const dayReportWebsiteOrphansV1 = allDayReportEntries.filter(
        e => e.relatedId && e.relatedId.startsWith('ws') && !websites.find(w => w.id === e.relatedId)
      );
      allChecks.push({
        id: 'dayreport-v1-website-fk',
        module: '工作匯報',
        checkName: '工作記錄→網站 外鍵關聯 (V1)',
        severity: dayReportWebsiteOrphansV1.length > 0 ? 'error' : 'pass',
        message: dayReportWebsiteOrphansV1.length > 0
          ? `${dayReportWebsiteOrphansV1.length} 條 V1 工作記錄引用了不存在的網站`
          : '所有 V1 工作記錄的網站關聯正確',
        details: dayReportWebsiteOrphansV1.map(e => `「${e.title}」→ 網站 ID: ${e.relatedId} [不存在]`),
        affectedCount: dayReportWebsiteOrphansV1.length,
        totalCount: allDayReportEntries.filter(e => e.relatedId?.startsWith('ws')).length,
      });

      // V2: Day report entries referencing invalid websites
      const dayReportWebsiteOrphansV2 = allDayReportEntriesV2.filter(
        e => e.relatedType === 'website' && e.relatedId && !websites.find(w => w.id === e.relatedId)
      );
      allChecks.push({
        id: 'dayreport-v2-website-fk',
        module: '工作匯報',
        checkName: '工作記錄→網站 外鍵關聯 (V2)',
        severity: dayReportWebsiteOrphansV2.length > 0 ? 'error' : 'pass',
        message: dayReportWebsiteOrphansV2.length > 0
          ? `${dayReportWebsiteOrphansV2.length} 條 V2 工作記錄引用了不存在的網站`
          : '所有 V2 工作記錄的網站關聯正確',
        details: dayReportWebsiteOrphansV2.map(e => `「${e.title}」→ 網站 ID: ${e.relatedId} [不存在]`),
        affectedCount: dayReportWebsiteOrphansV2.length,
        totalCount: allDayReportEntriesV2.filter(e => e.relatedType === 'website').length,
      });

      // V2: Day report entries referencing invalid projects
      const dayReportProjectOrphansV2 = allDayReportEntriesV2.filter(
        e => e.relatedType === 'project' && e.relatedId && !projects.find(p => p.id === e.relatedId)
      );
      allChecks.push({
        id: 'dayreport-v2-project-fk',
        module: '工作匯報',
        checkName: '工作記錄→項目 外鍵關聯 (V2)',
        severity: dayReportProjectOrphansV2.length > 0 ? 'error' : 'pass',
        message: dayReportProjectOrphansV2.length > 0
          ? `${dayReportProjectOrphansV2.length} 條 V2 工作記錄引用了不存在的項目`
          : '所有 V2 工作記錄的項目關聯正確',
        details: dayReportProjectOrphansV2.map(e => `「${e.title}」→ 項目 ID: ${e.relatedId} [不存在]`),
        affectedCount: dayReportProjectOrphansV2.length,
        totalCount: allDayReportEntriesV2.filter(e => e.relatedType === 'project').length,
      });

      // Day report website name consistency
      const dayReportNameMismatch = allDayReportEntriesV2.filter(e => {
        if (e.relatedType !== 'website' || !e.relatedId) return false;
        const ws = websites.find(w => w.id === e.relatedId);
        return ws && e.relatedName && ws.websiteName !== e.relatedName;
      });
      allChecks.push({
        id: 'dayreport-website-name-sync',
        module: '工作匯報',
        checkName: '工作記錄網站名稱一致性',
        severity: dayReportNameMismatch.length > 0 ? 'warning' : 'pass',
        message: dayReportNameMismatch.length > 0
          ? `${dayReportNameMismatch.length} 條工作記錄的網站名稱與主資料不一致（可能因重命名導致）`
          : '所有工作記錄的網站名稱一致',
        details: dayReportNameMismatch.map(e => {
          const ws = websites.find(w => w.id === e.relatedId);
          return `「${e.title}」顯示: "${e.relatedName}", 主資料: "${ws?.websiteName}"`;
        }),
        affectedCount: dayReportNameMismatch.length,
        totalCount: allDayReportEntriesV2.filter(e => e.relatedType === 'website').length,
      });

      // ===== 12. 客戶報價 → 公司/品牌 Cross Check =====
      // Quotation company FK
      const quotCompanyOrphans = quotationEntries.filter(q => !companies.find(c => c.id === q.companyId));
      allChecks.push({
        id: 'quotation-company-fk',
        module: '客戶報價',
        checkName: '報價→公司 外鍵關聯',
        severity: quotCompanyOrphans.length > 0 ? 'error' : 'pass',
        message: quotCompanyOrphans.length > 0
          ? `${quotCompanyOrphans.length} 份報價引用了不存在的公司`
          : '所有報價的公司關聯正確',
        details: quotCompanyOrphans.map(q => `${q.quoteId} (${q.client}) → 公司 ID: ${q.companyId} [不存在]`),
        affectedCount: quotCompanyOrphans.length,
        totalCount: quotationEntries.length,
      });

      // Quotation brand FK
      const quotBrandOrphans = quotationEntries.filter(q => !brands.find(b => b.id === q.brandId));
      allChecks.push({
        id: 'quotation-brand-fk',
        module: '客戶報價',
        checkName: '報價→品牌 外鍵關聯',
        severity: quotBrandOrphans.length > 0 ? 'error' : 'pass',
        message: quotBrandOrphans.length > 0
          ? `${quotBrandOrphans.length} 份報價引用了不存在的品牌`
          : '所有報價的品牌關聯正確',
        details: quotBrandOrphans.map(q => `${q.quoteId} → 品牌 ID: ${q.brandId} [不存在]`),
        affectedCount: quotBrandOrphans.length,
        totalCount: quotationEntries.length,
      });

      // Quotation brand-company mismatch
      const quotBrandCompanyMismatch = quotationEntries.filter(q => {
        const brand = brands.find(b => b.id === q.brandId);
        return brand && brand.companyId !== q.companyId;
      });
      allChecks.push({
        id: 'quotation-brand-company-mismatch',
        module: '客戶報價',
        checkName: '報價品牌與公司一致性',
        severity: quotBrandCompanyMismatch.length > 0 ? 'error' : 'pass',
        message: quotBrandCompanyMismatch.length > 0
          ? `${quotBrandCompanyMismatch.length} 份報價的品牌不屬於其選定的公司`
          : '所有報價的品牌均屬於正確公司',
        details: quotBrandCompanyMismatch.map(q => {
          const brand = brands.find(b => b.id === q.brandId);
          return `${q.quoteId}: 品牌 "${brand?.displayName}" 屬於 "${brand?.companyId}", 但報價公司為 "${q.companyId}"`;
        }),
        affectedCount: quotBrandCompanyMismatch.length,
        totalCount: quotationEntries.length,
      });

      // Client projects from quotation - company/brand check
      const cpOrphans = quotClientProjects.filter(cp => !companies.find(c => c.id === cp.companyId) || !brands.find(b => b.id === cp.brandId));
      allChecks.push({
        id: 'client-project-fk',
        module: '客戶報價',
        checkName: '客戶項目→公司/品牌 外鍵關聯',
        severity: cpOrphans.length > 0 ? 'error' : 'pass',
        message: cpOrphans.length > 0
          ? `${cpOrphans.length} 個客戶項目引用了無效的公司或品牌`
          : '所有客戶項目的公司/品牌關聯正確',
        details: cpOrphans.map(cp => `${cp.clientName} (${cp.quoteId}) → C:${cp.companyId} B:${cp.brandId}`),
        affectedCount: cpOrphans.length,
        totalCount: quotClientProjects.length,
      });

      // ===== 13. 規劃中心 → 公司/品牌 Cross Check =====
      const yearPlanCompanyOrphans = yearPlans.filter(yp => !companies.find(c => c.id === yp.companyId));
      allChecks.push({
        id: 'yearplan-company-fk',
        module: '規劃中心',
        checkName: '年度計劃→公司 外鍵關聯',
        severity: yearPlanCompanyOrphans.length > 0 ? 'error' : 'pass',
        message: yearPlanCompanyOrphans.length > 0
          ? `${yearPlanCompanyOrphans.length} 個年度計劃引用了不存在的公司`
          : '所有年度計劃的公司關聯正確',
        details: yearPlanCompanyOrphans.map(yp => `${yp.year} 年計劃 → 公司 ID: ${yp.companyId} [不存在]`),
        affectedCount: yearPlanCompanyOrphans.length,
        totalCount: yearPlans.length,
      });

      const yearPlanBrandOrphans = yearPlans.filter(yp => !brands.find(b => b.id === yp.brandId));
      allChecks.push({
        id: 'yearplan-brand-fk',
        module: '規劃中心',
        checkName: '年度計劃→品牌 外鍵關聯',
        severity: yearPlanBrandOrphans.length > 0 ? 'error' : 'pass',
        message: yearPlanBrandOrphans.length > 0
          ? `${yearPlanBrandOrphans.length} 個年度計劃引用了不存在的品牌`
          : '所有年度計劃的品牌關聯正確',
        details: yearPlanBrandOrphans.map(yp => `${yp.year} 年計劃 → 品牌 ID: ${yp.brandId} [不存在]`),
        affectedCount: yearPlanBrandOrphans.length,
        totalCount: yearPlans.length,
      });

      const yearPlanBrandCompanyMismatch = yearPlans.filter(yp => {
        const brand = brands.find(b => b.id === yp.brandId);
        return brand && brand.companyId !== yp.companyId;
      });
      allChecks.push({
        id: 'yearplan-brand-company-mismatch',
        module: '規劃中心',
        checkName: '年度計劃品牌與公司一致性',
        severity: yearPlanBrandCompanyMismatch.length > 0 ? 'error' : 'pass',
        message: yearPlanBrandCompanyMismatch.length > 0
          ? `${yearPlanBrandCompanyMismatch.length} 個年度計劃的品牌不屬於其選定公司`
          : '所有年度計劃的品牌歸屬正確',
        affectedCount: yearPlanBrandCompanyMismatch.length,
        totalCount: yearPlans.length,
      });

      // ===== 14. 行銷管理 → 網站 Content Counts Sync =====
      // Check: Website articlesCount vs actual articles linked
      const socialPostTotalPerWebsite = websites.map(w => {
        const actualSocial = socialPosts[w.id]?.length || 0;
        return { ws: w, actual: actualSocial, stored: w.socialPostsCount || 0 };
      }).filter(x => x.stored !== x.actual && x.stored > 0);
      allChecks.push({
        id: 'marketing-social-count-sync',
        module: '行銷管理',
        checkName: '網站社交帖文計數同步',
        severity: socialPostTotalPerWebsite.length > 0 ? 'warning' : 'pass',
        message: socialPostTotalPerWebsite.length > 0
          ? `${socialPostTotalPerWebsite.length} 個網站的社交帖文計數與實際不一致`
          : '所有網站社交帖文計數正確',
        details: socialPostTotalPerWebsite.map(x => `${x.ws.websiteName}: 顯示 ${x.stored} 篇, 實際 ${x.actual} 篇`),
        affectedCount: socialPostTotalPerWebsite.length,
        totalCount: websites.length,
      });

      // Check: Social posts platform field consistency
      const allSocialFlat = Object.values(socialPosts).flat();
      const socialMissingPlatforms = allSocialFlat.filter(p => !p.platforms || p.platforms.length === 0);
      allChecks.push({
        id: 'marketing-social-platforms',
        module: '行銷管理',
        checkName: '社交帖文平台欄位完整性',
        severity: socialMissingPlatforms.length > 0 ? 'warning' : 'pass',
        message: socialMissingPlatforms.length > 0
          ? `${socialMissingPlatforms.length} 條社交帖文缺少平台選擇`
          : '所有社交帖文均指定了投放平台',
        affectedCount: socialMissingPlatforms.length,
        totalCount: allSocialFlat.length,
      });

      // ===== 15. 影片製作 → 網站/頻道 Cross Check =====
      // Videos per website count sync
      const videoCountPerWebsite = websites.map(w => {
        const actualVideos = videos[w.id]?.length || 0;
        return { ws: w, actual: actualVideos, stored: w.videosCount || 0 };
      }).filter(x => x.stored !== x.actual && x.stored > 0);
      allChecks.push({
        id: 'video-count-sync',
        module: '影片製作',
        checkName: '網站影片計數同步',
        severity: videoCountPerWebsite.length > 0 ? 'warning' : 'pass',
        message: videoCountPerWebsite.length > 0
          ? `${videoCountPerWebsite.length} 個網站的影片計數與實際不一致`
          : '所有網站影片計數正確',
        details: videoCountPerWebsite.map(x => `${x.ws.websiteName}: 顯示 ${x.stored} 部, 實際 ${x.actual} 部`),
        affectedCount: videoCountPerWebsite.length,
        totalCount: websites.length,
      });

      // Video channel brand references
      const videoChannelBrandOrphans = videoChannels.filter(vc => {
        if (!vc.brand) return false;
        return !brands.find(b => b.brandCode === vc.brand);
      });
      allChecks.push({
        id: 'video-channel-brand',
        module: '影片製作',
        checkName: '影片頻道品牌代碼一致性',
        severity: videoChannelBrandOrphans.length > 0 ? 'warning' : 'pass',
        message: videoChannelBrandOrphans.length > 0
          ? `${videoChannelBrandOrphans.length} 個影片頻道引用了不存在的品牌代碼`
          : '所有影片頻道品牌代碼正確',
        details: videoChannelBrandOrphans.map(vc => `${vc.internalName} → 品牌代碼: "${vc.brand}" [不存在]`),
        affectedCount: videoChannelBrandOrphans.length,
        totalCount: videoChannels.length,
      });

      // ===== 16. 網站→公司/品牌 FK Consistency =====
      const websiteCompanyOrphans = websites.filter(w => w.companyId && !companies.find(c => c.uuid === w.companyId || c.id === w.companyId));
      allChecks.push({
        id: 'website-company-fk',
        module: '網站管理',
        checkName: '網站→公司 外鍵關聯',
        severity: websiteCompanyOrphans.length > 0 ? 'error' : 'pass',
        message: websiteCompanyOrphans.length > 0
          ? `${websiteCompanyOrphans.length} 個網站引用了不存在的公司`
          : '所有網站的公司關聯正確',
        details: websiteCompanyOrphans.map(w => `${w.websiteName} → 公司 ID: ${w.companyId} [不存在]`),
        affectedCount: websiteCompanyOrphans.length,
        totalCount: websites.length,
      });

      const websiteBrandOrphans = websites.filter(w => w.brandId && !brands.find(b => b.id === w.brandId));
      allChecks.push({
        id: 'website-brand-fk',
        module: '網站管理',
        checkName: '網站→品牌 外鍵關聯',
        severity: websiteBrandOrphans.length > 0 ? 'error' : 'pass',
        message: websiteBrandOrphans.length > 0
          ? `${websiteBrandOrphans.length} 個網站引用了不存在的品牌`
          : '所有網站的品牌關聯正確',
        details: websiteBrandOrphans.map(w => `${w.websiteName} → 品牌 ID: ${w.brandId} [不存在]`),
        affectedCount: websiteBrandOrphans.length,
        totalCount: websites.length,
      });

      // Website brand belongs to correct company
      const websiteBrandCompanyMismatch = websites.filter(w => {
        if (!w.brandId || !w.companyId) return false;
        const brand = brands.find(b => b.id === w.brandId);
        return brand && brand.companyId !== w.companyId;
      });
      allChecks.push({
        id: 'website-brand-company-chain',
        module: '網站管理',
        checkName: '網站品牌與公司鏈結一致性',
        severity: websiteBrandCompanyMismatch.length > 0 ? 'error' : 'pass',
        message: websiteBrandCompanyMismatch.length > 0
          ? `${websiteBrandCompanyMismatch.length} 個網站的品牌不屬於其選定公司`
          : '所有網站的品牌與公司鏈結正確',
        details: websiteBrandCompanyMismatch.map(w => {
          const brand = brands.find(b => b.id === w.brandId);
          return `${w.websiteName}: 品牌 "${brand?.displayName}" 屬於 "${brand?.companyId}", 但網站公司為 "${w.companyId}"`;
        }),
        affectedCount: websiteBrandCompanyMismatch.length,
        totalCount: websites.length,
      });

      // Website company code consistency (company short code matches)
      const websiteCompanyCodeMismatch = websites.filter(w => {
        if (!w.company || !w.companyId) return false;
        const company = companies.find(c => c.id === w.companyId);
        return company && company.companyCode !== w.company;
      });
      allChecks.push({
        id: 'website-company-code-sync',
        module: '網站管理',
        checkName: '網站公司代碼同步',
        severity: websiteCompanyCodeMismatch.length > 0 ? 'warning' : 'pass',
        message: websiteCompanyCodeMismatch.length > 0
          ? `${websiteCompanyCodeMismatch.length} 個網站的 company 代碼與主記錄不一致`
          : '所有網站公司代碼同步正確',
        details: websiteCompanyCodeMismatch.map(w => {
          const company = companies.find(c => c.id === w.companyId);
          return `${w.websiteName}: 網站顯示 "${w.company}", 主記錄 "${company?.companyCode}"`;
        }),
        affectedCount: websiteCompanyCodeMismatch.length,
        totalCount: websites.filter(w => w.company && w.companyId).length,
      });

      // Website brand code consistency
      const websiteBrandCodeMismatch = websites.filter(w => {
        if (!w.brand || !w.brandId) return false;
        const brand = brands.find(b => b.id === w.brandId);
        return brand && brand.brandCode !== w.brand;
      });
      allChecks.push({
        id: 'website-brand-code-sync',
        module: '網站管理',
        checkName: '網站品牌代碼同步',
        severity: websiteBrandCodeMismatch.length > 0 ? 'warning' : 'pass',
        message: websiteBrandCodeMismatch.length > 0
          ? `${websiteBrandCodeMismatch.length} 個網站的 brand 代碼與主記錄不一致`
          : '所有網站品牌代碼同步正確',
        details: websiteBrandCodeMismatch.map(w => {
          const brand = brands.find(b => b.id === w.brandId);
          return `${w.websiteName}: 網站顯示 "${w.brand}", 主記錄 "${brand?.brandCode}"`;
        }),
        affectedCount: websiteBrandCodeMismatch.length,
        totalCount: websites.filter(w => w.brand && w.brandId).length,
      });

      // ===== 17. Cross-module ID consistency =====
      // Check: company counts match actual
      const companyBrandCountMismatch = companies.filter(c => {
        const actualBrands = brands.filter(b => b.companyId === c.uuid || b.companyId === c.id).length;
        return c.brandCount !== undefined && c.brandCount !== actualBrands;
      });
      allChecks.push({
        id: 'company-brand-count-sync',
        module: '跨模組一致性',
        checkName: '公司品牌數量同步',
        severity: companyBrandCountMismatch.length > 0 ? 'warning' : 'pass',
        message: companyBrandCountMismatch.length > 0
          ? `${companyBrandCountMismatch.length} 間公司的品牌計數與實際不符`
          : '所有公司品牌計數正確',
        details: companyBrandCountMismatch.map(c => {
          const actual = brands.filter(b => b.companyId === c.uuid || b.companyId === c.id).length;
          return `${c.companyNameZh}: 顯示 ${c.brandCount} 個品牌, 實際 ${actual} 個`;
        }),
        affectedCount: companyBrandCountMismatch.length,
        totalCount: companies.length,
      });

      // Check: company active project count
      const companyProjectCountMismatch = companies.filter(c => {
        const actualProjects = projects.filter(p => p.companyId === c.id && p.status === 'active').length;
        return c.activeProjectCount !== undefined && c.activeProjectCount !== actualProjects;
      });
      allChecks.push({
        id: 'company-project-count-sync',
        module: '跨模組一致性',
        checkName: '公司活躍項目數量同步',
        severity: companyProjectCountMismatch.length > 0 ? 'warning' : 'pass',
        message: companyProjectCountMismatch.length > 0
          ? `${companyProjectCountMismatch.length} 間公司的活躍項目計數與實際不符`
          : '所有公司活躍項目計數正確',
        details: companyProjectCountMismatch.map(c => {
          const actual = projects.filter(p => p.companyId === c.id && p.status === 'active').length;
          return `${c.companyNameZh}: 顯示 ${c.activeProjectCount} 個活躍項目, 實際 ${actual} 個`;
        }),
        affectedCount: companyProjectCountMismatch.length,
        totalCount: companies.length,
      });

      // Brand project count sync
      const brandProjectCountMismatch = brands.filter(b => {
        if (b.projectCount === undefined) return false;
        const actualCount = projects.filter(p => p.brandId === b.id).length;
        return b.projectCount !== actualCount;
      });
      allChecks.push({
        id: 'brand-project-count-sync',
        module: '跨模組一致性',
        checkName: '品牌項目數量同步',
        severity: brandProjectCountMismatch.length > 0 ? 'warning' : 'pass',
        message: brandProjectCountMismatch.length > 0
          ? `${brandProjectCountMismatch.length} 個品牌的項目計數與實際不符`
          : '所有品牌項目計數正確',
        details: brandProjectCountMismatch.map(b => {
          const actual = projects.filter(p => p.brandId === b.id).length;
          return `${b.displayName}: 顯示 ${b.projectCount} 個項目, 實際 ${actual} 個`;
        }),
        affectedCount: brandProjectCountMismatch.length,
        totalCount: brands.length,
      });

      // Check: Data chain completeness (Company → Brand → Project → Website → Content)
      const websitesWithoutContent = websites.filter(w => {
        const hasVideos = Object.keys(videos).includes(w.id);
        const hasSocial = Object.keys(socialPosts).includes(w.id);
        const hasAds = Object.keys(paidAds).includes(w.id);
        const hasSeo = Object.keys(seoKeywords).includes(w.id);
        const hasEdm = Object.keys(edmCampaigns).includes(w.id);
        return !hasVideos && !hasSocial && !hasAds && !hasSeo && !hasEdm;
      });
      allChecks.push({
        id: 'website-no-content',
        module: '跨模組一致性',
        checkName: '網站內容關聯覆蓋',
        severity: websitesWithoutContent.length > 0 ? 'warning' : 'pass',
        message: websitesWithoutContent.length > 0
          ? `${websitesWithoutContent.length} 個網站尚未關聯任何內容模組（影片/社交/廣告/SEO/EDM）`
          : '所有網站均有關聯內容',
        details: websitesWithoutContent.slice(0, 20).map(w => `${w.websiteName} (${w.id}) — 無任何內容模組記錄`),
        affectedCount: websitesWithoutContent.length,
        totalCount: websites.length,
      });

      // ===== 18. 網站→項目→公司 全鏈一致性 =====
      const fullChainErrors = websites.filter(w => {
        if (!w.projectId || !w.companyId) return false;
        const project = projects.find(p => p.id === w.projectId);
        if (!project) return false;
        return project.companyId !== w.companyId;
      });
      allChecks.push({
        id: 'website-project-company-chain',
        module: '跨模組一致性',
        checkName: '網站→項目→公司 鏈結驗證',
        severity: fullChainErrors.length > 0 ? 'error' : 'pass',
        message: fullChainErrors.length > 0
          ? `${fullChainErrors.length} 個網站的公司 ID 與其所屬項目的公司 ID 不一致`
          : '所有網站→項目→公司鏈結一致',
        details: fullChainErrors.map(w => {
          const project = projects.find(p => p.id === w.projectId);
          return `${w.websiteName}: 網站公司 ${w.companyId} ≠ 項目公司 ${project?.companyId}`;
        }),
        affectedCount: fullChainErrors.length,
        totalCount: websites.filter(w => w.projectId && w.companyId).length,
      });

      // Websites per project distribution summary
      const projectWebsiteCounts = projects.map(p => ({
        project: p,
        count: websites.filter(w => w.projectId === p.id).length,
      }));
      const projectsWithNoWebsites = projectWebsiteCounts.filter(x => x.count === 0);
      allChecks.push({
        id: 'project-no-websites',
        module: '跨模組一致性',
        checkName: '項目無關聯網站',
        severity: projectsWithNoWebsites.length > 0 ? 'warning' : 'pass',
        message: projectsWithNoWebsites.length > 0
          ? `${projectsWithNoWebsites.length} 個項目沒有任何關聯網站`
          : '所有項目均有關聯網站',
        details: projectsWithNoWebsites.map(x => `${x.project.name} (${x.project.id}) — 無關聯網站`),
        affectedCount: projectsWithNoWebsites.length,
        totalCount: projects.length,
      });

      // ===== Group by module =====
      const moduleOrder = [
        '公司管理', '品牌管理', '專案管理', '網站管理',
        '工作匯報', '客戶報價', '規劃中心', '行銷管理',
        '影片製作', '社交媒體', '付費廣告', 'SEO 關鍵字', 'EDM 管理',
        '供應商', '跨模組一致性',
      ];
      const moduleGroups: Record<string, CheckResult[]> = {};
      allChecks.forEach(check => {
        if (!moduleGroups[check.module]) moduleGroups[check.module] = [];
        moduleGroups[check.module].push(check);
      });

      const grouped: ModuleCheckGroup[] = Object.entries(moduleGroups)
        .sort(([a], [b]) => {
          const idxA = moduleOrder.indexOf(a);
          const idxB = moduleOrder.indexOf(b);
          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        })
        .map(([module, checks]) => ({
          module,
          icon: module,
          checks,
          passCount: checks.filter(c => c.severity === 'pass').length,
          warnCount: checks.filter(c => c.severity === 'warning').length,
          errorCount: checks.filter(c => c.severity === 'error').length,
        }));

      setResults(grouped);
      setLastRunTime(new Date());
      setIsRunning(false);
      // Auto-expand modules with issues
      const modulesWithIssues = grouped.filter(g => g.warnCount > 0 || g.errorCount > 0).map(g => g.module);
      setExpandedModules(new Set(modulesWithIssues));
    }, 800);
  }, [dataStore]);

  // ===== Summary stats =====
  const totalChecks = results.reduce((sum, g) => sum + g.checks.length, 0);
  const totalPass = results.reduce((sum, g) => sum + g.passCount, 0);
  const totalWarn = results.reduce((sum, g) => sum + g.warnCount, 0);
  const totalError = results.reduce((sum, g) => sum + g.errorCount, 0);
  const healthScore = totalChecks > 0 ? Math.round((totalPass / totalChecks) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-[14px] font-bold text-blue-900">資料完整性檢查</h3>
            <p className="text-[12px] text-blue-700 mt-1">
              此工具檢查系統內每一個頁面的資料完整性，包括：網站+系統 ↔ 工作匯報、客戶報價、專案策劃、規劃中心、行銷管理、影片製作、供應商、跨模組一致性。
              確保各模組之間的資料鏈結（公司→品牌→項目→網站→內容）一致無誤。
            </p>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={runIntegrityChecks}
            disabled={isRunning}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-medium transition-all',
              isRunning
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.97]'
            )}
          >
            <RefreshCw className={cn('w-4 h-4', isRunning && 'animate-spin')} />
            {isRunning ? '檢查中...' : '開始檢查'}
          </button>
          {lastRunTime && (
            <span className="text-[12px] text-muted-foreground">
              上次執行：{lastRunTime.toLocaleString('zh-HK')}
            </span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            label="健康分數"
            value={`${healthScore}%`}
            color={healthScore >= 90 ? 'text-teal-600' : healthScore >= 70 ? 'text-amber-600' : 'text-red-600'}
            bgColor={healthScore >= 90 ? 'bg-teal-50' : healthScore >= 70 ? 'bg-amber-50' : 'bg-red-50'}
          />
          <SummaryCard label="通過檢查" value={String(totalPass)} color="text-teal-600" bgColor="bg-teal-50" />
          <SummaryCard label="警告" value={String(totalWarn)} color="text-amber-600" bgColor="bg-amber-50" />
          <SummaryCard label="錯誤" value={String(totalError)} color="text-red-600" bgColor="bg-red-50" />
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[14px] font-bold text-[#0d1a2d]">檢查結果明細</h3>
          {results.map(group => (
            <div
              key={group.module}
              className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden"
            >
              {/* Module Header */}
              <button
                onClick={() => toggleModule(group.module)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedModules.has(group.module) ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="text-[13px] font-bold">{group.module}</span>
                  <span className="text-[11px] text-muted-foreground">
                    ({group.checks.length} 項檢查)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {group.passCount > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      {group.passCount}
                    </span>
                  )}
                  {group.warnCount > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" />
                      {group.warnCount}
                    </span>
                  )}
                  {group.errorCount > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                      <XCircle className="w-3 h-3" />
                      {group.errorCount}
                    </span>
                  )}
                </div>
              </button>

              {/* Check Items */}
              {expandedModules.has(group.module) && (
                <div className="border-t border-[rgba(13,26,45,0.06)]">
                  {group.checks.map(check => (
                    <CheckResultRow key={check.id} check={check} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Data Chain Diagram */}
      {results.length > 0 && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <h3 className="text-[14px] font-bold text-[#0d1a2d] mb-4 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-teal-600" />
            資料鏈結架構圖
          </h3>
          {/* Main chain */}
          <div className="flex items-center justify-center gap-2 flex-wrap mb-4">
            <ChainNode label="公司" count={companies.length} />
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <ChainNode label="品牌" count={brands.length} />
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <ChainNode label="項目" count={mockProjects.length} />
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <ChainNode label="網站" count={dataStore.websites.length} />
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <ChainNode label="內容模組" count={Object.keys(dataStore.videos).length + Object.keys(dataStore.socialPosts).length + Object.keys(dataStore.paidAds).length} />
          </div>
          {/* Cross-module connections */}
          <div className="border-t border-gray-100 pt-3 mt-3">
            <p className="text-[11px] font-medium text-gray-500 mb-2">跨模組連結:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
              <div className="bg-blue-50 rounded px-2 py-1.5">
                <span className="font-bold text-blue-700">工作匯報</span>
                <span className="text-blue-600 block">→ 網站 / 項目</span>
              </div>
              <div className="bg-purple-50 rounded px-2 py-1.5">
                <span className="font-bold text-purple-700">客戶報價</span>
                <span className="text-purple-600 block">→ 公司 / 品牌</span>
              </div>
              <div className="bg-amber-50 rounded px-2 py-1.5">
                <span className="font-bold text-amber-700">規劃中心</span>
                <span className="text-amber-600 block">→ 公司 / 品牌</span>
              </div>
              <div className="bg-pink-50 rounded px-2 py-1.5">
                <span className="font-bold text-pink-700">行銷管理</span>
                <span className="text-pink-600 block">→ 網站 / 社交帖文</span>
              </div>
              <div className="bg-violet-50 rounded px-2 py-1.5">
                <span className="font-bold text-violet-700">影片製作</span>
                <span className="text-violet-600 block">→ 網站 / 頻道</span>
              </div>
              <div className="bg-emerald-50 rounded px-2 py-1.5">
                <span className="font-bold text-emerald-700">供應商</span>
                <span className="text-emerald-600 block">→ 公司</span>
              </div>
              <div className="bg-orange-50 rounded px-2 py-1.5">
                <span className="font-bold text-orange-700">SEO / EDM</span>
                <span className="text-orange-600 block">→ 網站</span>
              </div>
              <div className="bg-cyan-50 rounded px-2 py-1.5">
                <span className="font-bold text-cyan-700">付費廣告</span>
                <span className="text-cyan-600 block">→ 網站 / 信用卡</span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 text-center">
            所有新增記錄必須沿此鏈結選擇上級實體，確保資料一致性。
          </p>
        </div>
      )}

      {/* Empty State */}
      {results.length === 0 && !isRunning && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-12 text-center">
          <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-[16px] font-bold text-gray-600">尚未執行檢查</h3>
          <p className="text-[13px] text-muted-foreground mt-2">
            點擊「開始檢查」按鈕，系統將自動掃描所有模組的資料完整性。
          </p>
        </div>
      )}
    </div>
  );
}

// ===== Sub-components =====

function SummaryCard({ label, value, color, bgColor }: { label: string; value: string; color: string; bgColor: string }) {
  return (
    <div className={cn('rounded-md p-4 border', bgColor, 'border-transparent')}>
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-[24px] font-bold', color)}>{value}</p>
    </div>
  );
}

function CheckResultRow({ check }: { check: CheckResult }) {
  const [expanded, setExpanded] = useState(false);

  const SeverityIcon = check.severity === 'pass' ? CheckCircle2 : check.severity === 'warning' ? AlertTriangle : XCircle;
  const severityColor = check.severity === 'pass' ? 'text-teal-600' : check.severity === 'warning' ? 'text-amber-600' : 'text-red-600';
  const severityBg = check.severity === 'pass' ? 'bg-teal-50' : check.severity === 'warning' ? 'bg-amber-50' : 'bg-red-50';

  return (
    <div className="border-b border-[rgba(13,26,45,0.04)] last:border-b-0">
      <div
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-white cursor-pointer"
        onClick={() => check.details && check.details.length > 0 && setExpanded(!expanded)}
      >
        <SeverityIcon className={cn('w-4 h-4 shrink-0', severityColor)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-[#0d1a2d]">{check.checkName}</span>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded', severityBg, severityColor)}>
              {check.severity === 'pass' ? '通過' : check.severity === 'warning' ? '警告' : '錯誤'}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{check.message}</p>
        </div>
        <div className="text-[11px] text-muted-foreground whitespace-nowrap">
          {check.affectedCount}/{check.totalCount}
        </div>
        {check.details && check.details.length > 0 && (
          <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', expanded && 'rotate-180')} />
        )}
      </div>
      {expanded && check.details && (
        <div className="px-4 pb-3 pl-11">
          <div className="bg-gray-50 rounded-md p-3 space-y-1.5">
            {check.details.map((detail, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-gray-600">
                <FileWarning className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                <span>{detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChainNode({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex flex-col items-center gap-1 bg-teal-50 border border-teal-200 rounded-md px-4 py-2">
      <span className="text-[12px] font-bold text-teal-700">{label}</span>
      <span className="text-[10px] text-teal-600">{count} 筆</span>
    </div>
  );
}
