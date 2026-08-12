import { useState, useMemo, useEffect } from 'react';
import { Plus, Search, X, ArrowLeft, Eye, Link2, Sparkles, TrendingUp, TrendingDown, Edit, Trash2, Globe, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { websiteProfiles } from '@/data/websiteData';
import { projects as allProjectsData } from '@/data/mockData';
import { getProjectCategory } from '@/components/ui/project-category-badge';
import { Button } from '@/components/ui/button';
import { useWebsiteProfiles } from '@/hooks/useWebsiteProfiles';
import { useSeoKeywords } from '@/hooks/useSeoKeywords';
import type { SeoKeywordRow } from '@/types/seo';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type SeoKeywordView = SeoKeywordRow & {
  websiteProfileId: string;
  websiteName: string;
  company: string;
  brand: string;
  searchVolume: number | null;
  currentRanking: number | null;
  targetRanking: number | null;
  targetPage: string | null;
  difficultyScore: number | null;
  aiGenerated: boolean;
};

function toView(kw: SeoKeywordRow): SeoKeywordView {
  return {
    ...kw,
    websiteProfileId: kw.website_profile_id,
    websiteName: kw.websiteName || '',
    company: kw.company || '',
    brand: kw.brand || '',
    searchVolume: kw.search_volume,
    currentRanking: kw.current_ranking,
    targetRanking: kw.target_ranking,
    targetPage: kw.target_page,
    difficultyScore: kw.difficulty_score,
    aiGenerated: kw.ai_generated,
  };
}

function getSeoProjectCategory(websiteName: string) {
  const ws = websiteProfiles.find(w => w.websiteName === websiteName);
  return getProjectCategory(ws?.projectId, allProjectsData);
}

const levelConfig: Record<string, { label: string; color: string; bg: string }> = {
  level_1: { label: 'S1 核心', color: 'text-red-700', bg: 'bg-red-100' },
  level_2: { label: 'S2 次要', color: 'text-amber-700', bg: 'bg-amber-100' },
  level_3: { label: 'S3 長尾', color: 'text-blue-700', bg: 'bg-blue-100' },
};

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  monitoring: { label: '監測中', color: 'text-blue-700', bg: 'bg-blue-100' },
  optimizing: { label: '優化中', color: 'text-amber-700', bg: 'bg-amber-100' },
  achieved: { label: '已達標', color: 'text-teal-700', bg: 'bg-teal-100' },
  paused: { label: '已暫停', color: 'text-gray-600', bg: 'bg-gray-100' },
};

