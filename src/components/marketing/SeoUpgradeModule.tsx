import { useMemo, useState } from 'react';
import { Plus, Search, ArrowLeft, Eye, TrendingUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { websiteProfiles } from '@/data/websiteData';
import { projects as allProjectsData } from '@/data/mockData';
import { getProjectCategory } from '@/components/ui/project-category-badge';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSeoUpgrades } from '@/hooks/useSeoUpgrades';
import type { SeoUpgradeRow } from '@/types/seo';

function getSeoUpgradeProjectCategory(websiteName: string) {
  const ws = websiteProfiles.find(w => w.websiteName === websiteName);
  return getProjectCategory(ws?.projectId, allProjectsData);
}

const upgradeTypeLabels: Record<string, string> = {
  backlink: 'Backlink 建設',
  technical: '技術 SEO',
  content: '內容行銷',
  keyword_research: '關鍵字研究',
  google_business: 'Google Business',
  comprehensive: '綜合 SEO',
  tool_subscription: '工具訂閱',
  other: '其他',
};

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: '進行中', color: 'text-amber-700', bg: 'bg-amber-100' },
  completed: { label: '已完成', color: 'text-teal-700', bg: 'bg-teal-100' },
  cancelled: { label: '已取消', color: 'text-red-700', bg: 'bg-red-100' },
};

