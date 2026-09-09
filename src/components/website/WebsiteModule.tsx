import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Globe, Plus, Search, ExternalLink, Video, TrendingUp, Puzzle, Link2, Calendar, X, Check, LayoutGrid, List, ArrowLeft, Megaphone, Star, ChevronDown, Pencil, Monitor, Server, MapPin, RefreshCw, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WebsiteProfileFull, WebsiteLevel, ProfileType, SystemType } from '@/types/app';
import {
  emptyFormData,
  websiteFormDataToProfile,
  WebsiteFormModal,
  type WebsiteFormData,
} from '@/components/website/WebsiteFormModal';
import { useWebsiteProfiles } from '@/hooks/useWebsiteProfiles';
import { useCompanies } from '@/hooks/useCompanies';
import { useBrands } from '@/hooks/useBrands';
import { projects as allProjectsData } from '@/data/mockData';
import { ProjectCategoryBadge, getProjectCategory, type ProjectCategoryType } from '@/components/ui/project-category-badge';
import { BrandFieldBadge, CompanyFieldBadge, EmptyDash, MutedFieldBadge, StatusFieldBadge, displayText } from '@/components/ui/nullable-badge';
import { useAdsWebsiteLinks } from '@/hooks/useAdsWebsiteLinks';
import { useWebsiteConnectionStatus } from '@/hooks/useWebsiteConnectionStatus';
import type { AdsDiscoveredDomain } from '@/types/adsWebsiteLink';
import {
  ga4ConnectionLabel,
  googleAdsConnectionLabel,
  type Ga4ConnectionStatus,
  type GoogleAdsConnectionStatus,
} from '@/lib/websiteConnectionStatus';
import {
  adsPlatformSourceLabel,
  domainSourceOrigin,
  domainSourceOriginLabel,
  originSortRank,
} from '@/lib/adsWebsiteDisplay';
import {
  readSelectedWebsiteId,
  setWebsiteDetailHash,
  writeSelectedWebsiteId,
  type WebsiteListPage,
} from '@/lib/websiteNavigation';
import { toExternalHref } from '@/lib/externalUrl';
import {
  WebsiteVideosTab,
  WebsiteAdsTab,
  WebsiteSeoTab,
  WebsitePluginsTab,
  WebsiteBacklinkTab,
  WebsiteGoogleBusinessTab,
  WebsiteCalendarTab,
} from './WebsiteDetailTabs';
import { Ga4TrafficModule } from './traffic/Ga4TrafficModule';
import { WebsiteTrafficTab } from './traffic/WebsiteTrafficTab';

