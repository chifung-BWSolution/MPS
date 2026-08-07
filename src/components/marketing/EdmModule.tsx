import { useState, useMemo, Fragment } from 'react';
import { Plus, Search, Mail, MessageSquare, FileText, Copy, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAllEdmCampaigns } from '@/data/marketingData';

interface EdmCampaign {
  id: string;
  type: 'email' | 'sms';
  subject: string;
  recipients: number;
  recipientType: string;
  sendDate: string;
  openRate: number;
  clickRate: number;
  status: 'draft' | 'scheduled' | 'sent' | 'cancelled';
  company: string;
  brand: string;
  hours: number;
}

interface EdmTemplate {
  id: string;
  name: string;
  type: 'email' | 'sms';
  subject: string;
  usageCount: number;
  company?: string;
}

const mockCampaigns: EdmCampaign[] = [
  { id: '1', type: 'email', subject: '聖誕節優惠 - BW Wine', recipients: 2500, recipientType: '客戶名單', sendDate: '2024-12-20', openRate: 32.5, clickRate: 8.2, status: 'sent', company: 'BWDesign', brand: 'BW Wine', hours: 3 },
  { id: '2', type: 'email', subject: '年末感恩回饋', recipients: 1800, recipientType: '會員名單', sendDate: '2024-12-25', openRate: 0, clickRate: 0, status: 'scheduled', company: 'BWDesign', brand: 'BW Wine', hours: 2 },
  { id: '3', type: 'sms', subject: '限時7折優惠', recipients: 500, recipientType: 'VIP 客戶', sendDate: '2024-12-18', openRate: 85, clickRate: 15.3, status: 'sent', company: '志豐企業', brand: 'ACI', hours: 1 },
  { id: '4', type: 'email', subject: 'Q1 2025 新產品預告', recipients: 3200, recipientType: '訂閱者', sendDate: '2025-01-05', openRate: 0, clickRate: 0, status: 'draft', company: 'BWDesign', brand: 'BW Wine', hours: 4 },
  { id: '5', type: 'sms', subject: '活動提醒 - 新年酒會', recipients: 350, recipientType: 'VIP 客戶', sendDate: '2024-12-30', openRate: 0, clickRate: 0, status: 'scheduled', company: '志豐企業', brand: 'ACI', hours: 0.5 },
];

const mockTemplates: EdmTemplate[] = [
  { id: '1', name: '節慶優惠模板', type: 'email', subject: '【{品牌}】{節日}限時優惠', usageCount: 8, company: 'BWDesign' },
  { id: '2', name: '月度通訊模板', type: 'email', subject: '{月份} 月度通訊', usageCount: 12 },
  { id: '3', name: '活動邀請模板', type: 'email', subject: '誠邀出席 {活動名稱}', usageCount: 5, company: '志豐企業' },
  { id: '4', name: 'SMS 提醒模板', type: 'sms', subject: '【{品牌}】{內容}', usageCount: 15 },
  { id: '5', name: '新品上架模板', type: 'email', subject: '全新登場 | {產品名稱}', usageCount: 3 },
];

const statusConfig = {
  draft: { label: '草稿', color: 'text-slate-700', bg: 'bg-slate-100' },
  scheduled: { label: '已排程', color: 'text-amber-700', bg: 'bg-amber-100' },
  sent: { label: '已發送', color: 'text-teal-700', bg: 'bg-teal-100' },
  cancelled: { label: '已取消', color: 'text-gray-600', bg: 'bg-gray-100' },
};

