import { useState, useMemo } from 'react';
import { Search, Plus, ChevronRight, User, DollarSign, FileText, MessageSquare, ExternalLink, ArrowLeft, Sparkles, Clock, Target } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import {
  pitchingRecords,
  pitchingStatusConfig,
  PitchingRecord,
} from '@/data/pitchingData';

// ===== PITCHING LIST =====
function PitchingList({ onView, onNewPitching }: { onView: (record: PitchingRecord) => void; onNewPitching: () => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return pitchingRecords.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return p.pitchingId.toLowerCase().includes(query) ||
          p.clientName.toLowerCase().includes(query) ||
          p.topic.toLowerCase().includes(query);
      }
      return true;
    });
  }, [searchQuery, statusFilter]);

  const totalCount = pitchingRecords.length;
  const activeCount = pitchingRecords.filter(p => p.status === 'initial' || p.status === 'following_up').length;
  const convertedCount = pitchingRecords.filter(p => p.status === 'converted').length;
  const conversionRate = totalCount > 0 ? Math.round((convertedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">Pitching 總數</span>
          <span className="text-[22px] font-bold block mt-1">{totalCount}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">進行中</span>
          <span className="text-[22px] font-bold block mt-1 text-amber-600">{activeCount}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">已轉報價單</span>
          <span className="text-[22px] font-bold block mt-1 text-emerald-600">{convertedCount}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">轉化率</span>
          <span className="text-[22px] font-bold block mt-1 text-teal-600">{conversionRate}%</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <input
            type="text"
            placeholder="搜尋 Pitching ID、客戶、主題..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-[13px] border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="all">全部狀態</option>
          <option value="initial">初步提案</option>
          <option value="following_up">跟進中</option>
          <option value="converted">已轉報價單</option>
          <option value="abandoned">已放棄</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Pitching ID</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">客戶名稱</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">查詢日期</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">提案主題</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">負責 PM</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">最後跟進</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(record => {
                const config = pitchingStatusConfig[record.status];
                return (
                  <tr key={record.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-[13px] font-medium text-teal-600">{record.pitchingId}</td>
                    <td className="px-4 py-3 text-[14px] font-medium">{record.clientName}</td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">{record.inquiryDate}</td>
                    <td className="px-4 py-3 text-[13px] max-w-[200px] truncate">{record.topic}</td>
                    <td className="px-4 py-3 text-[13px]">{record.assignedPmName}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[12px] font-medium px-2 py-0.5 rounded-sm', config.bgColor, config.color)}>
                        {config.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">{record.lastFollowUpDate || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onView(record)}
                        className="flex items-center gap-1 text-[12px] text-teal-600 font-medium hover:text-teal-700"
                      >
                        詳情 <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                    沒有找到符合條件的 Pitching 紀錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ===== NEW PITCHING WIZARD =====
function NewPitchingWizard({ onClose, onConvertToQuote }: { onClose: () => void; onConvertToQuote?: (data: any) => void }) {
  const [step, setStep] = useState(1);
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [formData, setFormData] = useState({
    clientName: '',
    clientId: '',
    topic: '',
    requirementSummary: '',
    estimatedBudgetMin: '',
    estimatedBudgetMax: '',
    currency: 'HKD',
    pitchDate: new Date().toISOString().split('T')[0],
    assignedPm: '張偉明',
    notes: '',
    nextAction: '',
  });

  const existingClients = [
    { id: 'client-1', name: '恒生銀行' },
    { id: 'client-2', name: '太古地產' },
    { id: 'client-3', name: '周大福珠寶' },
    { id: 'client-4', name: '國泰航空' },
    { id: 'client-5', name: '新世界發展' },
    { id: 'client-6', name: '領展房產' },
    { id: 'client-7', name: '中銀香港' },
  ];

  const handleAiGenerate = () => {
    if (!formData.topic) {
      toast.error('請先填寫提案主題');
      return;
    }
    const aiSummary = `根據「${formData.topic}」的需求，我們建議提供全方位解決方案，包含前期規劃、設計開發、測試上線及後期維護四大階段。項目預計需要4-6個月完成，團隊配置包括項目經理、UI/UX設計師、前端開發工程師及QA測試人員。主要交付物涵蓋需求分析報告、設計稿、原型演示、最終上線版本及培訓手冊。`;
    setFormData(prev => ({ ...prev, requirementSummary: aiSummary }));
    toast.success('AI 已生成客戶需求摘要');
  };

  const handleSubmit = () => {
    if (!formData.clientName || !formData.topic) {
      toast.error('請填寫必要欄位');
      return;
    }
    toast.success('Pitching 紀錄已成功新增！');
    onClose();
  };

  const handleConvertToQuote = () => {
    toast.success('正在轉換為正式報價單...');
    onClose();
  };

  const steps = ['選擇客戶', '填寫提案資訊'];

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((label, idx) => (
          <div key={label} className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold transition-colors',
              step === idx + 1 ? 'bg-teal-600 text-white' : step > idx + 1 ? 'bg-teal-100 text-teal-700' : 'bg-muted text-muted-foreground'
            )}>
              {idx + 1}
            </div>
            <span className={cn('text-[12px] whitespace-nowrap', step === idx + 1 ? 'text-teal-600 font-medium' : 'text-muted-foreground')}>{label}</span>
            {idx < steps.length - 1 && <div className="w-8 h-px bg-border" />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Client */}
      {step === 1 && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6 space-y-5">
          <h3 className="text-[16px] font-semibold">選擇客戶</h3>

          <div className="flex gap-3">
            <button
              onClick={() => setClientMode('existing')}
              className={cn(
                'px-4 py-2 rounded-md text-[13px] font-medium border transition-colors',
                clientMode === 'existing' ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-white border-border text-muted-foreground hover:bg-muted/50'
              )}
            >
              現有客戶
            </button>
            <button
              onClick={() => setClientMode('new')}
              className={cn(
                'px-4 py-2 rounded-md text-[13px] font-medium border transition-colors',
                clientMode === 'new' ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-white border-border text-muted-foreground hover:bg-muted/50'
              )}
            >
              新增客戶
            </button>
          </div>

          {clientMode === 'existing' ? (
            <div className="space-y-3">
              <label className="text-[13px] font-medium text-foreground">選擇客戶</label>
              <select
                value={formData.clientId}
                onChange={(e) => {
                  const client = existingClients.find(c => c.id === e.target.value);
                  setFormData(prev => ({ ...prev, clientId: e.target.value, clientName: client?.name || '' }));
                }}
                className="w-full text-[13px] border border-border rounded-md px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">— 請選擇客戶 —</option>
                {existingClients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="text-[13px] font-medium text-foreground">新客戶名稱</label>
              <input
                type="text"
                value={formData.clientName}
                onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                placeholder="輸入客戶公司名稱"
                className="w-full text-[13px] border border-border rounded-md px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={() => {
                if (!formData.clientName && !formData.clientId) {
                  toast.error('請選擇或輸入客戶');
                  return;
                }
                setStep(2);
              }}
              className="px-5 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]"
            >
              下一步
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Pitching Info */}
      {step === 2 && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[16px] font-semibold">填寫提案資訊</h3>
            <span className="text-[12px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
              客戶：{formData.clientName}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[13px] font-medium text-foreground">提案主題 *</label>
              <input
                type="text"
                value={formData.topic}
                onChange={(e) => setFormData(prev => ({ ...prev, topic: e.target.value }))}
                placeholder="例如：網站設計初步提案、品牌形象重塑方案"
                className="w-full text-[13px] border border-border rounded-md px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-medium text-foreground">客戶需求摘要</label>
                <button
                  onClick={handleAiGenerate}
                  className="flex items-center gap-1 text-[12px] text-teal-600 font-medium hover:text-teal-700"
                >
                  <Sparkles size={12} /> AI 生成專業描述
                </button>
              </div>
              <textarea
                value={formData.requirementSummary}
                onChange={(e) => setFormData(prev => ({ ...prev, requirementSummary: e.target.value }))}
                placeholder="描述客戶的主要需求、目標及期望..."
                rows={4}
                className="w-full text-[13px] border border-border rounded-md px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">初步預估金額（最低）</label>
              <div className="flex items-center gap-2">
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                  className="text-[13px] border border-border rounded-md px-2 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 w-20"
                >
                  <option value="HKD">HKD</option>
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                </select>
                <input
                  type="number"
                  value={formData.estimatedBudgetMin}
                  onChange={(e) => setFormData(prev => ({ ...prev, estimatedBudgetMin: e.target.value }))}
                  placeholder="最低預算"
                  className="flex-1 text-[13px] border border-border rounded-md px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">初步預估金額（最高）</label>
              <input
                type="number"
                value={formData.estimatedBudgetMax}
                onChange={(e) => setFormData(prev => ({ ...prev, estimatedBudgetMax: e.target.value }))}
                placeholder="最高預算"
                className="w-full text-[13px] border border-border rounded-md px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">提案日期</label>
              <input
                type="date"
                value={formData.pitchDate}
                onChange={(e) => setFormData(prev => ({ ...prev, pitchDate: e.target.value }))}
                className="w-full text-[13px] border border-border rounded-md px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">負責項目經理</label>
              <select
                value={formData.assignedPm}
                onChange={(e) => setFormData(prev => ({ ...prev, assignedPm: e.target.value }))}
                className="w-full text-[13px] border border-border rounded-md px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="張偉明">張偉明</option>
                <option value="李美珊">李美珊</option>
                <option value="陳志豪">陳志豪</option>
              </select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[13px] font-medium text-foreground">備註</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="其他備註..."
                rows={2}
                className="w-full text-[13px] border border-border rounded-md px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[13px] font-medium text-foreground">下一步行動計劃</label>
              <input
                type="text"
                value={formData.nextAction}
                onChange={(e) => setFormData(prev => ({ ...prev, nextAction: e.target.value }))}
                placeholder="例如：安排第一次會議、發送提案書..."
                className="w-full text-[13px] border border-border rounded-md px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 text-[13px] font-medium text-muted-foreground border border-border rounded-md hover:bg-muted/50 transition-colors"
            >
              上一步
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleConvertToQuote}
                className="flex items-center gap-1.5 px-4 py-2 border border-teal-200 text-teal-700 bg-teal-50 rounded-md text-[13px] font-medium hover:bg-teal-100 transition-colors active:scale-[0.97]"
              >
                <FileText size={13} /> 立即轉正式報價單
              </button>
              <button
                onClick={handleSubmit}
                className="px-5 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]"
              >
                儲存 Pitching
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== PITCHING DETAIL =====
function PitchingDetail({ record, onBack, onConvertToQuote }: { record: PitchingRecord; onBack: () => void; onConvertToQuote: () => void }) {
  const [activeTab, setActiveTab] = useState<'info' | 'followups' | 'quotation' | 'client'>('info');
  const [showAddFollowUp, setShowAddFollowUp] = useState(false);
  const [newFollowUp, setNewFollowUp] = useState({ date: new Date().toISOString().split('T')[0], content: '', result: '' });

  const config = pitchingStatusConfig[record.status];

  const tabs = [
    { id: 'info', label: '基本資訊', icon: FileText },
    { id: 'followups', label: '跟進記錄', icon: MessageSquare },
    { id: 'quotation', label: '關聯報價單', icon: DollarSign },
    { id: 'client', label: '客戶資料', icon: User },
  ] as const;

  const handleAddFollowUp = () => {
    if (!newFollowUp.content) {
      toast.error('請填寫跟進內容');
      return;
    }
    toast.success('跟進記錄已新增');
    setShowAddFollowUp(false);
    setNewFollowUp({ date: new Date().toISOString().split('T')[0], content: '', result: '' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ArrowLeft size={18} className="text-muted-foreground" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[20px] font-bold">{record.pitchingId}</h2>
              <span className={cn('text-[12px] font-medium px-2 py-0.5 rounded-sm', config.bgColor, config.color)}>
                {config.label}
              </span>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">{record.topic}</p>
          </div>
        </div>
        {record.status !== 'converted' && record.status !== 'abandoned' && (
          <button
            onClick={onConvertToQuote}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]"
          >
            <FileText size={14} /> 轉正式報價單
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors',
              activeTab === tab.id ? 'border-teal-600 text-teal-600' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <span className="text-[12px] text-muted-foreground block">客戶名稱</span>
                <span className="text-[14px] font-medium">{record.clientName}</span>
              </div>
              <div>
                <span className="text-[12px] text-muted-foreground block">提案主題</span>
                <span className="text-[14px] font-medium">{record.topic}</span>
              </div>
              <div>
                <span className="text-[12px] text-muted-foreground block">查詢日期</span>
                <span className="text-[14px]">{record.inquiryDate}</span>
              </div>
              <div>
                <span className="text-[12px] text-muted-foreground block">提案日期</span>
                <span className="text-[14px]">{record.pitchDate}</span>
              </div>
              <div>
                <span className="text-[12px] text-muted-foreground block">負責 PM</span>
                <span className="text-[14px]">{record.assignedPmName}</span>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <span className="text-[12px] text-muted-foreground block">初步預估金額</span>
                <span className="text-[14px] font-medium">
                  {record.currency} ${record.estimatedBudgetMin.toLocaleString()} — ${record.estimatedBudgetMax.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[12px] text-muted-foreground block">下一步行動</span>
                <span className="text-[14px]">{record.nextAction || '—'}</span>
              </div>
              <div>
                <span className="text-[12px] text-muted-foreground block">備註</span>
                <span className="text-[14px]">{record.notes || '—'}</span>
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <span className="text-[12px] text-muted-foreground block mb-1">客戶需求摘要</span>
            <p className="text-[14px] leading-relaxed text-foreground/80">{record.requirementSummary}</p>
          </div>
        </div>
      )}

      {activeTab === 'followups' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium">跟進記錄 ({record.followUps.length})</span>
            <button
              onClick={() => setShowAddFollowUp(true)}
              className="flex items-center gap-1 text-[12px] text-teal-600 font-medium hover:text-teal-700"
            >
              <Plus size={13} /> 新增跟進
            </button>
          </div>

          {showAddFollowUp && (
            <div className="bg-teal-50/50 rounded-md border border-teal-100 p-4 space-y-3">
              <h4 className="text-[13px] font-medium text-teal-700">新增跟進記錄</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[12px] text-muted-foreground">跟進日期</label>
                  <input
                    type="date"
                    value={newFollowUp.date}
                    onChange={(e) => setNewFollowUp(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[12px] text-muted-foreground">跟進內容</label>
                <textarea
                  value={newFollowUp.content}
                  onChange={(e) => setNewFollowUp(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="描述跟進行動..."
                  rows={2}
                  className="w-full text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[12px] text-muted-foreground">結果</label>
                <input
                  type="text"
                  value={newFollowUp.result}
                  onChange={(e) => setNewFollowUp(prev => ({ ...prev, result: e.target.value }))}
                  placeholder="跟進結果..."
                  className="w-full text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAddFollowUp(false)} className="px-3 py-1.5 text-[12px] text-muted-foreground border border-border rounded-md hover:bg-muted/50">取消</button>
                <button onClick={handleAddFollowUp} className="px-3 py-1.5 text-[12px] text-white bg-teal-600 rounded-md hover:bg-teal-700">儲存</button>
              </div>
            </div>
          )}

          {record.followUps.length > 0 ? (
            <div className="space-y-3">
              {record.followUps.map((fu, idx) => (
                <div key={fu.id} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={13} className="text-muted-foreground" />
                    <span className="text-[12px] font-medium text-muted-foreground">{fu.date}</span>
                    <span className="text-[11px] text-muted-foreground">by {fu.createdBy}</span>
                  </div>
                  <p className="text-[13px] text-foreground">{fu.content}</p>
                  {fu.result && (
                    <p className="text-[12px] text-muted-foreground mt-1.5 flex items-center gap-1">
                      <Target size={11} /> 結果：{fu.result}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-8 text-center">
              <MessageSquare size={24} className="mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-[13px] text-muted-foreground">暫無跟進記錄</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'quotation' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6">
          {record.linkedQuotationId ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-emerald-600" />
                <span className="text-[14px] font-medium">已關聯報價單</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-md border border-emerald-100">
                <span className="text-[14px] font-medium text-emerald-700">{record.linkedQuotationNumber}</span>
                <button className="flex items-center gap-1 text-[12px] text-teal-600 font-medium hover:text-teal-700">
                  查看報價單 <ExternalLink size={11} />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <FileText size={24} className="mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-[13px] text-muted-foreground mb-3">此 Pitching 尚未轉換為正式報價單</p>
              {record.status !== 'abandoned' && (
                <button
                  onClick={onConvertToQuote}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors mx-auto active:scale-[0.97]"
                >
                  <FileText size={13} /> 立即轉正式報價單
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'client' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
              <User size={18} className="text-teal-600" />
            </div>
            <div>
              <span className="text-[15px] font-medium block">{record.clientName}</span>
              <span className="text-[12px] text-muted-foreground">客戶 ID：{record.clientId || '—'}</span>
            </div>
          </div>
          <div className="border-t border-border pt-4 grid grid-cols-2 gap-4">
            <div>
              <span className="text-[12px] text-muted-foreground block">查詢日期</span>
              <span className="text-[13px]">{record.inquiryDate}</span>
            </div>
            <div>
              <span className="text-[12px] text-muted-foreground block">初步預算</span>
              <span className="text-[13px]">{record.currency} ${record.estimatedBudgetMin.toLocaleString()} — ${record.estimatedBudgetMax.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== MAIN PITCHING MODULE =====
export function PitchingModule() {
  const { navigateTo } = useApp();
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [selectedRecord, setSelectedRecord] = useState<PitchingRecord | null>(null);

  const handleView = (record: PitchingRecord) => {
    setSelectedRecord(record);
    setView('detail');
  };

  const handleConvertToQuote = () => {
    toast.success('已將 Pitching 資料帶入新建報價單');
    navigateTo('quotation', 'new');
  };

  if (view === 'new') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[24px] font-bold tracking-tight">新增 Pitching</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">記錄客戶初步提案內容，後續可轉為正式報價單。</p>
          </div>
          <button
            onClick={() => setView('list')}
            className="px-4 py-2 text-[13px] font-medium text-muted-foreground border border-border rounded-md hover:bg-muted/50 transition-colors"
          >
            返回列表
          </button>
        </div>
        <NewPitchingWizard
          onClose={() => setView('list')}
          onConvertToQuote={handleConvertToQuote}
        />
      </div>
    );
  }

  if (view === 'detail' && selectedRecord) {
    return (
      <PitchingDetail
        record={selectedRecord}
        onBack={() => { setView('list'); setSelectedRecord(null); }}
        onConvertToQuote={handleConvertToQuote}
      />
    );
  }

  // Default: list
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Pitching 紀錄</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">記錄所有客戶初步查詢及提案，追蹤從查詢到報價的完整歷程。</p>
        </div>
        <button
          onClick={() => setView('new')}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97]"
        >
          <Plus size={14} /> 新增 Pitching
        </button>
      </div>
      <PitchingList onView={handleView} onNewPitching={() => setView('new')} />
    </div>
  );
}
