import { useState, useMemo } from 'react';
import { Plus, Search, X, ArrowLeft, Eye, Link2, CreditCard, Edit, Trash2, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { websiteProfiles } from '@/data/websiteData';
import { projects as allProjectsData } from '@/data/mockData';
import { getProjectCategory } from '@/components/ui/project-category-badge';
import { Button } from '@/components/ui/button';
import { useDataStore } from '@/context/DataStore';
import { usePaidAds } from '@/hooks/usePaidAds';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

function getAdProjectCategory(websiteName: string) {
  const ws = websiteProfiles.find(w => w.websiteName === websiteName);
  return getProjectCategory(ws?.projectId, allProjectsData);
}

const platformLabels: Record<string, string> = {
  google_ads: 'Google Ads',
  facebook: 'Facebook Ads',
  instagram: 'Instagram Ads',
  xiaohongshu: '小紅書',
  other: '其他',
};

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  planning: { label: '規劃中', color: 'text-slate-700', bg: 'bg-slate-100' },
  active: { label: '投放中', color: 'text-teal-700', bg: 'bg-teal-100' },
  paused: { label: '已暫停', color: 'text-amber-700', bg: 'bg-amber-100' },
  completed: { label: '已結束', color: 'text-gray-600', bg: 'bg-gray-100' },
};