export function EdmModule() {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'templates'>('campaigns');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const filtered = mockCampaigns.filter((c) => {
    if (filterType !== 'all' && c.type !== filterType) return false;
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (searchQuery && !c.subject.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const sentCount = mockCampaigns.filter(c => c.status === 'sent').length;
  const scheduledCount = mockCampaigns.filter(c => c.status === 'scheduled').length;
  const avgOpenRate = mockCampaigns.filter(c => c.openRate > 0).reduce((s, c) => s + c.openRate, 0) / mockCampaigns.filter(c => c.openRate > 0).length;
  const totalRecipients = mockCampaigns.reduce((s, c) => s + c.recipients, 0);

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Mail size={14} className="text-teal-600" />
            <span className="text-[11px] text-muted-foreground">EDM 總數</span>
          </div>
          <p className="text-[22px] font-bold">{mockCampaigns.length}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">電郵 {mockCampaigns.filter(c => c.type === 'email').length} / 短訊 {mockCampaigns.filter(c => c.type === 'sms').length}</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare size={14} className="text-blue-600" />
            <span className="text-[11px] text-muted-foreground">已發送</span>
          </div>
          <p className="text-[22px] font-bold text-teal-600">{sentCount}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">已排程 {scheduledCount} 個</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] text-muted-foreground">平均開啟率</span>
          </div>
          <p className="text-[22px] font-bold text-amber-600">{avgOpenRate.toFixed(1)}%</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">業界平均 ~25%</p>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] text-muted-foreground">覆蓋人次</span>
          </div>
          <p className="text-[22px] font-bold">{totalRecipients.toLocaleString()}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">總收件人數</p>
        </div>
      </div>

      {/* Tab Switch */}
      <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={cn('px-4 py-1.5 rounded text-[13px] font-medium transition-colors duration-200', activeTab === 'campaigns' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          EDM 記錄
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={cn('px-4 py-1.5 rounded text-[13px] font-medium transition-colors duration-200', activeTab === 'templates' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          範本管理
        </button>
      </div>

      {activeTab === 'campaigns' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-[260px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜尋主題..."
                className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
              />
            </div>
            <div className="flex items-center gap-1">
              {['all', 'email', 'sms'].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={cn('px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors duration-200', filterType === t ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
                >
                  {t === 'all' ? '全部類型' : t === 'email' ? '電郵' : '短訊'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {['all', 'draft', 'scheduled', 'sent'].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={cn('px-2.5 py-1.5 rounded text-[12px] font-medium transition-colors duration-200', filterStatus === s ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
                >
                  {s === 'all' ? '全部狀態' : statusConfig[s as keyof typeof statusConfig]?.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowNewForm(!showNewForm)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200"
            >
              <Plus size={12} />
              新增 EDM
            </button>
          </div>

          {/* New Form */}
          {showNewForm && (
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
              <h3 className="text-[14px] font-bold mb-4">新增 EDM 記錄</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">類型</label>
                  <select className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                    <option value="email">電郵</option>
                    <option value="sms">短訊</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬公司</label>
                  <select className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                    <option>BWDesign Centre</option>
                    <option>志豐企業</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">品牌</label>
                  <select className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white">
                    <option>BW Wine</option>
                    <option>ACI Events</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">主題 *</label>
                  <input className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="輸入郵件主題" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">發送日期</label>
                  <input type="date" className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">收件人類型</label>
                  <input className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="如：VIP客戶、訂閱者" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">收件人數</label>
                  <input type="number" className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="0" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-muted-foreground block mb-1">投入工時</label>
                  <input type="number" step="0.5" className="w-full px-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white" placeholder="0" />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button className="px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200">儲存</button>
                <button onClick={() => setShowNewForm(false)} className="px-4 py-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-200">取消</button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">類型</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">主題</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">公司 / 品牌</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">收件人數</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">發送日期</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">開啟率</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">點擊率</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">工時</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((edm) => {
                  const sc = statusConfig[edm.status];
                  const isExpanded = expandedRow === edm.id;
                  return (
                    <Fragment key={edm.id}>
                      <tr className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                        <td className="px-4 py-3">
                          <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded flex items-center gap-1 w-fit', edm.type === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                            {edm.type === 'email' ? <Mail size={10} /> : <MessageSquare size={10} />}
                            {edm.type === 'email' ? '電郵' : '短訊'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium">{edm.subject}</td>
                        <td className="px-4 py-3">
                          <div className="text-[12px]">{edm.company}</div>
                          <div className="text-[11px] text-muted-foreground">{edm.brand}</div>
                        </td>
                        <td className="px-4 py-3">{edm.recipients.toLocaleString()}</td>
                        <td className="px-4 py-3 text-muted-foreground">{edm.sendDate}</td>
                        <td className="px-4 py-3">
                          {edm.openRate > 0 ? (
                            <span className={cn('font-medium', edm.openRate >= 30 ? 'text-teal-600' : 'text-amber-600')}>{edm.openRate}%</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {edm.clickRate > 0 ? (
                            <span className="font-medium text-blue-600">{edm.clickRate}%</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">{edm.hours > 0 ? `${edm.hours}h` : '—'}</td>
                        <td className="px-4 py-3">
                          <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', sc.bg, sc.color)}>{sc.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setExpandedRow(isExpanded ? null : edm.id)} className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${edm.id}-expanded`} className="bg-muted/5">
                          <td colSpan={10} className="px-4 py-3">
                            <div className="flex items-center gap-6 text-[12px]">
                              <span className="text-muted-foreground">收件人類型：<span className="text-foreground font-medium">{edm.recipientType}</span></span>
                              {edm.openRate > 0 && <span className="text-muted-foreground">開啟人數：<span className="text-foreground font-medium">{Math.round(edm.recipients * edm.openRate / 100).toLocaleString()}</span></span>}
                              {edm.clickRate > 0 && <span className="text-muted-foreground">點擊人數：<span className="text-foreground font-medium">{Math.round(edm.recipients * edm.clickRate / 100).toLocaleString()}</span></span>}
                              <div className="ml-auto flex items-center gap-2">
                                <button className="px-2.5 py-1 text-[11px] border border-border rounded hover:bg-muted transition-colors duration-200">編輯</button>
                                <button className="px-2.5 py-1 text-[11px] border border-border rounded hover:bg-muted transition-colors duration-200 flex items-center gap-1">
                                  <Copy size={10} />複製
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-[13px]">
                <Mail size={32} className="mx-auto mb-3 opacity-30" />
                <p>沒有符合條件的 EDM 記錄</p>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted-foreground">管理電郵及短訊範本，快速建立新 EDM 記錄</p>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[12px] font-medium hover:bg-teal-700 transition-colors duration-200">
              <Plus size={12} />
              新增範本
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockTemplates.map((template) => (
              <div key={template.id} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 hover:shadow-card-hover transition-all duration-200">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', template.type === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                        {template.type === 'email' ? '電郵' : '短訊'}
                      </span>
                      {template.company && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{template.company}</span>
                      )}
                    </div>
                    <h4 className="text-[14px] font-bold">{template.name}</h4>
                  </div>
                  <FileText size={16} className="text-muted-foreground shrink-0" />
                </div>
                <p className="text-[12px] text-muted-foreground mb-3 font-mono bg-muted/40 px-2 py-1 rounded">{template.subject}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">已使用 {template.usageCount} 次</span>
                  <div className="flex items-center gap-1.5">
                    <button className="px-2 py-1 text-[11px] border border-border rounded hover:bg-muted transition-colors duration-200 flex items-center gap-1">
                      <Copy size={9} />使用
                    </button>
                    <button className="px-2 py-1 text-[11px] border border-border rounded hover:bg-muted transition-colors duration-200">編輯</button>
                    <button className="p-1 text-rose-400 hover:text-rose-600 transition-colors duration-200">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
