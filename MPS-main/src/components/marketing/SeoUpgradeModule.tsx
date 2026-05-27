import { useState } from 'react';
import { Plus, Search, ArrowLeft, Eye, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { websiteProfiles } from '@/data/websiteData';
import { projects as allProjectsData } from '@/data/mockData';
import { getProjectCategory } from '@/components/ui/project-category-badge';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

const mockUpgrades = [
  { id: '1', websiteName: 'BW Wine', company: '志豐企業', brand: 'BW Wine', upgradeType: 'backlink', supplier: 'SEO Pro HK', cost: 8000, currency: 'HKD', startDate: '2024-10-01', endDate: '2024-12-31', staff: '陳志強', rankBefore: { main: 12 }, rankAfter: { main: 5 }, status: 'completed', hoursSpent: 20 },
  { id: '2', websiteName: 'ACI Events', company: '志豐企業', brand: 'ACI', upgradeType: 'technical', supplier: 'Tech Boost', cost: 15000, currency: 'HKD', startDate: '2024-09-15', endDate: '2024-11-30', staff: '王小明', rankBefore: { main: 18 }, rankAfter: { main: 9 }, status: 'completed', hoursSpent: 35 },
  { id: '3', websiteName: 'BW Wine', company: '志豐企業', brand: 'BW Wine', upgradeType: 'content', supplier: '—', cost: 5000, currency: 'HKD', startDate: '2024-11-01', endDate: null, staff: '李美玲', rankBefore: { main: 8 }, rankAfter: null, status: 'active', hoursSpent: 12 },
  { id: '4', websiteName: 'BWDesign', company: '志豐企業', brand: 'BWDesign', upgradeType: 'google_business', supplier: 'Local SEO Ltd', cost: 6000, currency: 'HKD', startDate: '2024-08-01', endDate: '2024-10-31', staff: '陳志強', rankBefore: { main: 15 }, rankAfter: { main: 7 }, status: 'completed', hoursSpent: 15 },
  { id: '5', websiteName: 'FCC Corp', company: 'FCC', brand: 'FCC', upgradeType: 'comprehensive', supplier: 'SEO Master', cost: 25000, currency: 'HKD', startDate: '2024-11-15', endDate: null, staff: '王小明', rankBefore: { main: 25 }, rankAfter: null, status: 'active', hoursSpent: 8 },
];

function SeoUpgradeDetail({ record, onBack }: { record: any; onBack: () => void }) {
  const sConfig = statusConfig[record.status] || statusConfig.active;

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
              <h3 className="text-[16px] font-bold">{upgradeTypeLabels[record.upgradeType] || record.upgradeType}</h3>
              <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sConfig.bg, sConfig.color)}>{sConfig.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-[13px]">
              <div><span className="text-muted-foreground">供應商:</span> <span className="font-medium">{record.supplier}</span></div>
              <div><span className="text-muted-foreground">費用:</span> <span className="font-medium">{record.currency} ${record.cost?.toLocaleString()}</span></div>
              <div><span className="text-muted-foreground">開始日期:</span> <span className="font-medium">{record.startDate}</span></div>
              <div><span className="text-muted-foreground">結束日期:</span> <span className="font-medium">{record.endDate || '進行中'}</span></div>
              <div><span className="text-muted-foreground">負責人:</span> <span className="font-medium">{record.staff}</span></div>
              <div><span className="text-muted-foreground">工時花費:</span> <span className="font-medium">{record.hoursSpent}h</span></div>
            </div>
          </div>

          {/* Ranking Comparison */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
            <h3 className="text-[16px] font-bold mb-4">排名對比</h3>
            <div className="flex items-center gap-8">
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground mb-1">升級前</p>
                <div className="w-16 h-16 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center">
                  <span className="text-[18px] font-bold text-red-600">#{record.rankBefore?.main || '—'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp size={20} className="text-teal-600" />
                <span className="text-[14px] font-bold text-teal-600">
                  {record.rankAfter ? `↑ ${record.rankBefore.main - record.rankAfter.main} 位` : '進行中...'}
                </span>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground mb-1">升級後</p>
                <div className="w-16 h-16 rounded-full bg-teal-50 border-2 border-teal-200 flex items-center justify-center">
                  <span className="text-[18px] font-bold text-teal-600">#{record.rankAfter?.main || '—'}</span>
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
                <span className="font-medium">{record.hoursSpent}h × $150 = ${(record.hoursSpent * 150).toLocaleString()}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between font-bold">
                <span>總計</span>
                <span>{record.currency} ${(record.cost + record.hoursSpent * 150).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SeoUpgradeModule() {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'internal' | 'client'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [upgrades, setUpgrades] = useState(mockUpgrades);
  const [newRecord, setNewRecord] = useState({
    websiteName: '',
    company: '',
    brand: '',
    upgradeType: 'backlink',
    supplier: '',
    cost: 0,
    currency: 'HKD',
    startDate: '',
    endDate: '',
    staff: '',
    rankBefore: 0,
    status: 'active',
    hoursSpent: 0,
  });

  const filteredRecords = upgrades.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (categoryFilter !== 'all') {
      const { category } = getSeoUpgradeProjectCategory(r.websiteName || '');
      if (category !== categoryFilter) return false;
    }
    if (searchQuery && !r.websiteName.toLowerCase().includes(searchQuery.toLowerCase()) && !r.supplier.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

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
          <p className="text-[18px] font-bold">{upgrades.length}</p>
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
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜尋..." className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" />
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
                  <td className="px-4 py-3">{upgradeTypeLabels[record.upgradeType]}</td>
                  <td className="px-4 py-3 text-muted-foreground">{record.supplier}</td>
                  <td className="px-4 py-3">{record.currency} ${record.cost?.toLocaleString()}</td>
                  <td className="px-4 py-3">{record.staff}</td>
                  <td className="px-4 py-3">
                    <span className="text-muted-foreground">#{record.rankBefore.main}</span>
                    <span className="mx-1">→</span>
                    <span className="text-teal-600 font-medium">{record.rankAfter ? `#${record.rankAfter.main}` : '進行中'}</span>
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

      {/* Add Modal */}
      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增 SEO 升級記錄" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">網站 *</label>
            <Select value={newRecord.websiteName} onValueChange={(val) => {
              const ws = websiteProfiles.find(w => w.websiteName === val);
              setNewRecord({ ...newRecord, websiteName: val, company: ws?.company || '', brand: ws?.brand || '' });
            }}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="選擇網站" /></SelectTrigger>
              <SelectContent>{websiteProfiles.map(w => <SelectItem key={w.id} value={w.websiteName}>{w.websiteName} ({w.company}/{w.brand})</SelectItem>)}</SelectContent>
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
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">開始日期</label>
              <Input type="date" value={newRecord.startDate} onChange={(e) => setNewRecord({ ...newRecord, startDate: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">結束日期</label>
              <Input type="date" value={newRecord.endDate} onChange={(e) => setNewRecord({ ...newRecord, endDate: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">升級前排名</label>
              <Input type="number" value={newRecord.rankBefore} onChange={(e) => setNewRecord({ ...newRecord, rankBefore: parseInt(e.target.value) || 0 })} className="h-9 text-[13px]" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => {
              if (newRecord.websiteName && newRecord.supplier) {
                const newId = `seo_upgrade_${Date.now()}`;
                setUpgrades(prev => [...prev, {
                  id: newId,
                  websiteName: newRecord.websiteName,
                  company: newRecord.company,
                  brand: newRecord.brand,
                  upgradeType: newRecord.upgradeType,
                  supplier: newRecord.supplier,
                  cost: newRecord.cost,
                  currency: newRecord.currency,
                  startDate: newRecord.startDate,
                  endDate: newRecord.endDate || null,
                  staff: newRecord.staff,
                  rankBefore: { main: newRecord.rankBefore },
                  rankAfter: null,
                  status: 'active',
                  hoursSpent: newRecord.hoursSpent,
                }]);
                setNewRecord({ websiteName: '', company: '', brand: '', upgradeType: 'backlink', supplier: '', cost: 0, currency: 'HKD', startDate: '', endDate: '', staff: '', rankBefore: 0, status: 'active', hoursSpent: 0 });
                setShowAddModal(false);
              }
            }}>新增</Button>
          </div>
        </div>
      </CrudModal>
    </div>
  );
}