function SeoKeywordDetail({
  keyword,
  onBack,
  onDelete,
  fetchRankingHistory,
}: {
  keyword: SeoKeywordView;
  onBack: () => void;
  onDelete: (id: string) => Promise<void>;
  fetchRankingHistory: (keywordId: string) => Promise<{ metric_date: string; ranking_position: number | null }[]>;
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'websites' | 'history'>('info');
  const [linkedWebsites, setLinkedWebsites] = useState<string[]>(
    keyword.websiteName ? [keyword.websiteName] : []
  );
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [rankingHistory, setRankingHistory] = useState<{ month: string; ranking: number }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const lConfig = levelConfig[keyword.level] || levelConfig.level_3;
  const sConfig = statusConfig[keyword.status] || statusConfig.monitoring;

  const tabs = [
    { id: 'info', label: '關鍵字資訊' },
    { id: 'websites', label: '關聯網站' },
    { id: 'history', label: '歷史排名變化' },
  ] as const;

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    void fetchRankingHistory(keyword.id).then((rows) => {
      if (cancelled) return;
      setRankingHistory(
        rows
          .filter((r) => r.ranking_position != null)
          .map((r) => {
            const d = new Date(r.metric_date);
            return {
              month: Number.isNaN(d.getTime())
                ? r.metric_date
                : `${d.getMonth() + 1}/${d.getDate()}`,
              ranking: Number(r.ranking_position),
            };
          }),
      );
      setHistoryLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [keyword.id, fetchRankingHistory]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200">
          <ArrowLeft size={14} /> 返回 SEO 關鍵字列表
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
        <span className="font-medium text-foreground">所屬公司:</span> {keyword.company}
        <span className="mx-1">•</span>
        <span className="font-medium text-foreground">品牌:</span> {keyword.brand}
        <span className="mx-1">•</span>
        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', lConfig.bg, lConfig.color)}>{lConfig.label}</span>
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

      {/* Tab 1: Keyword Info */}
      {activeTab === 'info' && (
        <div className="space-y-4">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <h3 className="text-[20px] font-bold mb-4">{keyword.keyword}</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-[13px]">
              <div className="text-center bg-muted/20 rounded-md p-3">
                <p className="text-[20px] font-bold">{keyword.searchVolume?.toLocaleString() || '—'}</p>
                <span className="text-[11px] text-muted-foreground">月搜尋量</span>
              </div>
              <div className="text-center bg-muted/20 rounded-md p-3">
                <p className="text-[20px] font-bold text-amber-600">#{keyword.currentRanking ?? '—'}</p>
                <span className="text-[11px] text-muted-foreground">GSC 平均排名</span>
              </div>
              <div className="text-center bg-muted/20 rounded-md p-3">
                <p className="text-[20px] font-bold text-teal-600">#{keyword.targetRanking ?? '—'}</p>
                <span className="text-[11px] text-muted-foreground">目標排名</span>
              </div>
              <div className="text-center bg-muted/20 rounded-md p-3">
                <p className="text-[20px] font-bold">{keyword.difficultyScore ?? '—'}</p>
                <span className="text-[11px] text-muted-foreground">難度分數</span>
              </div>
            </div>
          </div>

          {/* Ranking Progress */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <h3 className="text-[16px] font-bold mb-4">排名趨勢</h3>
            <div className="flex items-center gap-3">
              {keyword.currentRanking && keyword.targetRanking && keyword.currentRanking <= keyword.targetRanking ? (
                <div className="flex items-center gap-2 text-teal-600">
                  <TrendingUp size={16} />
                  <span className="text-[14px] font-medium">已達成目標排名！</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-600">
                  <TrendingDown size={16} />
                  <span className="text-[14px] font-medium">
                    距離目標還需提升 {(keyword.currentRanking || 50) - (keyword.targetRanking || 1)} 位
                  </span>
                </div>
              )}
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                <span>GSC 平均排名: #{keyword.currentRanking ?? '—'}</span>
                <span>目標: #{keyword.targetRanking ?? '—'}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-600 rounded-full transition-all duration-500"
                  style={{ width: `${keyword.currentRanking && keyword.targetRanking ? Math.min(100, Math.round((1 - (keyword.currentRanking - keyword.targetRanking) / keyword.currentRanking) * 100)) : 0}%` }}
                />
              </div>
            </div>
          </div>

          {/* Basic Info + AI */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
              <h3 className="text-[14px] font-bold mb-3">基本資料</h3>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">目標頁面</span>
                  <span className="font-medium">{keyword.targetPage || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">AI 生成</span>
                  <span className="font-medium">{keyword.aiGenerated ? '是' : '否'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">所屬網站</span>
                  <span className="text-teal-600">{keyword.websiteName || '—'}</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-bold">AI 相關關鍵字建議</h3>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
                  <Sparkles size={12} /> 生成建議
                </button>
              </div>
              <p className="text-[12px] text-muted-foreground">點擊「生成建議」以獲取 AI 推薦的相關關鍵字</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Linked Websites */}
      {activeTab === 'websites' && (
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
      )}

      {/* Tab 3: Ranking History Chart */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <h3 className="text-[16px] font-bold mb-4">歷史排名變化（GSC）</h3>
          <p className="text-[12px] text-muted-foreground mb-4">排名越低（數字越小）代表越好的搜尋表現</p>
          {historyLoading ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-[13px]">
              <Loader2 size={16} className="animate-spin mr-2" /> 載入中…
            </div>
          ) : rankingHistory.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-[13px]">
              尚無 GSC 排名歷史，請先同步 Google Search Console
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rankingHistory} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis reversed tick={{ fontSize: 11 }} domain={['auto', 'auto']} label={{ value: '排名', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(value: number) => [`#${Math.round(value)}`, 'GSC 平均排名']} />
                  <Line type="monotone" dataKey="ranking" stroke="#0d9488" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {keyword.targetRanking && (
            <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-2">
              <div className="w-3 h-0.5 bg-teal-600" />
              <span className="text-[11px] text-muted-foreground">目標排名: #{keyword.targetRanking}</span>
            </div>
          )}
        </div>
      )}

      {/* Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[100]" onClick={() => setShowLinkModal(false)}>
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
        <div className="fixed inset-0 m-0 bg-black/40 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-lg shadow-xl p-6 w-[400px]">
            <h3 className="text-[16px] font-bold mb-2">確認刪除</h3>
            <p className="text-[13px] text-muted-foreground mb-4">確認要刪除此關鍵字嗎？此操作無法撤銷。</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>取消</Button>
              <Button
                size="sm"
                className="bg-rose-500 hover:bg-rose-600 text-white"
                onClick={async () => {
                  await onDelete(keyword.id);
                  setShowDeleteConfirm(false);
                  onBack();
                }}
              >
                刪除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SeoKeywordsModule() {
  const { profiles: websites } = useWebsiteProfiles();
  const {
    keywords,
    loading,
    error,
    syncGsc,
    syncing,
    lastSyncRun,
    addKeyword,
    deleteKeyword,
    fetchRankingHistory,
  } = useSeoKeywords();
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'internal' | 'client'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKeyword, setSelectedKeyword] = useState<SeoKeywordView | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SeoKeywordView | null>(null);
  const [newKeyword, setNewKeyword] = useState({
    websiteProfileId: '',
    keyword: '',
    level: 'level_1' as SeoKeywordRow['level'],
    status: 'monitoring' as SeoKeywordRow['status'],
    searchVolume: 0,
    currentRanking: 0,
    targetRanking: 0,
    difficultyScore: 0,
  });

  const allKeywords = useMemo(() => keywords.map(toView), [keywords]);

  const filteredKeywords = allKeywords.filter(kw => {
    if (filterLevel !== 'all' && kw.level !== filterLevel) return false;
    if (filterStatus !== 'all' && kw.status !== filterStatus) return false;
    if (categoryFilter !== 'all') {
      const { category } = getSeoProjectCategory(kw.websiteName || '');
      if (category !== categoryFilter) return false;
    }
    if (searchQuery && !kw.keyword?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const achievedCount = allKeywords.filter(kw => kw.status === 'achieved').length;

  if (selectedKeyword) {
    return (
      <SeoKeywordDetail
        keyword={selectedKeyword}
        onBack={() => setSelectedKeyword(null)}
        onDelete={async (id) => {
          const err = await deleteKeyword(id);
          if (err) toast.error(err.message || '刪除失敗');
          else toast.success('已刪除關鍵字');
        }}
        fetchRankingHistory={fetchRankingHistory}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">關鍵字總數</span>
          <p className="text-[18px] font-bold">{loading ? '—' : allKeywords.length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">S1 核心</span>
          <p className="text-[18px] font-bold text-red-600">{allKeywords.filter(k => k.level === 'level_1').length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">已達標</span>
          <p className="text-[18px] font-bold text-teal-600">{achievedCount}</p>
        </div>
        {lastSyncRun && (
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">上次 GSC 同步</span>
            <p className="text-[13px] font-medium">
              {lastSyncRun.status === 'success' ? '成功' : lastSyncRun.status === 'error' ? '失敗' : '執行中'}
              {lastSyncRun.finished_at
                ? ` · ${new Date(lastSyncRun.finished_at).toLocaleString('zh-HK')}`
                : ''}
            </p>
          </div>
        )}
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
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜尋關鍵字..." className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white" />
        </div>
        <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className="px-2.5 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600">
          <option value="all">全部層級</option>
          {Object.entries(levelConfig).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-2.5 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600">
          <option value="all">全部狀態</option>
          {Object.entries(statusConfig).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>
        <button
          disabled={syncing}
          onClick={async () => {
            const r = await syncGsc();
            if (r.ok) {
              toast.success(
                `GSC 同步完成：${r.sitesSynced ?? 0} 站、${r.keywordsUpserted ?? 0} 關鍵字`,
              );
            } else {
              toast.error(r.error || 'GSC 同步失敗');
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-[12px] font-medium hover:bg-muted transition-colors duration-200 disabled:opacity-50"
        >
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          同步 GSC
        </button>
        <button onClick={() => setShowAddModal(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
          <Plus size={12} /> 新增關鍵字
        </button>
      </div>

      {error && (
        <div className="text-[13px] text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* Empty state when no keywords at all */}
      {!loading && allKeywords.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-md bg-white">
          <TrendingUp size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-foreground mb-1">尚未有 SEO 關鍵字</p>
          <p className="text-[13px] text-muted-foreground max-w-md mx-auto mb-4">
            請先連接 Google Search Console，再按「同步 GSC」匯入查詢與排名資料。設定說明見{' '}
            <span className="text-teal-600 font-medium">docs/gsc-setup.md</span>。
          </p>
          <button
            disabled={syncing}
            onClick={async () => {
              const r = await syncGsc();
              if (r.ok) toast.success('GSC 同步完成');
              else toast.error(r.error || 'GSC 同步失敗');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 disabled:opacity-50"
          >
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            同步 GSC
          </button>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">關鍵字</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">層級</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">網站</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">搜尋量</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">GSC 平均排名</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">目標</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredKeywords.map((kw) => {
                  const lConfig = levelConfig[kw.level] || levelConfig.level_3;
                  const sConfig = statusConfig[kw.status] || statusConfig.monitoring;
                  return (
                    <tr key={kw.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                      <td className="px-4 py-3 font-medium">{kw.keyword}</td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', lConfig.bg, lConfig.color)}>{lConfig.label}</span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-teal-600">{kw.websiteName}</td>
                      <td className="px-4 py-3">{kw.searchVolume?.toLocaleString() || '—'}</td>
                      <td className="px-4 py-3 font-medium">#{kw.currentRanking ?? '—'}</td>
                      <td className="px-4 py-3 text-teal-600">#{kw.targetRanking ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sConfig.bg, sConfig.color)}>{sConfig.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setSelectedKeyword(kw)} className="text-[11px] text-teal-600 hover:underline flex items-center gap-1">
                            <Eye size={10} /> 詳情
                          </button>
                          <button
                            onClick={() => { setDeleteTarget(kw); setShowDeleteModal(true); }}
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

          {filteredKeywords.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-[13px]">沒有符合條件的關鍵字</div>
          )}
        </>
      )}

      {/* Add Modal */}
      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增 SEO 關鍵字" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬網站 *</label>
            <Select value={newKeyword.websiteProfileId} onValueChange={(val) => setNewKeyword({ ...newKeyword, websiteProfileId: val })}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="選擇網站" /></SelectTrigger>
              <SelectContent>{websites.map(w => <SelectItem key={w.id} value={w.id}>{w.websiteName} ({w.company}/{w.brand})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">關鍵字 *</label>
            <Input value={newKeyword.keyword} onChange={(e) => setNewKeyword({ ...newKeyword, keyword: e.target.value })} className="h-9 text-[13px]" placeholder="輸入關鍵字" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">層級</label>
              <Select value={newKeyword.level} onValueChange={(val: SeoKeywordRow['level']) => setNewKeyword({ ...newKeyword, level: val })}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(levelConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">狀態</label>
              <Select value={newKeyword.status} onValueChange={(val: SeoKeywordRow['status']) => setNewKeyword({ ...newKeyword, status: val })}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">搜尋量</label>
              <Input type="number" value={newKeyword.searchVolume} onChange={(e) => setNewKeyword({ ...newKeyword, searchVolume: parseInt(e.target.value) || 0 })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">GSC 平均排名</label>
              <Input type="number" value={newKeyword.currentRanking} onChange={(e) => setNewKeyword({ ...newKeyword, currentRanking: parseInt(e.target.value) || 0 })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">目標排名</label>
              <Input type="number" value={newKeyword.targetRanking} onChange={(e) => setNewKeyword({ ...newKeyword, targetRanking: parseInt(e.target.value) || 0 })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">難度分數</label>
              <Input type="number" value={newKeyword.difficultyScore} onChange={(e) => setNewKeyword({ ...newKeyword, difficultyScore: parseInt(e.target.value) || 0 })} className="h-9 text-[13px]" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={async () => {
              if (newKeyword.websiteProfileId && newKeyword.keyword) {
                const { error: err } = await addKeyword({
                  website_profile_id: newKeyword.websiteProfileId,
                  keyword: newKeyword.keyword,
                  level: newKeyword.level,
                  status: newKeyword.status,
                  search_volume: newKeyword.searchVolume || null,
                  current_ranking: newKeyword.currentRanking || null,
                  target_ranking: newKeyword.targetRanking || null,
                  difficulty_score: newKeyword.difficultyScore || null,
                });
                if (err) {
                  toast.error(err.message || '新增失敗');
                  return;
                }
                toast.success('已新增關鍵字');
                setNewKeyword({ websiteProfileId: '', keyword: '', level: 'level_1', status: 'monitoring', searchVolume: 0, currentRanking: 0, targetRanking: 0, difficultyScore: 0 });
                setShowAddModal(false);
              }
            }}>新增</Button>
          </div>
        </div>
      </CrudModal>

      {/* Delete Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={async () => {
          if (deleteTarget) {
            const err = await deleteKeyword(deleteTarget.id);
            if (err) toast.error(err.message || '刪除失敗');
            else toast.success('已刪除關鍵字');
          }
          setShowDeleteModal(false);
          setDeleteTarget(null);
        }}
        itemName={deleteTarget?.keyword || '關鍵字'}
        canDelete={true}
        reasons={[]}
      />
    </div>
  );
}