function PaidAdDetail({ ad, onBack }: { ad: any; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'info' | 'websites' | 'trends'>('info');
  const [linkedWebsites, setLinkedWebsites] = useState<string[]>(
    ad.websiteName ? [ad.websiteName] : []
  );
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const sConfig = statusConfig[ad.status] || statusConfig.planning;

  const tabs = [
    { id: 'info', label: '基本資訊 + 成效' },
    { id: 'websites', label: '關聯網站 + 信用卡' },
    { id: 'trends', label: '每日數據趨勢' },
  ] as const;

  // Daily trends require a dedicated time-series table — not fabricated
  const trendData: { date: string; impressions: number; clicks: number; conversions: number }[] = [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200">
          <ArrowLeft size={14} /> 返回付費廣告列表
        </button>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-[12px]">
            <Edit size={12} /> 編輯
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-[12px] text-rose-500 border-rose-200 hover:bg-rose-50" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 size={12} /> 刪除
          </Button>
        </div>
      </div>

      {/* Context Bar */}
      <div className="bg-slate-50 rounded-md border border-slate-200 p-3 flex items-center gap-4 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">所屬公司:</span> {ad.company}
        <span className="mx-1">•</span>
        <span className="font-medium text-foreground">品牌:</span> {ad.brand}
        <span className="mx-1">•</span>
        <span className="font-medium text-foreground">平台:</span> {platformLabels[ad.platform] || ad.platform}
        <span className="mx-1">•</span>
        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sConfig.bg, sConfig.color)}>{sConfig.label}</span>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-border gap-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-[1px]',
              activeTab === tab.id
                ? 'text-teal-600 border-teal-600'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Basic Info + Performance */}
      {activeTab === 'info' && (
        <div className="space-y-4">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <h3 className="text-[16px] font-bold mb-4">{ad.campaignName}</h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-[13px]">
              <div><span className="text-muted-foreground">廣告類型:</span> <span className="font-medium">{ad.adType || '—'}</span></div>
              <div><span className="text-muted-foreground">預算:</span> <span className="font-medium">{ad.currency || 'HKD'} ${ad.budget?.toLocaleString() || '—'}</span></div>
              <div><span className="text-muted-foreground">實際花費:</span> <span className="font-medium">{ad.currency || 'HKD'} ${ad.actualSpend?.toLocaleString() || '—'}</span></div>
              <div><span className="text-muted-foreground">投放日期:</span> <span className="font-medium">{ad.startDate} — {ad.endDate || '進行中'}</span></div>
              <div><span className="text-muted-foreground">目標受眾:</span> <span className="font-medium">{ad.targetAudience || '—'}</span></div>
              <div><span className="text-muted-foreground">預算使用率:</span> <span className={cn('font-medium', ad.budget && ad.actualSpend && (ad.actualSpend / ad.budget >= 0.8) ? 'text-amber-600' : '')}>{ad.budget ? `${Math.round((ad.actualSpend || 0) / ad.budget * 100)}%` : '—'}</span></div>
            </div>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <h3 className="text-[16px] font-bold mb-4">成效數據</h3>
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="text-center p-3 bg-muted/20 rounded-md">
                <p className="text-[18px] font-bold">{ad.impressions?.toLocaleString() || '—'}</p>
                <span className="text-[11px] text-muted-foreground">曝光量</span>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-md">
                <p className="text-[18px] font-bold text-blue-600">{ad.clicks?.toLocaleString() || '—'}</p>
                <span className="text-[11px] text-muted-foreground">點擊</span>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-md">
                <p className="text-[18px] font-bold text-teal-600">{ad.conversions || '—'}</p>
                <span className="text-[11px] text-muted-foreground">轉換</span>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-md">
                <p className="text-[18px] font-bold text-amber-600">{ad.ctr ? `${ad.ctr}%` : '—'}</p>
                <span className="text-[11px] text-muted-foreground">CTR</span>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-md">
                <p className="text-[18px] font-bold">${ad.cpc || '—'}</p>
                <span className="text-[11px] text-muted-foreground">CPC</span>
              </div>
              <div className="text-center p-3 bg-muted/20 rounded-md">
                <p className="text-[18px] font-bold text-purple-600">{ad.roas ? `${ad.roas}x` : '—'}</p>
                <span className="text-[11px] text-muted-foreground">ROAS</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Linked Websites + Credit Card */}
      {activeTab === 'websites' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold">關聯網站（{linkedWebsites.length}）</h3>
              <button onClick={() => setShowLinkModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
                <Link2 size={12} /> 管理關聯
              </button>
            </div>
            {linkedWebsites.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-[13px]">尚未關聯任何網站</div>
            ) : (
              <div className="space-y-2">
                {linkedWebsites.map(ws => (
                  <div key={ws} className="flex items-center justify-between text-[13px] bg-muted/30 rounded px-4 py-3 border border-border/50">
                    <div className="flex items-center gap-2">
                      <Globe size={14} className="text-teal-600" />
                      <span className="font-medium">{ws}</span>
                    </div>
                    <button onClick={() => setLinkedWebsites(prev => prev.filter(w => w !== ws))} className="text-muted-foreground hover:text-red-500 p-1">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <h3 className="text-[16px] font-bold mb-4">付款信用卡</h3>
            <div className="flex items-center gap-3 p-4 border border-border rounded-md">
              <CreditCard size={20} className="text-muted-foreground" />
              <div>
                <p className="text-[13px] font-medium">{ad.creditCardId ? `**** **** **** ${ad.creditCardId}` : '未綁定信用卡'}</p>
                <p className="text-[11px] text-muted-foreground">公司信用卡</p>
              </div>
            </div>
            {ad.notes && (
              <div className="mt-4 pt-4 border-t border-border">
                <h4 className="text-[13px] font-bold mb-2">備註</h4>
                <p className="text-[13px] text-muted-foreground">{ad.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Daily Trend Chart */}
      {activeTab === 'trends' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <h3 className="text-[16px] font-bold mb-4">每日數據趨勢（過去 14 天）</h3>
          {trendData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-[13px] text-muted-foreground">
              暫無每日趨勢數據（需接入廣告平台或時間序列表）
            </div>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="impressions" stroke="#0d9488" strokeWidth={2} name="曝光量" dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} name="點擊數" dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="conversions" stroke="#8b5cf6" strokeWidth={2} name="轉換數" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowLinkModal(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-[480px] max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold">選擇關聯網站（可多選）</h3>
              <button onClick={() => setShowLinkModal(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="space-y-2">
              {websiteProfiles.map(wp => (
                <label key={wp.id} className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-muted/30 cursor-pointer transition-colors duration-200">
                  <input
                    type="checkbox"
                    checked={linkedWebsites.includes(wp.websiteName)}
                    onChange={(e) => {
                      if (e.target.checked) setLinkedWebsites(prev => [...prev, wp.websiteName]);
                      else setLinkedWebsites(prev => prev.filter(w => w !== wp.websiteName));
                    }}
                    className="rounded border-border text-teal-600 focus:ring-teal-600"
                  />
                  <div>
                    <p className="text-[13px] font-medium">{wp.websiteName}</p>
                    <p className="text-[11px] text-muted-foreground">{wp.company} / {wp.brand}</p>
                  </div>
                </label>
              ))}
            </div>
            <button onClick={() => setShowLinkModal(false)} className="mt-4 w-full py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200">確認</button>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-[400px]">
            <h3 className="text-[16px] font-bold mb-2">確認刪除</h3>
            <p className="text-[13px] text-muted-foreground mb-4">確認要刪除此廣告活動嗎？此操作無法撤銷。</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>取消</Button>
              <Button size="sm" className="bg-rose-500 hover:bg-rose-600 text-white" onClick={() => { setShowDeleteConfirm(false); onBack(); }}>刪除</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PaidAdsModule() {
  const { websites } = useDataStore();
  const { ads, addAd, deleteAd } = usePaidAds();
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'internal' | 'client'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAd, setSelectedAd] = useState<any | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [newAd, setNewAd] = useState({
    websiteProfileId: '',
    campaignName: '',
    platform: 'google_ads' as any,
    status: 'planning' as any,
    budget: 0,
    currency: 'HKD' as const,
    startDate: '',
    endDate: '',
    reportDate: '',
    manHours: 0,
    asanaLink: '',
    outputLink: '',
  });

  const siteMap = useMemo(() => new Map(websites.map(w => [w.id, w])), [websites]);
  const allAds = useMemo(() => ads.map(a => {
    const site = a.websiteProfileId ? siteMap.get(a.websiteProfileId) : undefined;
    return {
      ...a,
      websiteName: site?.websiteName || a.websiteProfileId || '',
      company: site?.company || '',
      brand: site?.brand || '',
    };
  }), [ads, siteMap]);

  const filteredAds = allAds.filter(ad => {
    if (filterPlatform !== 'all' && ad.platform !== filterPlatform) return false;
    if (filterStatus !== 'all' && ad.status !== filterStatus) return false;
    if (categoryFilter !== 'all') {
      const { category } = getAdProjectCategory(ad.websiteName || '');
      if (category !== categoryFilter) return false;
    }
    if (searchQuery && !ad.campaignName?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const totalSpend = allAds.reduce((s, a) => s + (a.actualSpend || 0), 0);
  const activeCount = allAds.filter(a => a.status === 'active').length;

  if (selectedAd) {
    return <PaidAdDetail ad={selectedAd} onBack={() => setSelectedAd(null)} />;
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">廣告總數</span>
          <p className="text-[18px] font-bold">{allAds.length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">進行中</span>
          <p className="text-[18px] font-bold text-teal-600">{activeCount}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">總花費</span>
          <p className="text-[18px] font-bold">HKD ${totalSpend.toLocaleString()}</p>
        </div>
      </div>

      {/* Category Quick Switch */}
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
        <div className="relative flex-1 max-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜尋廣告..." className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" />
        </div>
        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)} className="px-2.5 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600">
          <option value="all">全部平台</option>
          {Object.entries(platformLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-2.5 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600">
          <option value="all">全部狀態</option>
          {Object.entries(statusConfig).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>
        <button onClick={() => setShowAddModal(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
          <Plus size={12} /> 新增廣告
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">平台</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">活動名稱</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">網站</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">預算</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">花費</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">CTR</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredAds.map((ad) => {
              const sConfig = statusConfig[ad.status] || statusConfig.planning;
              return (
                <tr key={ad.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                  <td className="px-4 py-3 text-[12px]">{platformLabels[ad.platform] || ad.platform}</td>
                  <td className="px-4 py-3 font-medium">{ad.campaignName}</td>
                  <td className="px-4 py-3 text-[12px] text-teal-600">{ad.websiteName}</td>
                  <td className="px-4 py-3">${ad.budget?.toLocaleString() || '—'}</td>
                  <td className="px-4 py-3">${ad.actualSpend?.toLocaleString() || '—'}</td>
                  <td className="px-4 py-3">{ad.ctr ? `${ad.ctr}%` : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sConfig.bg, sConfig.color)}>{sConfig.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setSelectedAd(ad)} className="text-[11px] text-teal-600 hover:underline flex items-center gap-1">
                        <Eye size={10} /> 詳情
                      </button>
                      <button
                        onClick={() => { setDeleteTarget(ad); setShowDeleteModal(true); }}
                        className="p-1 hover:bg-muted rounded transition-colors"
                      >
                        <Trash2 size={10} className="text-rose-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredAds.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-[13px]">沒有符合條件的廣告活動</div>
      )}

      {/* Add Modal */}
      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增付費廣告" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬網站 *</label>
            <Select value={newAd.websiteProfileId} onValueChange={(val) => setNewAd({ ...newAd, websiteProfileId: val })}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="選擇網站" /></SelectTrigger>
              <SelectContent>{websites.map(w => <SelectItem key={w.id} value={w.id}>{w.websiteName} ({w.company}/{w.brand})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">活動名稱 *</label>
            <Input value={newAd.campaignName} onChange={(e) => setNewAd({ ...newAd, campaignName: e.target.value })} className="h-9 text-[13px]" placeholder="輸入活動名稱" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">平台</label>
              <Select value={newAd.platform} onValueChange={(val: any) => setNewAd({ ...newAd, platform: val })}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(platformLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">狀態</label>
              <Select value={newAd.status} onValueChange={(val: any) => setNewAd({ ...newAd, status: val })}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">預算 (HKD)</label>
              <Input type="number" value={newAd.budget} onChange={(e) => setNewAd({ ...newAd, budget: parseInt(e.target.value) || 0 })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">開始日期</label>
              <Input type="date" value={newAd.startDate} onChange={(e) => setNewAd({ ...newAd, startDate: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">結束日期</label>
              <Input type="date" value={newAd.endDate} onChange={(e) => setNewAd({ ...newAd, endDate: e.target.value })} className="h-9 text-[13px]" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">日報日期</label>
              <Input type="date" value={newAd.reportDate} onChange={(e) => setNewAd({ ...newAd, reportDate: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">工時 (h)</label>
              <Input type="number" step={0.5} value={newAd.manHours} onChange={(e) => setNewAd({ ...newAd, manHours: parseFloat(e.target.value) || 0 })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">成果連結</label>
              <Input value={newAd.outputLink} onChange={(e) => setNewAd({ ...newAd, outputLink: e.target.value })} className="h-9 text-[13px]" placeholder="https://..." />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">Asana 連結</label>
            <Input value={newAd.asanaLink} onChange={(e) => setNewAd({ ...newAd, asanaLink: e.target.value })} className="h-9 text-[13px]" placeholder="https://app.asana.com/..." />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => {
              void (async () => {
                if (!(newAd.websiteProfileId && newAd.campaignName)) return;
                const { error } = await addAd({
                  websiteProfileId: newAd.websiteProfileId,
                  campaignName: newAd.campaignName,
                  platform: newAd.platform,
                  adType: 'search',
                  budget: newAd.budget,
                  actualSpend: 0,
                  currency: newAd.currency,
                  startDate: newAd.startDate || '',
                  endDate: newAd.endDate || undefined,
                  status: newAd.status,
                  reportDate: newAd.reportDate || undefined,
                  manHours: newAd.manHours || undefined,
                  asanaLink: newAd.asanaLink || undefined,
                  outputLink: newAd.outputLink || undefined,
                });
                if (error) {
                  toast.error(`新增失敗：${error.message}`);
                  return;
                }
                setNewAd({ websiteProfileId: '', campaignName: '', platform: 'google_ads', status: 'planning', budget: 0, currency: 'HKD', startDate: '', endDate: '', reportDate: '', manHours: 0, asanaLink: '', outputLink: '' });
                setShowAddModal(false);
              })();
            }}>新增</Button>
          </div>
        </div>
      </CrudModal>

      {/* Delete Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => {
          void (async () => {
            if (deleteTarget) {
              const error = await deleteAd(deleteTarget.id);
              if (error) {
                toast.error(`刪除失敗：${error.message}`);
                return;
              }
            }
            setShowDeleteModal(false);
            setDeleteTarget(null);
          })();
        }}
        itemName={deleteTarget?.campaignName || '廣告活動'}
        canDelete={true}
        reasons={[]}
      />
    </div>
  );
}