const statusConfig = {
  development: { label: '開發中', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  live: { label: '已上線', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  maintenance: { label: '維護中', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  archived: { label: '已封存', color: 'text-slate-700', bgColor: 'bg-slate-50' },
};

// ===== Level Config =====
const levelConfig: Record<WebsiteLevel, { label: string; borderColor: string; textColor: string; bgColor: string; className: string }> = {
  1: { label: '主打', borderColor: 'border-amber-500', textColor: 'text-amber-800', bgColor: 'bg-gradient-to-r from-amber-50 to-yellow-50', className: 'border-amber-500 bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-800' },
  2: { label: '重要', borderColor: 'border-blue-500', textColor: 'text-blue-700', bgColor: 'bg-blue-50', className: 'border-blue-500 bg-blue-50 text-blue-700' },
  3: { label: '定期推廣', borderColor: 'border-green-500', textColor: 'text-green-700', bgColor: 'bg-green-50', className: 'border-green-500 bg-green-50 text-green-700' },
  4: { label: '不主動', borderColor: 'border-slate-400', textColor: 'text-slate-600', bgColor: 'bg-slate-50', className: 'border-slate-400 bg-slate-50 text-slate-600' },
  5: { label: '已關閉', borderColor: 'border-rose-500', textColor: 'text-rose-600', bgColor: 'bg-rose-50', className: 'border-rose-500 bg-rose-50 text-rose-600 line-through' },
};

// ===== Website Level Badge Component =====
function WebsiteLevelBadge({ level, size = 'default' }: { level?: WebsiteLevel | null; size?: 'default' | 'small' | 'large' }) {
  const config = level != null ? levelConfig[level] : undefined;
  if (!config) return <EmptyDash />;
  const sizeClasses = size === 'small' ? 'text-[9px] px-1 py-0' : size === 'large' ? 'text-[12px] px-2 py-1' : 'text-[10px] px-1.5 py-0.5';
  return (
    <span className={cn('font-bold rounded-sm border inline-flex items-center gap-0.5', sizeClasses, config.className)}>
      {level === 1 && <Star size={size === 'small' ? 8 : size === 'large' ? 12 : 10} className="fill-amber-400 text-amber-500" />}
      L{level} {config.label}
    </span>
  );
}

// ===== Profile Type Badge Component =====
const profileTypeConfig: Record<string, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  website: { label: '網站', icon: <Globe size={10} />, color: 'text-teal-700', bgColor: 'bg-teal-50 border-teal-200' },
  system: { label: '系統', icon: <Server size={10} />, color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200' },
};

const systemTypeLabels: Record<SystemType, string> = {
  internal_tool: '內部工具',
  client_system: '客戶系統',
  saas_platform: 'SaaS 平台',
  erp: 'ERP 系統',
  crm: 'CRM 系統',
  other: '其他系統',
};

function ProfileTypeBadge({ profileType, size = 'default' }: { profileType?: ProfileType; size?: 'default' | 'small' }) {
  const type = profileType || 'website';
  const config = profileTypeConfig[type];
  if (!config) return <EmptyDash />;
  const sizeClasses = size === 'small' ? 'text-[9px] px-1 py-0 gap-0.5' : 'text-[10px] px-1.5 py-0.5 gap-1';
  return (
    <span className={cn('font-bold rounded-sm border inline-flex items-center', sizeClasses, config.bgColor, config.color)}>
      {config.icon}
      {config.label}
    </span>
  );
}

function resolveWebsiteProjectCategory(site: WebsiteProfileFull): { category: ProjectCategoryType; clientName?: string } {
  if (site.projectCategory === 'internal' || site.projectCategory === 'client') {
    return { category: site.projectCategory };
  }
  return getProjectCategory(site.projectId, allProjectsData);
}

function OpenWebsiteUrlButton({ domainUrl }: { domainUrl?: string }) {
  const raw = domainUrl?.trim();
  if (!raw) return null;
  const href = toExternalHref(raw);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="p-1.5 hover:bg-muted rounded-md transition-colors inline-flex"
      title="開啟網站"
    >
      <ExternalLink size={13} className="text-muted-foreground" />
    </a>
  );
}

// ===== Website Card =====
function WebsiteCard({ site, onClick }: { site: WebsiteProfileFull; onClick: () => void }) {
  const config = statusConfig[site.status];
  const { category, clientName } = resolveWebsiteProjectCategory(site);

  return (
    <div onClick={onClick} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5 hover:shadow-[0_4px_12px_rgba(0,20,40,0.1)] transition-all duration-200 cursor-pointer">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h4 className="text-[15px] font-bold">{site.websiteName}</h4>
            <ProfileTypeBadge profileType={site.profileType} size="small" />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {site.profileType === 'system' ? <Monitor size={11} className="text-purple-500" /> : <Globe size={11} className="text-muted-foreground" />}
            <span className="text-[12px] text-teal-600">{site.domainUrl}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <WebsiteLevelBadge level={site.level} />
          <StatusFieldBadge config={config} className="text-[10px]" />
        </div>
      </div>

      {/* Platform & Brand */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <ProjectCategoryBadge category={category} clientName={clientName} size="sm" />
        {site.profileType === 'system' && site.systemType && (
          <MutedFieldBadge value={systemTypeLabels[site.systemType]} className="bg-purple-50 text-purple-700 border border-purple-200" />
        )}
        <MutedFieldBadge value={site.platform} />
        <BrandFieldBadge value={site.brand} />
        <CompanyFieldBadge value={site.company} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3 pt-3 border-t border-border/50">
        <div className="text-center">
          <span className="text-[14px] font-bold block">{site.pagesCount}</span>
          <span className="text-[10px] text-muted-foreground">頁面</span>
        </div>
        <div className="text-center">
          <span className="text-[14px] font-bold block">{site.videosCount}</span>
          <span className="text-[10px] text-muted-foreground">影片</span>
        </div>
        <div className="text-center">
          <span className="text-[14px] font-bold block">{site.keywordsCount}</span>
          <span className="text-[10px] text-muted-foreground">關鍵字</span>
        </div>
      </div>

      {/* External Links */}
      {site.externalLinks && site.externalLinks.length > 0 && (
        <div className="flex items-center gap-1.5 pt-2 border-t border-border/50">
          {site.externalLinks.map((link, i) => (
            <a key={i} href={link.url} onClick={e => e.stopPropagation()} className="flex items-center gap-0.5 text-[10px] text-teal-600 hover:underline">
              <ExternalLink size={9} />{link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Website Table Row =====
function WebsiteTableRow({ site, onClick }: { site: WebsiteProfileFull; onClick: () => void }) {
  const config = statusConfig[site.status];
  const { category, clientName } = resolveWebsiteProjectCategory(site);
  return (
    <tr onClick={onClick} className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer">
      <td className="px-4 py-3">
        <div>
          <span className="text-[13px] font-medium block">{site.websiteName}</span>
          <span className="text-[11px] text-teal-600">{site.domainUrl}</span>
        </div>
      </td>
      <td className="px-4 py-3"><ProjectCategoryBadge category={category} clientName={clientName} size="sm" /></td>
      <td className="px-4 py-3"><WebsiteLevelBadge level={site.level} size="small" /></td>
      <td className="px-4 py-3"><MutedFieldBadge value={site.platform} /></td>
      <td className="px-4 py-3"><BrandFieldBadge value={site.brand} /></td>
      <td className="px-4 py-3"><CompanyFieldBadge value={site.company} /></td>
      <td className="px-4 py-3"><StatusFieldBadge config={config} /></td>
      <td className="px-4 py-3 text-[13px]">{site.videosCount}</td>
      <td className="px-4 py-3 text-[13px] font-medium">{site.totalHours}h</td>
    </tr>
  );
}

// ===== Website Detail =====
function WebsiteDetail({
  site,
  onBack,
  onSitePatch,
}: {
  site: WebsiteProfileFull;
  onBack: () => void;
  onSitePatch?: (patch: Partial<WebsiteProfileFull>) => void;
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [currentLevel, setCurrentLevel] = useState<WebsiteLevel>(site.level);
  const [showLevelDropdown, setShowLevelDropdown] = useState(false);
  const [staffHours, setStaffHours] = useState<{ name: string; hours: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: entries } = await supabase
        .from('day_report_entries')
        .select('staff_id, hours')
        .eq('related_id', site.id);
      if (cancelled || !entries || entries.length === 0) return;

      // Aggregate hours per staff_id
      const hoursMap: Record<string, number> = {};
      entries.forEach(e => {
        if (!e.staff_id) return;
        hoursMap[e.staff_id] = (hoursMap[e.staff_id] || 0) + Number(e.hours || 0);
      });

      const staffIds = Object.keys(hoursMap);

      const { data: dirData } = await supabase
        .from('staffs')
        .select('id, display_name, full_name')
        .in('id', staffIds);

      const nameById: Record<string, string> = {};
      (dirData || []).forEach((s: any) => {
        const n = (s.display_name || s.full_name || '').trim();
        if (n) nameById[s.id] = n;
      });

      const list = staffIds
        .map(id => ({ name: nameById[id] || id, hours: hoursMap[id] }))
        .sort((a, b) => b.hours - a.hours);

      if (!cancelled) setStaffHours(list);
    })();
    return () => { cancelled = true; };
  }, [site.id]);

  const tabs = [
    { id: 'overview', label: '概覽', icon: Globe },
    { id: 'videos', label: '影片列表', icon: Video },
    { id: 'ads', label: '付費廣告', icon: Megaphone },
    { id: 'seo', label: 'SEO 關鍵字', icon: TrendingUp },
    { id: 'traffic', label: '網站流量', icon: BarChart3 },
    { id: 'plugins', label: '插件/工具', icon: Puzzle },
    { id: 'backlink', label: '反向連結', icon: Link2 },
    { id: 'google-business', label: 'Google Business', icon: MapPin },
    { id: 'calendar', label: '內容日曆', icon: Calendar },
  ];

  const budgetPercent = site.budgetTotal ? Math.round((site.budgetUsed || 0) / site.budgetTotal * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1 text-[13px] text-teal-600 font-medium hover:underline">
        <ArrowLeft size={14} />返回{site.profileType === 'system' ? '系統' : '網站'}列表
      </button>

      {/* Site Header */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-[20px] font-bold">{site.websiteName}</h2>
              <ProfileTypeBadge profileType={site.profileType} />
              <ProjectCategoryBadge category={resolveWebsiteProjectCategory(site).category} size="sm" />
              {/* Level Badge with Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowLevelDropdown(!showLevelDropdown)}
                  className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                >
                  <WebsiteLevelBadge level={currentLevel} size="large" />
                  <ChevronDown size={12} className="text-muted-foreground" />
                </button>
                {showLevelDropdown && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-border rounded-md shadow-lg py-1 min-w-[160px]">
                    {([1, 2, 3, 4, 5] as WebsiteLevel[]).map(lvl => (
                      <button
                        key={lvl}
                        onClick={() => { setCurrentLevel(lvl); setShowLevelDropdown(false); }}
                        className={cn('w-full px-3 py-2 text-left text-[12px] hover:bg-muted/50 transition-colors flex items-center gap-2', currentLevel === lvl && 'bg-muted/30')}
                      >
                        <WebsiteLevelBadge level={lvl} size="small" />
                        {currentLevel === lvl && <Check size={11} className="text-teal-600 ml-auto" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {site.profileType === 'system' ? <Monitor size={12} className="text-purple-500" /> : <Globe size={12} className="text-muted-foreground" />}
              <a href={toExternalHref(site.domainUrl)} target="_blank" rel="noopener noreferrer" className="text-[13px] text-teal-600 hover:underline">{site.domainUrl}</a>
              <MutedFieldBadge value={site.platform} />
              {site.profileType === 'system' && site.systemType && (
                <MutedFieldBadge value={systemTypeLabels[site.systemType]} className="bg-purple-50 text-purple-700 border border-purple-200" />
              )}
              <BrandFieldBadge value={site.brand} />
              <CompanyFieldBadge value={site.company} />
              <StatusFieldBadge config={statusConfig[site.status]} className="text-[10px]" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div><span className="text-[18px] font-bold block">{site.pagesCount}</span><span className="text-[10px] text-muted-foreground">頁面</span></div>
            <div><span className="text-[18px] font-bold block">{site.videosCount}</span><span className="text-[10px] text-muted-foreground">影片</span></div>
            <div><span className="text-[18px] font-bold block">{site.keywordsCount}</span><span className="text-[10px] text-muted-foreground">關鍵字</span></div>
            <div><span className="text-[18px] font-bold block">{site.totalHours}h</span><span className="text-[10px] text-muted-foreground">工時</span></div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border pb-0">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-b-2 whitespace-nowrap transition-all',
                activeTab === tab.id ? 'border-teal-600 text-teal-600' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon size={13} />{tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-md p-4 text-center">
                <span className="text-[24px] font-bold text-blue-700 block">{site.videosCount}</span>
                <span className="text-[12px] text-blue-600">影片數</span>
              </div>
              <div className="bg-teal-50 rounded-md p-4 text-center">
                <span className="text-[24px] font-bold text-teal-700 block">{site.keywordsCount}</span>
                <span className="text-[12px] text-teal-600">關鍵字</span>
              </div>
              <div className="bg-amber-50 rounded-md p-4 text-center">
                <span className="text-[24px] font-bold text-amber-700 block">{budgetPercent}%</span>
                <span className="text-[12px] text-amber-600">預算使用率</span>
              </div>
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h5 className="text-[14px] font-bold">基本資料</h5>
                <div className="space-y-2">
                  <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Level</span><span className="font-medium"><WebsiteLevelBadge level={currentLevel} /></span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">狀態</span><span className="font-medium">{displayText(statusConfig[site.status]?.label)}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">平台</span><span className="font-medium capitalize">{displayText(site.platform)}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">品牌</span><span className="font-medium">{displayText(site.brand)}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">公司</span><span className="font-medium">{displayText(site.company)}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">主機</span><span className="font-medium">{site.hostingProvider || '—'}</span></div>
                  <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">總工時</span><span className="font-medium">{site.totalHours}h</span></div>
                  {staffHours.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                      {staffHours.map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-[12px]">
                          <span className="text-muted-foreground">{s.name}</span>
                          <span className="font-medium tabular-nums">{s.hours}h</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <h5 className="text-[14px] font-bold">團隊</h5>
                {site.assignedStaff && site.assignedStaff.length > 0 ? (
                  <div className="space-y-2">
                    {site.assignedStaff.map((staff, i) => (
                      <div key={i} className="flex items-center justify-between text-[13px]">
                        <span className="font-medium">{staff.name}</span>
                        <MutedFieldBadge value={staff.role} className="text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-muted-foreground">尚未分配團隊</p>
                )}

                {/* Budget */}
                {site.budgetTotal && (
                  <div className="mt-4 pt-3 border-t border-border/50">
                    <h5 className="text-[14px] font-bold mb-2">預算</h5>
                    <div className="flex justify-between text-[13px] mb-1">
                      <span className="text-muted-foreground">已使用 / 總預算</span>
                      <span className="font-medium">${(site.budgetUsed || 0).toLocaleString()} / ${site.budgetTotal.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', budgetPercent >= 90 ? 'bg-rose-500' : budgetPercent >= 70 ? 'bg-amber-500' : 'bg-teal-600')}
                        style={{ width: `${Math.min(budgetPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* External Links */}
            {site.externalLinks && site.externalLinks.length > 0 && (
              <div className="pt-4 border-t border-border/50">
                <h5 className="text-[14px] font-bold mb-2">外部連結</h5>
                <div className="flex items-center gap-3 flex-wrap">
                  {site.externalLinks.map((link, i) => (
                    <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[12px] text-teal-600 hover:underline px-2 py-1 bg-teal-50 rounded">
                      <ExternalLink size={11} />{link.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {site.notes && (
              <div className="pt-4 border-t border-border/50">
                <h5 className="text-[14px] font-bold mb-2">備註</h5>
                <p className="text-[13px] text-muted-foreground">{site.notes}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'videos' && (
          <WebsiteVideosTab
            site={site}
            onVideosCountChange={count => onSitePatch?.({ videosCount: count })}
          />
        )}
        {activeTab === 'ads' && <WebsiteAdsTab site={site} />}
        {activeTab === 'seo' && <WebsiteSeoTab site={site} />}
        {activeTab === 'traffic' && <WebsiteTrafficTab site={site} />}
        {activeTab === 'plugins' && <WebsitePluginsTab site={site} />}
        {activeTab === 'backlink' && <WebsiteBacklinkTab site={site} />}
        {activeTab === 'google-business' && <WebsiteGoogleBusinessTab site={site} />}
        {activeTab === 'calendar' && <WebsiteCalendarTab site={site} />}
      </div>
    </div>
  );
}

function ConnectionStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'active' | 'paused' | 'linked' | 'unlinked';
}) {
  const toneClass =
    tone === 'active'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : tone === 'paused'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : tone === 'linked'
          ? 'bg-teal-50 text-teal-700 border-teal-200'
          : 'bg-slate-50 text-slate-500 border-slate-200';
  return (
    <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded border', toneClass)}>
      {label}
    </span>
  );
}

function GoogleAdsConnectionBadge({ status }: { status: GoogleAdsConnectionStatus }) {
  const tone = status === 'active' ? 'active' : status === 'paused' ? 'paused' : 'unlinked';
  return <ConnectionStatusBadge label={googleAdsConnectionLabel(status)} tone={tone} />;
}

function Ga4ConnectionBadge({ status }: { status: Ga4ConnectionStatus }) {
  return (
    <ConnectionStatusBadge
      label={ga4ConnectionLabel(status)}
      tone={status === 'linked' ? 'linked' : 'unlinked'}
    />
  );
}

function UnmatchedAdsDomainsModal({
  domains,
  syncing,
  onClose,
  onDismiss,
  onCreate,
}: {
  domains: AdsDiscoveredDomain[];
  syncing: boolean;
  onClose: () => void;
  onDismiss: (domain: string) => Promise<void>;
  onCreate: (domain: AdsDiscoveredDomain) => void;
}) {
  return (
    <div className="fixed inset-0 m-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[860px] max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-[16px] font-bold">未連結的廣告網域</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              從 Google Ads（廣告目的地網域）與 Google Analytics（GA4 Property 資料串流）偵測到、尚未對應到網站列表的網域。每個網域會標示來源為 Google Ads、Google Analytics，或兩者皆有。請建立網站或略過。
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded" disabled={syncing}>
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
          {domains.length === 0 ? (
            <div className="text-[13px] text-muted-foreground py-8 text-center">沒有待處理網域</div>
          ) : (
            [...domains]
              .sort((a, b) => {
                const originDiff = originSortRank(domainSourceOrigin(a.sources)) -
                  originSortRank(domainSourceOrigin(b.sources));
                if (originDiff !== 0) return originDiff;
                return a.normalizedDomain.localeCompare(b.normalizedDomain, 'en');
              })
              .map((d) => {
              const refs = d.sourceRefs || [];
              const shown = refs.slice(0, 4);
              const extra = Math.max(0, refs.length - shown.length);
              const origin = domainSourceOrigin(d.sources);
              const originLabel = domainSourceOriginLabel(origin);
              return (
                <div
                  key={d.normalizedDomain}
                  className="flex flex-wrap items-start justify-between gap-3 border border-border rounded-md px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate">{d.normalizedDomain}</div>
                    {d.sampleUrl ? (
                      <div className="text-[11px] text-muted-foreground truncate max-w-[520px]">{d.sampleUrl}</div>
                    ) : null}
                    <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
                      <span className="text-[11px] text-muted-foreground">來源</span>
                      <span
                        className={cn(
                          'text-[11px] font-semibold px-1.5 py-0.5 rounded border',
                          origin === 'both' && 'bg-teal-50 text-teal-800 border-teal-200',
                          origin === 'ads' && 'bg-amber-50 text-amber-800 border-amber-200',
                          origin === 'analytics' && 'bg-orange-50 text-orange-800 border-orange-200',
                          origin === 'facebook' && 'bg-blue-50 text-blue-800 border-blue-200',
                          origin === 'unknown' && 'bg-muted text-muted-foreground border-border',
                        )}
                      >
                        {originLabel}
                      </span>
                      {(d.sources || []).map((s) => (
                        <span
                          key={s}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                        >
                          {adsPlatformSourceLabel(s)}
                        </span>
                      ))}
                    </div>
                    {shown.length > 0 ? (
                      <div className="mt-2 space-y-1.5">
                        {shown.map((ref, idx) => (
                          <div
                            key={`${ref.platform}-${ref.accountId}-${ref.campaignId || ''}-${ref.pageId || ''}-${idx}`}
                            className="text-[11px] leading-snug rounded border border-slate-100 bg-slate-50 px-2 py-1.5"
                          >
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={cn(
                                  'text-[10px] font-semibold px-1 py-0.5 rounded',
                                  ref.platform === 'google'
                                    ? 'bg-amber-100 text-amber-800'
                                    : ref.platform === 'ga4'
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-blue-100 text-blue-800',
                                )}
                              >
                                {adsPlatformSourceLabel(ref.platform)}
                              </span>
                              <span className="text-muted-foreground">帳戶</span>
                              <span className="font-medium text-foreground truncate max-w-[280px]">
                                {ref.accountName || ref.accountId}
                              </span>
                              <span className="text-muted-foreground truncate">({ref.accountId})</span>
                            </div>
                            {ref.campaignId || ref.campaignName ? (
                              <div className="mt-0.5 text-muted-foreground">
                                {ref.platform === 'ga4' ? 'Property：' : 'Campaign：'}
                                <span className="text-foreground font-medium ml-1">
                                  {ref.campaignName || ref.campaignId}
                                </span>
                                {ref.campaignId && ref.campaignName ? (
                                  <span className="ml-1">({ref.campaignId})</span>
                                ) : null}
                              </div>
                            ) : (
                              <div className="mt-0.5 text-muted-foreground">
                                {ref.platform === 'ga4' ? 'Property：—' : 'Campaign：—'}
                              </div>
                            )}
                          </div>
                        ))}
                        {extra > 0 ? (
                          <div className="text-[11px] text-muted-foreground">另有 {extra} 個帳戶／明細…</div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        尚無帳戶／Property 明細（請再按一次「同步廣告網域」）
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={syncing}
                      onClick={() => onCreate(d)}
                      className="px-2.5 py-1.5 text-[12px] font-medium rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      建立網站
                    </button>
                    <button
                      type="button"
                      disabled={syncing}
                      onClick={() => void onDismiss(d.normalizedDomain)}
                      className="px-2.5 py-1.5 text-[12px] font-medium rounded-md border border-border hover:bg-muted disabled:opacity-50"
                    >
                      略過
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="px-6 py-3 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[13px] rounded-md border border-border hover:bg-muted bg-white"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Website List =====
function WebsiteList({ onSelectSite, profileTypeFilter }: { onSelectSite: (site: WebsiteProfileFull) => void; profileTypeFilter?: 'all' | 'website' | 'system' }) {
  const { profiles: websiteProfiles, loading: profilesLoading, addProfile, updateProfile } = useWebsiteProfiles();
  const {
    unmatched,
    syncing: adsSyncing,
    syncDomains,
    dismissDomain,
    markLinkedAndRelink,
  } = useAdsWebsiteLinks();
  const {
    googleAdsByWebsiteId,
    ga4StatusFor,
    refresh: refreshConnectionStatus,
  } = useWebsiteConnectionStatus();
  const { companies } = useCompanies();
  const { brands } = useBrands();
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'internal' | 'client'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'website' | 'system'>(profileTypeFilter || 'all');
  const [levelFilter, setLevelFilter] = useState<number[]>([]);
  const [adsFilter, setAdsFilter] = useState<'all' | 'with' | 'without'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUnmatchedModal, setShowUnmatchedModal] = useState(false);
  const [pendingCreateDomain, setPendingCreateDomain] = useState<AdsDiscoveredDomain | null>(null);
  const [editingSite, setEditingSite] = useState<WebsiteProfileFull | null>(null);

  const filteredBrands = companyFilter === 'all'
    ? brands
    : brands.filter(b => {
        const co = companies.find(c => c.uuid === b.companyId || c.id === b.companyId);
        return co?.companyCode === companyFilter;
      });
  // Deduplicate brands by brandCode for the filter dropdown
  const uniqueBrandCodes = Array.from(
    new Map(filteredBrands.filter(b => b.isActive).map(b => [b.brandCode, b])).values()
  );
  // Map of brandCode -> set of brand ids (so filtering matches all brands sharing the same code)
  const brandIdsByCode = new Map<string, Set<string>>();
  brands.forEach(b => {
    if (!brandIdsByCode.has(b.brandCode)) brandIdsByCode.set(b.brandCode, new Set());
    brandIdsByCode.get(b.brandCode)!.add(b.id);
  });

  const toggleLevelFilter = (lvl: number) => {
    setLevelFilter(prev => prev.includes(lvl) ? prev.filter(l => l !== lvl) : [...prev, lvl]);
  };

  const getWebsiteProjectCategory = (ws: WebsiteProfileFull) => resolveWebsiteProjectCategory(ws);

  const handleAddWebsite = async (data: WebsiteFormData) => {
    const domainToLink = pendingCreateDomain;
    const newSite = websiteFormDataToProfile(data, companies, brands);
    const err = await addProfile(newSite);
    if (err) {
      toast.error('新增失敗', { description: err.message });
      return;
    }
    toast.success(data.profileType === 'system' ? '系統已新增' : '網站已新增');
    setShowAddModal(false);
    setPendingCreateDomain(null);

    if (domainToLink) {
      const ga4PropertyId = (domainToLink.sourceRefs || []).find((ref) => ref.platform === 'ga4')?.campaignId;
      if (ga4PropertyId) {
        const { error: ga4Err } = await supabase
          .from('webandsystem_list')
          .update({ ga4_property_id: ga4PropertyId })
          .eq('id', newSite.id);
        if (ga4Err) {
          toast.error('網站已建立，但寫入 GA4 Property 失敗', { description: ga4Err.message });
        }
      }
      const linkRes = await markLinkedAndRelink(domainToLink.normalizedDomain, newSite.id);
      await refreshConnectionStatus();
      if (linkRes.ok) {
        toast.success('已重新連結廣告網域');
        setShowUnmatchedModal((linkRes.result?.unmatched?.length ?? 0) > 0);
      } else {
        toast.error('網站已建立，但重新連結失敗', { description: linkRes.error });
      }
    }
  };

  const handleSyncAdsDomains = async () => {
    const r = await syncDomains();
    if (!r.ok) {
      toast.error('同步廣告網域失敗', { description: r.error });
      return;
    }
    await refreshConnectionStatus();
    const unmatchedCount = r.result.unmatched?.length ?? 0;
    const g = r.result.google?.websitesLinked ?? 0;
    const campaigns = r.result.google?.campaignsWithLinks ?? 0;
    const pmax = r.result.google?.pmaxCampaignsWithLinks ?? 0;
    const ga4Linked = r.result.ga4?.websitesLinked ?? 0;
    const ga4Properties = r.result.ga4?.propertiesListed ?? 0;
    const errors = [
      ...(r.result.linkErrors || []),
      ...(r.result.google?.linkErrors || []),
      ...(r.result.ga4?.linkErrors || []),
    ];
    toast.success(
      `廣告網域同步完成（Google Ads 連結 ${g} 個網站、${campaigns} 個 Campaign，其中 PMax ${pmax}；Google Analytics 連結 ${ga4Linked} 個網站、${ga4Properties} 個 Property）`,
    );
    if (errors.length) {
      toast.error('部分同步錯誤', {
        description: errors.slice(0, 2).join(' '),
      });
    }
    if (unmatchedCount > 0) setShowUnmatchedModal(true);
    else if (!errors.length && (g > 0 || ga4Linked > 0)) toast.message('所有偵測到的網域皆已對應或略過');
    else if (!errors.length && g === 0 && ga4Linked === 0) {
      toast.message('未發現可連結的廣告或 Analytics 網域（請確認 Google Ads / GA4 API 權限、Search Final URL、PMax 資產組 URL 與 GA4 資料串流網域）');
    }
  };

  const handleEditWebsite = async (data: WebsiteFormData) => {
    if (!editingSite) return;
    const company = companies.find(c => c.uuid === data.companyId || c.id === data.companyId);
    const brandRow = brands.find(b => b.brandCode === data.brand && (b.companyId === (company?.uuid || company?.id) || !data.companyId))
      || brands.find(b => b.brandCode === data.brand);
    const updates = {
      websiteName: data.websiteName,
      domainUrl: data.domainUrl,
      companyId: company?.uuid || data.companyId,
      brandId: brandRow?.id || data.brandId || '',
      platform: data.platform as WebsiteProfileFull['platform'],
      hostingProvider: data.hostingProvider,
      company: company?.companyCode ?? editingSite.company ?? '',
      brand: brandRow?.brandCode || data.brand || editingSite.brand || '',
      level: data.level,
      status: data.status,
      notes: data.notes || undefined,
      profileType: data.profileType,
      projectCategory: data.projectCategory,
      systemType: data.systemType,
    };
    await updateProfile(editingSite.id, updates);
    setEditingSite(null);
  };

  const getEditFormData = (site: WebsiteProfileFull): WebsiteFormData => ({
    websiteName: site.websiteName,
    domainUrl: site.domainUrl || '',
    companyId: site.companyId,
    brandId: site.brandId,
    brand: site.brand || '',
    platform: site.platform,
    hostingProvider: site.hostingProvider || '',
    level: site.level,
    status: site.status,
    notes: site.notes || '',
    profileType: site.profileType || 'website',
    projectCategory: site.projectCategory === 'client' ? 'client' : 'internal',
    systemType: site.systemType,
  });

  const filtered = websiteProfiles.filter(ws => {
    if (typeFilter !== 'all') {
      const wsType = ws.profileType || 'website';
      if (wsType !== typeFilter) return false;
    }
    const adsStatus = googleAdsByWebsiteId[ws.id] || 'unlinked';
    if (adsFilter === 'with' && adsStatus === 'unlinked') return false;
    if (adsFilter === 'without' && adsStatus !== 'unlinked') return false;
    if (companyFilter !== 'all' && (ws.company || '') !== companyFilter) return false;
    if (brandFilter !== 'all') {
      const matchingIds = brandIdsByCode.get(brandFilter);
      if (!matchingIds || !matchingIds.has(ws.brandId)) return false;
    }
    if (statusFilter !== 'all' && ws.status !== statusFilter) return false;
    if (levelFilter.length > 0 && !levelFilter.includes(ws.level)) return false;
    if (categoryFilter !== 'all') {
      const { category } = getWebsiteProjectCategory(ws);
      if (category !== categoryFilter) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return ws.websiteName.toLowerCase().includes(q) || (ws.domainUrl || '').toLowerCase().includes(q) || (ws.brand || '').toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => b.totalHours - a.totalHours);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">{typeFilter === 'system' ? '系統列表' : typeFilter === 'website' ? '網站列表' : '網站+系統 列表'}</h1>
          <p className="text-[14px] text-muted-foreground mt-1">{typeFilter === 'system' ? '所有 System Profile 的管理樞紐。' : typeFilter === 'website' ? '所有 Website Profile 的管理樞紐。' : '所有網站與系統 Profile 的統一管理。'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={adsSyncing}
            onClick={() => void handleSyncAdsDomains()}
            className="flex items-center gap-1.5 px-3 py-2 border border-border bg-white text-foreground rounded-md text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(adsSyncing && 'animate-spin')} />
            同步廣告網域
            {unmatched.length > 0 ? (
              <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {unmatched.length}
              </span>
            ) : null}
          </button>
          {unmatched.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowUnmatchedModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-amber-200 bg-amber-50 text-amber-800 rounded-md text-sm font-medium hover:bg-amber-100 transition-colors"
            >
              <Megaphone size={14} />
              待建立網域
            </button>
          ) : null}
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]">
            <Plus size={14} />{typeFilter === 'system' ? '新增系統' : '新增網站'}
          </button>
        </div>
      </div>

      {/* Profile Type Quick Switch */}
      <div className="flex items-center gap-1.5">
        {(['all', 'website', 'system'] as const).map(type => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={cn(
              'px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200 flex items-center gap-1.5',
              typeFilter === type ? (type === 'system' ? 'bg-purple-600 text-white' : 'bg-teal-600 text-white') : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {type === 'all' && '全部'}
            {type === 'website' && <><Globe size={11} />網站</>}
            {type === 'system' && <><Server size={11} />系統</>}
          </button>
        ))}
      </div>

      {/* Category Quick Switch Tabs */}
      <div className="flex items-center gap-1.5">
        {(['all', 'internal', 'client'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              'px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200',
              categoryFilter === cat ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {cat === 'all' ? '全部' : cat === 'internal' ? '內部項目' : '客戶項目'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm flex-1 max-w-[260px] bg-white">
          <Search size={14} className="text-muted-foreground" />
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground" placeholder="搜尋網站名稱..." />
        </div>
        <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setBrandFilter('all'); }} className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white">
          <option value="all">所有公司</option>
          {Array.from(new Set(websiteProfiles.map(p => p.company || '').filter(Boolean))).sort().map(code => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white">
          <option value="all">所有品牌</option>
          {uniqueBrandCodes.map(b => (
            <option key={b.brandCode} value={b.brandCode}>{b.brandCode}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white">
          <option value="all">所有狀態</option>
          <option value="live">已上線</option>
          <option value="development">開發中</option>
          <option value="maintenance">維護中</option>
          <option value="archived">已封存</option>
        </select>
        <select
          value={adsFilter}
          onChange={(e) => setAdsFilter(e.target.value as 'all' | 'with' | 'without')}
          className="px-3 py-1.5 border border-border rounded-md text-[13px] bg-white"
        >
          <option value="all">Google Ads：全部</option>
          <option value="with">已連接</option>
          <option value="without">未連接</option>
        </select>
      </div>

      {/* Level Filter Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-muted-foreground font-medium">Level 篩選：</span>
        {([1, 2, 3, 4, 5] as WebsiteLevel[]).map(lvl => {
          const active = levelFilter.includes(lvl);
          return (
            <button
              key={lvl}
              onClick={() => toggleLevelFilter(lvl)}
              className={cn(
                'text-[11px] px-2 py-1 rounded-md border font-bold transition-all',
                active
                  ? levelConfig[lvl].className + ' shadow-sm'
                  : 'border-border bg-white text-muted-foreground hover:border-slate-400'
              )}
            >
              L{lvl} {levelConfig[lvl].label}
            </button>
          );
        })}
        {levelFilter.length > 0 && (
          <button onClick={() => setLevelFilter([])} className="text-[11px] text-rose-500 hover:underline ml-1">清除篩選</button>
        )}
      </div>

      {/* Results Count */}
      <div className="text-[12px] text-muted-foreground">
        {profilesLoading ? '載入中…' : `顯示 ${filtered.length} 個${typeFilter === 'system' ? '系統' : typeFilter === 'website' ? '網站' : '項目'}`}
      </div>

      {/* Content - Table Only */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] overflow-hidden">
        {profilesLoading ? (
          <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground gap-2">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full" />
            從資料庫載入中…
          </div>
        ) : null}
        <table className="w-full" style={{ display: profilesLoading ? 'none' : undefined }}>
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">名稱</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">類型</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">項目類型</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">LEVEL</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">平台</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">公司</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">品牌</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Google Ads</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Google Analytics</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">工時</th>
              <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(site => {
              const config = statusConfig[site.status];
              const { category, clientName } = resolveWebsiteProjectCategory(site);
              return (
                <tr key={site.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer">
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3">
                    <div>
                      <span className="text-[13px] font-medium block">{site.websiteName}</span>
                      <span className="text-[11px] text-teal-600">{site.domainUrl}</span>
                    </div>
                  </td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3"><ProfileTypeBadge profileType={site.profileType} size="small" /></td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3"><ProjectCategoryBadge category={category} clientName={clientName} size="sm" /></td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3"><WebsiteLevelBadge level={site.level} size="small" /></td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3"><MutedFieldBadge value={site.platform} /></td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3"><CompanyFieldBadge value={site.company} /></td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3"><BrandFieldBadge value={site.brand} /></td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3"><StatusFieldBadge config={config} /></td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3">
                    <GoogleAdsConnectionBadge status={googleAdsByWebsiteId[site.id] || 'unlinked'} />
                  </td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3">
                    <Ga4ConnectionBadge status={ga4StatusFor(site.id)} />
                  </td>
                  <td onClick={() => onSelectSite(site)} className="px-4 py-3 text-[13px] font-medium">{site.totalHours}h</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-0.5">
                      <OpenWebsiteUrlButton domainUrl={site.domainUrl} />
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingSite(site); }}
                        className="p-1.5 hover:bg-muted rounded-md transition-colors"
                        title="編輯網站"
                      >
                        <Pencil size={13} className="text-muted-foreground" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <WebsiteFormModal
          mode="add"
          initialData={
            pendingCreateDomain
              ? {
                  ...emptyFormData,
                  websiteName: pendingCreateDomain.normalizedDomain,
                  domainUrl: pendingCreateDomain.sampleUrl || `https://${pendingCreateDomain.normalizedDomain}`,
                  profileType: 'website',
                  status: 'live',
                }
              : undefined
          }
          onClose={() => {
            setShowAddModal(false);
            setPendingCreateDomain(null);
          }}
          onSave={handleAddWebsite}
        />
      )}

      {/* Edit Modal */}
      {editingSite && (
        <WebsiteFormModal
          mode="edit"
          initialData={getEditFormData(editingSite)}
          onClose={() => setEditingSite(null)}
          onSave={handleEditWebsite}
        />
      )}

      {showUnmatchedModal && (
        <UnmatchedAdsDomainsModal
          domains={unmatched}
          syncing={adsSyncing}
          onClose={() => setShowUnmatchedModal(false)}
          onDismiss={async (domain) => {
            const r = await dismissDomain(domain);
            if (!r.ok) toast.error('略過失敗', { description: r.error });
            else toast.message(`已略過 ${domain}`);
          }}
          onCreate={(domain) => {
            setPendingCreateDomain(domain);
            setShowUnmatchedModal(false);
            setShowAddModal(true);
          }}
        />
      )}
    </div>
  );
}

// ===== Featured Website Card (enhanced) =====
function FeaturedWebsiteCard({ site, onClick }: { site: WebsiteProfileFull; onClick: () => void }) {
  const config = statusConfig[site.status];
  const budgetPercent = site.budgetTotal ? Math.round((site.budgetUsed || 0) / site.budgetTotal * 100) : 0;
  const lastUpdate = '2024-12-01';

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-[0_2px_6px_rgba(0,20,40,0.05)] p-5 hover:shadow-[0_4px_14px_rgba(0,20,40,0.1)] transition-all duration-200 cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Star size={12} className="text-amber-400 fill-amber-400 shrink-0" />
            <h4 className="text-[15px] font-bold truncate group-hover:text-teal-700 transition-colors">{site.websiteName}</h4>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Globe size={11} className="text-muted-foreground shrink-0" />
            <a href={toExternalHref(site.domainUrl)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[12px] text-teal-600 hover:underline truncate">{site.domainUrl}</a>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <WebsiteLevelBadge level={site.level} />
          <StatusFieldBadge config={config} className="text-[10px]" />
        </div>
      </div>

      {/* Company / Brand */}
      <div className="flex items-center gap-2 mb-4">
        <CompanyFieldBadge value={site.company} />
        <BrandFieldBadge value={site.brand} />
        <MutedFieldBadge value={site.platform} className="capitalize" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 mb-4 pb-4 border-b border-border/50">
        <div className="text-center">
          <span className="text-[16px] font-bold text-blue-700 block">{site.videosCount}</span>
          <span className="text-[10px] text-muted-foreground">影片</span>
        </div>
        <div className="text-center">
          <span className="text-[16px] font-bold text-teal-700 block">{site.keywordsCount}</span>
          <span className="text-[10px] text-muted-foreground">關鍵字</span>
        </div>
      </div>

      {/* Budget bar */}
      {site.budgetTotal ? (
        <div className="mb-3">
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-muted-foreground">預算使用率</span>
            <span className={cn('font-medium', budgetPercent >= 90 ? 'text-rose-600' : budgetPercent >= 70 ? 'text-amber-600' : 'text-teal-600')}>{budgetPercent}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', budgetPercent >= 90 ? 'bg-rose-500' : budgetPercent >= 70 ? 'bg-amber-500' : 'bg-teal-500')}
              style={{ width: `${Math.min(budgetPercent, 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Last update */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>最近更新：{lastUpdate}</span>
        <ExternalLink size={11} className="text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

type FeaturedFilter = 'level_1_2' | 'all' | 'high_articles' | 'high_budget' | 'recently_updated' | 'live_maintenance';

// ===== Featured Websites =====
function FeaturedWebsites({ onSelectSite }: { onSelectSite: (site: WebsiteProfileFull) => void }) {
  const { profiles: websiteProfiles } = useWebsiteProfiles();
  const [activeFilter, setActiveFilter] = useState<FeaturedFilter>('level_1_2');

  const filters: { id: FeaturedFilter; label: string; desc: string }[] = [
    { id: 'level_1_2', label: '主打 + 重要', desc: 'Level 1-2' },
    { id: 'all', label: '全部網站', desc: '' },
    { id: 'high_articles', label: '高活躍度', desc: '影片數 > 0' },
    { id: 'high_budget', label: '高預算使用率', desc: '預算使用 > 70%' },
    { id: 'recently_updated', label: '最近更新', desc: '近期有新內容' },
    { id: 'live_maintenance', label: '已上線/維護中', desc: '' },
  ];

  const applyFilter = (sites: WebsiteProfileFull[]) => {
    switch (activeFilter) {
      case 'level_1_2': return sites.filter(ws => ws.level === 1 || ws.level === 2);
      case 'high_articles': return sites.filter(ws => ws.videosCount > 0);
      case 'high_budget': return sites.filter(ws => ws.budgetTotal ? (ws.budgetUsed || 0) / ws.budgetTotal > 0.7 : false);
      case 'recently_updated': return sites.filter(ws => ws.videosCount > 0);
      case 'live_maintenance': return sites.filter(ws => ws.status === 'live' || ws.status === 'maintenance');
      default: return sites;
    }
  };

  const featured = applyFilter(websiteProfiles).sort((a, b) => a.level - b.level);

  const filterDescription = activeFilter === 'level_1_2' ? '目前顯示：主打網站 + 重要網站（Level 1-2）' : activeFilter === 'all' ? '顯示所有網站' : '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">重點網站</h1>
          <p className="text-[14px] text-muted-foreground mt-1">已上線及重點追蹤的網站，含智能篩選器。</p>
        </div>
        <div className="text-[13px] text-muted-foreground bg-muted px-3 py-1.5 rounded-md">
          共 <span className="font-bold text-foreground">{featured.length}</span> 個網站
        </div>
      </div>

      {/* Current filter description */}
      {filterDescription && (
        <div className="bg-gradient-to-r from-amber-50 to-teal-50 border border-amber-200 rounded-md px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Star size={14} className="text-amber-500 fill-amber-400" />
            <span className="text-[13px] font-medium text-amber-800">{filterDescription}</span>
          </div>
        </div>
      )}

      {/* Smart filter buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border',
              activeFilter === f.id
                ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                : 'bg-white text-muted-foreground border-border hover:border-teal-400 hover:text-teal-700'
            )}
          >
            {f.id === 'level_1_2' && <Star size={11} />}
            {f.id === 'high_articles' && <TrendingUp size={11} />}
            {f.id === 'high_budget' && <span className="text-[10px]">💰</span>}
            {f.id === 'recently_updated' && <Calendar size={11} />}
            {f.id === 'live_maintenance' && <Globe size={11} />}
            {f.id === 'all' && <LayoutGrid size={11} />}
            {f.label}
            {f.desc && <span className="text-[10px] opacity-70">({f.desc})</span>}
          </button>
        ))}
        {activeFilter !== 'level_1_2' && (
          <button
            onClick={() => setActiveFilter('level_1_2')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
          >
            ✕ 重置篩選
          </button>
        )}
      </div>

      {featured.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-md">
          <Star size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-muted-foreground">沒有符合條件的網站</p>
          <p className="text-[12px] text-muted-foreground mt-1">嘗試更換篩選條件</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {featured.map(site => (
            <FeaturedWebsiteCard key={site.id} site={site} onClick={() => onSelectSite(site)} />
          ))}
        </div>
      )}
    </div>
  );
}

function websiteListPageOf(subModule?: string): WebsiteListPage {
  if (subModule === 'system-list' || subModule === 'featured') return subModule;
  return 'list';
}

// ===== Main Export =====
export function WebsiteModule({ subModule }: { subModule?: string }) {
  const { profiles, loading } = useWebsiteProfiles();
  const listPage = websiteListPageOf(subModule);
  const [selectedSite, setSelectedSite] = useState<WebsiteProfileFull | null>(null);
  const [detailId, setDetailId] = useState<string | null>(() => {
    if (subModule === 'traffic') return null;
    return readSelectedWebsiteId();
  });

  useEffect(() => {
    const sync = () => {
      if (subModule === 'traffic') {
        setDetailId(null);
        setSelectedSite(null);
        return;
      }
      const id = readSelectedWebsiteId();
      setDetailId(id);
      if (!id) {
        setSelectedSite(null);
        return;
      }
      const site = profiles.find((p) => p.id === id) ?? null;
      setSelectedSite(site);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [profiles, subModule]);

  const handleSelectSite = (site: WebsiteProfileFull) => {
    writeSelectedWebsiteId(site.id);
    setWebsiteDetailHash(listPage, site.id);
    setDetailId(site.id);
    setSelectedSite(site);
  };

  const handleBackFromSite = () => {
    writeSelectedWebsiteId(null);
    setWebsiteDetailHash(listPage, null);
    setDetailId(null);
    setSelectedSite(null);
  };

  if (subModule === 'traffic') {
    return <Ga4TrafficModule />;
  }

  if (detailId) {
    if (loading && !selectedSite) {
      return <div className="text-[13px] text-muted-foreground py-12 text-center">載入中…</div>;
    }
    if (!selectedSite) {
      return (
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleBackFromSite}
            className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> 返回網站列表
          </button>
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
            找不到此網站 / 系統紀錄（id: {detailId}）
          </div>
        </div>
      );
    }
    return (
      <WebsiteDetail
        site={selectedSite}
        onBack={handleBackFromSite}
        onSitePatch={patch => setSelectedSite(s => (s ? { ...s, ...patch } : null))}
      />
    );
  }

  switch (subModule) {
    case 'system-list':
      return <WebsiteList onSelectSite={handleSelectSite} profileTypeFilter="system" />;
    case 'featured':
      return <FeaturedWebsites onSelectSite={handleSelectSite} />;
    case 'traffic':
      return <Ga4TrafficModule />;
    case 'list':
      return <WebsiteList onSelectSite={handleSelectSite} />;
    default:
      return <WebsiteList onSelectSite={handleSelectSite} />;
  }
}
