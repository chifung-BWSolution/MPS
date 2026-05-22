import { useState } from 'react';
import { Plus, Search, X, ArrowLeft, Eye, Link2, Mail, MessageSquare, Edit, Trash2, Globe, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { websiteProfiles } from '@/data/websiteData';
import { projects as allProjectsData } from '@/data/mockData';
import { getProjectCategory } from '@/components/ui/project-category-badge';
import { Button } from '@/components/ui/button';
import { useDataStore } from '@/context/DataStore';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function getEdmProjectCategory(websiteName: string) {
  const ws = websiteProfiles.find(w => w.websiteName === websiteName);
  return getProjectCategory(ws?.projectId, allProjectsData);
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: '草稿', color: 'text-slate-700', bg: 'bg-slate-100' },
  scheduled: { label: '已排程', color: 'text-amber-700', bg: 'bg-amber-100' },
  sent: { label: '已發送', color: 'text-teal-700', bg: 'bg-teal-100' },
  cancelled: { label: '已取消', color: 'text-red-700', bg: 'bg-red-100' },
};

function EdmDetail({ campaign, onBack }: { campaign: any; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'info' | 'websites' | 'history'>('info');
  const [linkedWebsites, setLinkedWebsites] = useState<string[]>(
    campaign.websiteName ? [campaign.websiteName] : []
  );
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const sConfig = statusConfig[campaign.status] || statusConfig.draft;

  const tabs = [
    { id: 'info', label: '基本資訊' },
    { id: 'websites', label: '關聯網站 + 項目' },
    { id: 'history', label: '發送記錄' },
  ] as const;

  // Mock send history
  const sendHistory = [
    { id: '1', date: campaign.sendDate || '2024-12-01', recipients: campaign.recipientCount || 0, openRate: campaign.openRate, clickRate: campaign.clickRate, status: 'sent' },
    { id: '2', date: '2024-11-15', recipients: Math.round((campaign.recipientCount || 500) * 0.8), openRate: 22.1, clickRate: 4.5, status: 'sent' },
    { id: '3', date: '2024-11-01', recipients: Math.round((campaign.recipientCount || 500) * 0.6), openRate: 19.8, clickRate: 3.2, status: 'sent' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200">
          <ArrowLeft size={14} /> 返回 EDM 列表
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
        <span className="font-medium text-foreground">所屬公司:</span> {campaign.company}
        <span className="mx-1">•</span>
        <span className="font-medium text-foreground">品牌:</span> {campaign.brand}
        <span className="mx-1">•</span>
        <span className="font-medium text-foreground">類型:</span>
        <span className={cn('flex items-center gap-1', campaign.campaignType === 'email' ? 'text-blue-600' : 'text-purple-600')}>
          {campaign.campaignType === 'email' ? <><Mail size={12} /> 電郵</> : <><MessageSquare size={12} /> 短訊</>}
        </span>
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

      {/* Tab 1: Basic Info */}
      {activeTab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
              <h3 className="text-[16px] font-bold mb-4">{campaign.subject}</h3>
              <div className="grid grid-cols-2 gap-4 text-[13px]">
                <div><span className="text-muted-foreground">收件人數:</span> <span className="font-medium">{campaign.recipientCount?.toLocaleString() || '—'}</span></div>
                <div><span className="text-muted-foreground">發送日期:</span> <span className="font-medium">{campaign.sendDate || '—'}</span></div>
                <div><span className="text-muted-foreground">工時花費:</span> <span className="font-medium">{campaign.hoursSpent ? `${campaign.hoursSpent}h` : '—'}</span></div>
                <div><span className="text-muted-foreground">範本:</span> <span className="font-medium">{campaign.templateName || '—'}</span></div>
              </div>
            </div>
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
              <h3 className="text-[16px] font-bold mb-4">成效指標</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-3 bg-muted/20 rounded-md">
                  <p className="text-[22px] font-bold text-teal-600">{campaign.openRate ? `${campaign.openRate}%` : '—'}</p>
                  <span className="text-[11px] text-muted-foreground">開啟率</span>
                </div>
                <div className="text-center p-3 bg-muted/20 rounded-md">
                  <p className="text-[22px] font-bold text-blue-600">{campaign.clickRate ? `${campaign.clickRate}%` : '—'}</p>
                  <span className="text-[11px] text-muted-foreground">點擊率</span>
                </div>
                <div className="text-center p-3 bg-muted/20 rounded-md">
                  <p className="text-[22px] font-bold text-amber-600">{campaign.bounceRate ? `${campaign.bounceRate}%` : '—'}</p>
                  <span className="text-[11px] text-muted-foreground">退回率</span>
                </div>
                <div className="text-center p-3 bg-muted/20 rounded-md">
                  <p className="text-[22px] font-bold text-red-600">{campaign.unsubscribeCount || 0}</p>
                  <span className="text-[11px] text-muted-foreground">取消訂閱</span>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {campaign.notes && (
              <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
                <h3 className="text-[14px] font-bold mb-2">備註</h3>
                <p className="text-[13px] text-muted-foreground">{campaign.notes}</p>
              </div>
            )}
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
              <h3 className="text-[14px] font-bold mb-3">所屬網站</h3>
              <p className="text-[13px] text-teal-600">{campaign.websiteName || '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Linked Websites + Projects */}
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

      {/* Tab 3: Send History */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <h3 className="text-[16px] font-bold mb-4">發送記錄歷史</h3>
          <div className="space-y-3">
            {sendHistory.map(record => (
              <div key={record.id} className="flex items-center justify-between p-4 border border-border rounded-md hover:bg-muted/10 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center">
                    <Send size={14} className="text-teal-600" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium">{record.date}</p>
                    <p className="text-[11px] text-muted-foreground">{record.recipients.toLocaleString()} 名收件人</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-[12px]">
                  <div className="text-center">
                    <p className="font-bold text-teal-600">{record.openRate || 0}%</p>
                    <span className="text-[10px] text-muted-foreground">開啟率</span>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-blue-600">{record.clickRate || 0}%</p>
                    <span className="text-[10px] text-muted-foreground">點擊率</span>
                  </div>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-teal-100 text-teal-700">已發送</span>
                </div>
              </div>
            ))}
          </div>
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
            <p className="text-[13px] text-muted-foreground mb-4">確認要刪除此 EDM 活動嗎？此操作無法撤銷。</p>
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

export function EdmManagementModule() {
  const { allEdmCampaignsList, websites, addEdmCampaign, deleteEdmCampaign } = useDataStore();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'internal' | 'client'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [newCampaign, setNewCampaign] = useState({
    websiteProfileId: '',
    campaignType: 'email' as 'email' | 'sms',
    subject: '',
    status: 'draft' as any,
    recipientCount: 0,
    sendDate: '',
    reportDate: '',
    hoursSpent: 0,
    asanaLink: '',
    outputLink: '',
  });

  const allCampaigns = allEdmCampaignsList;

  const filteredCampaigns = allCampaigns.filter(c => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (categoryFilter !== 'all') {
      const { category } = getEdmProjectCategory(c.websiteName || '');
      if (category !== categoryFilter) return false;
    }
    if (searchQuery && !c.subject?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  if (selectedCampaign) {
    return <EdmDetail campaign={selectedCampaign} onBack={() => setSelectedCampaign(null)} />;
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">EDM 總數</span>
          <p className="text-[18px] font-bold">{allCampaigns.length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">已發送</span>
          <p className="text-[18px] font-bold text-teal-600">{allCampaigns.filter(c => c.status === 'sent').length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
          <span className="text-[11px] text-muted-foreground">平均開啟率</span>
          <p className="text-[18px] font-bold text-blue-600">
            {allCampaigns.length > 0
              ? `${Math.round(allCampaigns.reduce((s, c) => s + (c.openRate || 0), 0) / allCampaigns.length)}%`
              : '—'}
          </p>
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
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜尋 EDM..." className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-2.5 py-1.5 border border-border rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600">
          <option value="all">全部狀態</option>
          {Object.entries(statusConfig).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>
        <button onClick={() => setShowAddModal(true)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
          <Plus size={12} /> 新增 EDM
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">類型</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">主題</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">網站</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">收件人數</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">發送日期</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">開啟率</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredCampaigns.map((campaign) => {
              const sConfig = statusConfig[campaign.status] || statusConfig.draft;
              return (
                <tr key={campaign.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', campaign.campaignType === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                      {campaign.campaignType === 'email' ? '電郵' : '短訊'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{campaign.subject}</td>
                  <td className="px-4 py-3 text-[12px] text-teal-600">{campaign.websiteName}</td>
                  <td className="px-4 py-3">{campaign.recipientCount?.toLocaleString() || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{campaign.sendDate || '—'}</td>
                  <td className="px-4 py-3">{campaign.openRate ? `${campaign.openRate}%` : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sConfig.bg, sConfig.color)}>{sConfig.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setSelectedCampaign(campaign)} className="text-[11px] text-teal-600 hover:underline flex items-center gap-1">
                        <Eye size={10} /> 詳情
                      </button>
                      <button
                        onClick={() => { setDeleteTarget(campaign); setShowDeleteModal(true); }}
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

      {filteredCampaigns.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-[13px]">沒有符合條件的 EDM 活動</div>
      )}

      {/* Add Modal */}
      <CrudModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新增 EDM 活動" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬網站 *</label>
            <Select value={newCampaign.websiteProfileId} onValueChange={(val) => setNewCampaign({ ...newCampaign, websiteProfileId: val })}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="選擇網站" /></SelectTrigger>
              <SelectContent>{websites.map(w => <SelectItem key={w.id} value={w.id}>{w.websiteName} ({w.company}/{w.brand})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">類型</label>
              <Select value={newCampaign.campaignType} onValueChange={(val: any) => setNewCampaign({ ...newCampaign, campaignType: val })}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">電郵</SelectItem>
                  <SelectItem value="sms">短訊</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">狀態</label>
              <Select value={newCampaign.status} onValueChange={(val: any) => setNewCampaign({ ...newCampaign, status: val })}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">主題 *</label>
            <Input value={newCampaign.subject} onChange={(e) => setNewCampaign({ ...newCampaign, subject: e.target.value })} className="h-9 text-[13px]" placeholder="輸入 EDM 主題" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">收件人數</label>
              <Input type="number" value={newCampaign.recipientCount} onChange={(e) => setNewCampaign({ ...newCampaign, recipientCount: parseInt(e.target.value) || 0 })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">發送日期</label>
              <Input type="date" value={newCampaign.sendDate} onChange={(e) => setNewCampaign({ ...newCampaign, sendDate: e.target.value })} className="h-9 text-[13px]" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">日報日期</label>
              <Input type="date" value={newCampaign.reportDate} onChange={(e) => setNewCampaign({ ...newCampaign, reportDate: e.target.value })} className="h-9 text-[13px]" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">工時 (h)</label>
              <Input type="number" step={0.5} value={newCampaign.hoursSpent} onChange={(e) => setNewCampaign({ ...newCampaign, hoursSpent: parseFloat(e.target.value) || 0 })} className="h-9 text-[13px]" />
            </div>
            <div className="col-span-2">
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Asana 連結</label>
              <Input value={newCampaign.asanaLink} onChange={(e) => setNewCampaign({ ...newCampaign, asanaLink: e.target.value })} className="h-9 text-[13px]" placeholder="https://app.asana.com/..." />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">成果連結 (Output Link)</label>
            <Input value={newCampaign.outputLink} onChange={(e) => setNewCampaign({ ...newCampaign, outputLink: e.target.value })} className="h-9 text-[13px]" placeholder="https://..." />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => {
              if (newCampaign.websiteProfileId && newCampaign.subject) {
                addEdmCampaign(newCampaign.websiteProfileId, { ...newCampaign, id: '' } as any);
                setNewCampaign({ websiteProfileId: '', campaignType: 'email', subject: '', status: 'draft', recipientCount: 0, sendDate: '', reportDate: '', hoursSpent: 0, asanaLink: '', outputLink: '' });
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
        onConfirm={() => {
          if (deleteTarget) {
            deleteEdmCampaign(deleteTarget.websiteProfileId, deleteTarget.id);
          }
          setShowDeleteModal(false);
          setDeleteTarget(null);
        }}
        itemName={deleteTarget?.subject || 'EDM 活動'}
        canDelete={true}
        reasons={[]}
      />
    </div>
  );
}