function SeoUpgradeDetail({ record, onBack }: { record: SeoUpgradeRow; onBack: () => void }) {
  const sConfig = statusConfig[record.status] || statusConfig.active;
  const rankBefore = record.rankBefore ?? null;
  const rankAfter = record.rankAfter ?? null;

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200">
        <ArrowLeft size={14} /> 返回 SEO 升級列表
      </button>

      {/* Context Bar */}
      <div className="bg-slate-50 rounded-md border border-slate-200 p-3 flex items-center gap-4 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground">所屬公司:</span> {record.company}
        <span className="mx-1">•</span>
        <span className="font-medium text-foreground">品牌:</span> {record.brand}
        <span className="mx-1">•</span>
        <span className="font-medium text-foreground">網站:</span> {record.websiteName}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold">{upgradeTypeLabels[record.upgrade_type] || record.upgrade_type}</h3>
              <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sConfig.bg, sConfig.color)}>{sConfig.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-[13px]">
              <div><span className="text-muted-foreground">供應商:</span> <span className="font-medium">{record.supplier || '—'}</span></div>
              <div><span className="text-muted-foreground">費用:</span> <span className="font-medium">{record.currency} ${record.cost?.toLocaleString()}</span></div>
              <div><span className="text-muted-foreground">開始日期:</span> <span className="font-medium">{record.start_date || '—'}</span></div>
              <div><span className="text-muted-foreground">結束日期:</span> <span className="font-medium">{record.end_date || '進行中'}</span></div>
              <div><span className="text-muted-foreground">負責人:</span> <span className="font-medium">{record.staff_name || '—'}</span></div>
              <div><span className="text-muted-foreground">工時花費:</span> <span className="font-medium">{record.hours_spent}h</span></div>
            </div>
          </div>

          {/* Ranking Comparison */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <h3 className="text-[16px] font-bold mb-4">排名對比</h3>
            <div className="flex items-center gap-8">
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground mb-1">升級前</p>
                <div className="w-16 h-16 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center">
                  <span className="text-[18px] font-bold text-red-600">#{rankBefore ?? '—'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp size={20} className="text-teal-600" />
                <span className="text-[14px] font-bold text-teal-600">
                  {rankBefore != null && rankAfter != null
                    ? `↑ ${rankBefore - rankAfter} 位`
                    : '進行中...'}
                </span>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground mb-1">升級後</p>
                <div className="w-16 h-16 rounded-full bg-teal-50 border-2 border-teal-200 flex items-center justify-center">
                  <span className="text-[18px] font-bold text-teal-600">#{rankAfter ?? '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <h3 className="text-[14px] font-bold mb-3">費用明細</h3>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">服務費</span>
                <span className="font-medium">{record.currency} ${record.cost?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">人力工時</span>
                <span className="font-medium">{record.hours_spent}h × $150 = ${(record.hours_spent * 150).toLocaleString()}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between font-bold">
                <span>總計</span>
                <span>{record.currency} ${(record.cost + record.hours_spent * 150).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SeoUpgradeModule() {
  const { upgrades, loading, error, addUpgrade } = useSeoUpgrades();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'internal' | 'client'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<SeoUpgradeRow | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRecord, setNewRecord] = useState({
    websiteProfileId: '',
    upgradeType: 'backlink',
    supplier: '',
    cost: 0,
    currency: 'HKD',
    startDate: '',
    endDate: '',
    staff: '',
    status: 'active' as SeoUpgradeRow['status'],
    hoursSpent: 0,
  });

  const filteredRecords = useMemo(() => upgrades.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (categoryFilter !== 'all') {
      const { category } = getSeoUpgradeProjectCategory(r.websiteName || '');
      if (category !== categoryFilter) return false;
    }
    if (
      searchQuery &&
      !(r.websiteName || '').toLowerCase().includes(searchQuery.toLowerCase()) &&
      !(r.supplier || '').toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  }), [upgrades, filterStatus, categoryFilter, searchQuery]);

  const totalCost = upgrades.reduce((s, r) => s + (r.cost || 0), 0);

  if (selectedRecord) {
    return <SeoUpgradeDetail record={selectedRecord} onBack={() => setSelectedRecord(null)} />;
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">升級記錄</span>
          <p className="text-[18px] font-bold">{loading ? '—' : upgrades.length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">總投入</span>
          <p className="text-[18px] font-bold">HKD ${totalCost.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">進行中</span>
          <p className="text-[18px] font-bold text-amber-600">{upgrades.filter(r => r.status === 'active').length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜尋..." className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-2.5 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600">
          <option value="all">全部狀態</option>
          {Object.entries(statusConfig).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>
        <button onClick={() => setShowAddModal(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
          <Plus size={12} /> 新增記錄
        </button>
      </div>

      {error && (
        <div className="text-[13px] text-rose-600 bg-rose-50 border border-rose-100 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-[13px] flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin" /> 載入中…
        </div>
      ) : upgrades.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-md bg-white">
          <TrendingUp size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-medium text-foreground mb-1">尚未有 SEO 升級記錄</p>
          <p className="text-[13px] text-muted-foreground mb-4">新增升級服務後，可對照 GSC 排名變化追蹤成效。</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700"
          >
            <Plus size={12} /> 新增記錄
          </button>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">網站</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">服務類型</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">供應商</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">費用</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">負責人</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">排名變化</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => {
                  const sConfig = statusConfig[record.status] || statusConfig.active;
                  return (
                    <tr key={record.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                      <td className="px-4 py-3 font-medium">{record.websiteName}</td>
                      <td className="px-4 py-3">{upgradeTypeLabels[record.upgrade_type] || record.upgrade_type}</td>
                      <td className="px-4 py-3 text-muted-foreground">{record.supplier || '—'}</td>
                      <td className="px-4 py-3">{record.currency} ${record.cost?.toLocaleString()}</td>
                      <td className="px-4 py-3">{record.staff_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-muted-foreground">#{record.rankBefore ?? '—'}</span>
                        <span className="mx-1">→</span>
                        <span className="text-teal-600 font-medium">
                          {record.rankAfter != null ? `#${record.rankAfter}` : '進行中'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sConfig.bg, sConfig.color)}>{sConfig.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedRecord(record)} className="text-[11px] text-teal-600 hover:underline flex items-center gap-1">
                          <Eye size={10} /> 詳情
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredRecords.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-[13px]">沒有符合條件的升級記錄</div>
          )}
        </>
      )}

      {/* Add Modal */}
      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增 SEO 升級記錄" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">網站 *</label>
            <Select value={newRecord.websiteProfileId} onValueChange={(val) => {
              setNewRecord({ ...newRecord, websiteProfileId: val });
            }}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="選擇網站" /></SelectTrigger>
              <SelectContent>{websiteProfiles.map(w => <SelectItem key={w.id} value={w.id}>{w.websiteName} ({w.company}/{w.brand})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">服務類型</label>
              <Select value={newRecord.upgradeType} onValueChange={(val) => setNewRecord({ ...newRecord, upgradeType: val })}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(upgradeTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">供應商</label>
              <Input value={newRecord.supplier} onChange={(e) => setNewRecord({ ...newRecord, supplier: e.target.value })} className="h-9 text-[13px]" placeholder="供應商名稱" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">費用 (HKD)</label>
              <Input type="number" value={newRecord.cost} onChange={(e) => setNewRecord({ ...newRecord, cost: parseInt(e.target.value) || 0 })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">負責人</label>
              <Input value={newRecord.staff} onChange={(e) => setNewRecord({ ...newRecord, staff: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">工時</label>
              <Input type="number" step={0.5} value={newRecord.hoursSpent} onChange={(e) => setNewRecord({ ...newRecord, hoursSpent: parseFloat(e.target.value) || 0 })} className="h-9 text-[13px]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">開始日期</label>
              <Input type="date" value={newRecord.startDate} onChange={(e) => setNewRecord({ ...newRecord, startDate: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">結束日期</label>
              <Input type="date" value={newRecord.endDate} onChange={(e) => setNewRecord({ ...newRecord, endDate: e.target.value })} className="h-9 text-[13px]" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={async () => {
              if (!newRecord.websiteProfileId) {
                toast.error('請選擇網站');
                return;
              }
              const { error: err } = await addUpgrade({
                website_profile_id: newRecord.websiteProfileId,
                upgrade_type: newRecord.upgradeType,
                supplier: newRecord.supplier || null,
                cost: newRecord.cost,
                currency: newRecord.currency,
                start_date: newRecord.startDate || null,
                end_date: newRecord.endDate || null,
                staff_name: newRecord.staff || null,
                hours_spent: newRecord.hoursSpent,
                status: newRecord.status,
              });
              if (err) {
                toast.error(err.message || '新增失敗');
                return;
              }
              toast.success('已新增升級記錄');
              setNewRecord({
                websiteProfileId: '',
                upgradeType: 'backlink',
                supplier: '',
                cost: 0,
                currency: 'HKD',
                startDate: '',
                endDate: '',
                staff: '',
                status: 'active',
                hoursSpent: 0,
              });
              setShowAddModal(false);
            }}>新增</Button>
          </div>
        </div>
      </CrudModal>
    </div>
  );
}
