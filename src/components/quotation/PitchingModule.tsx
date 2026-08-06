import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, ChevronRight, User, FileText, MessageSquare, ArrowLeft, Link2, Save, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useQuotationClientProjects } from '@/hooks/useQuotationClientProjects';
import { invokeAsanaPitchingSync } from '@/lib/asanaPitchingApi';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  pitchingStatusConfig,
  pitchingClientOptions,
  PITCHING_PROJECT_TYPE_OPTIONS,
  calcRemainingDays,
  formatProjectTypes,
  type PitchingRecord,
  type PitchingStatus,
  type PitchingProjectType,
} from '@/data/pitchingData';

type NewPitchingForm = {
  clientId: string;
  clientName: string;
  displayName: string;
  inquiryDate: string;
  description: string;
  projectTypes: PitchingProjectType[];
  asanaLink: string;
};

const todayIso = () => new Date().toISOString().split('T')[0]!;

const emptyForm = (): NewPitchingForm => ({
  clientId: '',
  clientName: '',
  displayName: '',
  inquiryDate: todayIso(),
  description: '',
  projectTypes: [],
  asanaLink: '',
});

function formatEnquiryDateLabel(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${y}年${parseInt(m!, 10)}月${parseInt(d!, 10)}日`;
}

export function RemainingDaysCell({ inquiryDate, status }: { inquiryDate: string; status: PitchingStatus }) {
  const days = calcRemainingDays(inquiryDate, status);
  if (days === null) return <span className="text-muted-foreground">—</span>;
  const color =
    days <= 0 ? 'text-rose-600 font-semibold' : days <= 7 ? 'text-amber-600 font-medium' : 'text-foreground';
  return <span className={cn('tabular-nums', color)}>{days <= 0 ? `逾期 ${Math.abs(days)} 天` : `${days} 天`}</span>;
}

function ProjectTypeMultiSelect({
  value,
  onChange,
}: {
  value: PitchingProjectType[];
  onChange: (next: PitchingProjectType[]) => void;
}) {
  const toggle = (id: PitchingProjectType) => {
    onChange(value.includes(id) ? value.filter((t) => t !== id) : [...value, id]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {PITCHING_PROJECT_TYPE_OPTIONS.map((opt) => {
          const selected = value.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              className={cn(
                'px-3 py-1.5 rounded-md text-[13px] font-medium border transition-colors',
                selected
                  ? 'bg-teal-50 border-teal-300 text-teal-800'
                  : 'bg-white border-border text-muted-foreground hover:bg-muted/40',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {value.length > 0 && (
        <p className="text-[11px] text-muted-foreground">已選：{formatProjectTypes(value)}</p>
      )}
    </div>
  );
}

function NewPitchingModal({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (form: NewPitchingForm) => void;
}) {
  const [form, setForm] = useState<NewPitchingForm>(emptyForm);

  useEffect(() => {
    if (isOpen) setForm(emptyForm());
  }, [isOpen]);

  const clientOptions = useMemo(
    () =>
      pitchingClientOptions.map((c) => ({
        value: c.id,
        label: c.name,
        keywords: c.name,
      })),
    [],
  );

  const handleClose = () => {
    setForm(emptyForm());
    onClose();
  };

  const handleClientChange = (clientId: string) => {
    const client = pitchingClientOptions.find((c) => c.id === clientId);
    setForm((prev) => ({
      ...prev,
      clientId,
      clientName: client?.name ?? '',
      displayName: prev.displayName || client?.name || '',
    }));
  };

  const handleCreate = () => {
    if (!form.clientId && !form.clientName.trim()) {
      toast.error('請選擇客戶');
      return;
    }
    if (!form.displayName.trim()) {
      toast.error('請填寫顯示名稱');
      return;
    }
    if (!form.inquiryDate) {
      toast.error('請選擇查詢日期');
      return;
    }
    if (form.projectTypes.length === 0) {
      toast.error('請至少選擇一個專案類型');
      return;
    }
    onSubmit(form);
    setForm(emptyForm());
  };

  const currentYear = new Date().getFullYear();

  return (
    <CrudModal isOpen={isOpen} onClose={handleClose} title="新增提案 New Pitching" size="xl">
      <div className="space-y-6 pb-2">
        <section className="space-y-3">
          <h3 className="text-[14px] font-semibold flex items-center gap-2">
            <User size={15} className="text-teal-600" />
            客戶 Customer
          </h3>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">客戶 Customer *</label>
            <SearchableSelect
              value={form.clientId}
              onValueChange={handleClientChange}
              options={clientOptions}
              placeholder="搜尋客戶..."
              searchPlaceholder="搜尋客戶名稱..."
              emptyText="找不到客戶"
            />
          </div>
        </section>

        <section className="space-y-4 border-t border-border pt-5">
          <h3 className="text-[14px] font-semibold flex items-center gap-2">
            <FileText size={15} className="text-teal-600" />
            提案詳細 Pitching Details
          </h3>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">顯示名稱 Display Name *</label>
            <Input
              value={form.displayName}
              onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
              placeholder="客戶顯示名稱（可自行修改）"
              className="h-9 text-[13px]"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              系統會使用此名稱作為主要顯示，選擇客戶時會自動填入，可手動覆蓋
            </p>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">查詢日期 Enquiry Date *</label>
            <Input
              type="date"
              value={form.inquiryDate}
              min={`${currentYear}-01-01`}
              max={`${currentYear + 1}-12-31`}
              onChange={(e) => setForm((prev) => ({ ...prev, inquiryDate: e.target.value }))}
              className="h-9 text-[13px] w-full max-w-[260px]"
            />
            {form.inquiryDate && (
              <p className="text-[11px] text-muted-foreground mt-1">
                已選：{formatEnquiryDateLabel(form.inquiryDate)}（預設為新增當日）
              </p>
            )}
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">專案類型 Project Type *</label>
            <ProjectTypeMultiSelect
              value={form.projectTypes}
              onChange={(projectTypes) => setForm((prev) => ({ ...prev, projectTypes }))}
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">提案描述 Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="提案描述..."
              rows={6}
              className="w-full text-[13px] border border-border rounded-md px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none overflow-y-auto leading-[1.5]"
              style={{ height: '9.75rem', minHeight: '9.75rem', maxHeight: '9.75rem' }}
            />
          </div>
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <h3 className="text-[14px] font-semibold flex items-center gap-2">
            <Link2 size={15} className="text-teal-600" />
            連結 Links
          </h3>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">Asana 連結</label>
            <Input
              type="url"
              value={form.asanaLink}
              onChange={(e) => setForm((prev) => ({ ...prev, asanaLink: e.target.value }))}
              placeholder="https://app.asana.com/..."
              className="h-9 text-[13px]"
            />
          </div>
        </section>

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="secondary" onClick={handleClose} className="gap-1.5">
            <X size={14} /> 取消
          </Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5" onClick={handleCreate}>
            <Save size={14} /> 建立
          </Button>
        </div>
      </div>
    </CrudModal>
  );
}

function PitchingList({
  records,
  onView,
}: {
  records: PitchingRecord[];
  onView: (record: PitchingRecord) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return records.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          p.pitchingId.toLowerCase().includes(query) ||
          p.clientName.toLowerCase().includes(query) ||
          p.displayName.toLowerCase().includes(query) ||
          formatProjectTypes(p.projectTypes).toLowerCase().includes(query) ||
          p.assignedPmName.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [records, searchQuery, statusFilter]);

  const totalCount = records.length;
  const activeCount = records.filter((p) => p.status === 'initial' || p.status === 'following_up' || p.status === 'confirmed').length;
  const closedCount = records.filter((p) => p.status === 'closed').length;
  const conversionRate = totalCount > 0 ? Math.round((closedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
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
          <span className="text-[13px] font-medium text-muted-foreground">已結案</span>
          <span className="text-[22px] font-bold block mt-1 text-emerald-600">{closedCount}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">結案率</span>
          <span className="text-[22px] font-bold block mt-1 text-teal-600">{conversionRate}%</span>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <input
            type="text"
            placeholder="搜尋客戶、顯示名稱、項目類型..."
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
          <option value="confirmed">確認項目</option>
          <option value="closed">已結案</option>
        </select>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">查詢日期</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">剩餘天數</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">項目類型</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">提案顯示名稱</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">負責 PM</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">狀態</th>
                <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => {
                const config = pitchingStatusConfig[record.status];
                return (
                  <tr key={record.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-[13px] text-muted-foreground tabular-nums">{record.inquiryDate}</td>
                    <td className="px-4 py-3 text-[13px]">
                      <RemainingDaysCell inquiryDate={record.inquiryDate} status={record.status} />
                    </td>
                    <td className="px-4 py-3 text-[13px] max-w-[180px]">{formatProjectTypes(record.projectTypes)}</td>
                    <td className="px-4 py-3 text-[14px] font-medium">{record.displayName}</td>
                    <td className="px-4 py-3 text-[13px]">{record.assignedPmName || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[12px] font-medium px-2 py-0.5 rounded-sm', config.bgColor, config.color)}>
                        {config.label}
                      </span>
                    </td>
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
                  <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-muted-foreground">
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

export function PitchingDetail({
  record,
  onBack,
  onConvertToQuote,
}: {
  record: PitchingRecord;
  onBack: () => void;
  onConvertToQuote: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'followups' | 'quotation' | 'client'>('info');
  const config = pitchingStatusConfig[record.status];
  const remaining = calcRemainingDays(record.inquiryDate, record.status);

  const tabs = [
    { id: 'info', label: '基本資訊', icon: FileText },
    { id: 'followups', label: '跟進記錄', icon: MessageSquare },
    { id: 'quotation', label: '關聯報價單', icon: FileText },
    { id: 'client', label: '客戶資料', icon: User },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <ArrowLeft size={18} className="text-muted-foreground" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[20px] font-bold">{record.displayName}</h2>
              <span className={cn('text-[12px] font-medium px-2 py-0.5 rounded-sm', config.bgColor, config.color)}>
                {config.label}
              </span>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">{record.pitchingId} · {record.clientName}</p>
          </div>
        </div>
        {record.status !== 'closed' && (
          <button
            onClick={onConvertToQuote}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]"
          >
            <FileText size={14} /> 轉正式報價單
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors',
              activeTab === tab.id ? 'border-teal-600 text-teal-600' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'info' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <span className="text-[12px] text-muted-foreground block">客戶名稱</span>
                <span className="text-[14px] font-medium">{record.clientName}</span>
              </div>
              <div>
                <span className="text-[12px] text-muted-foreground block">提案顯示名稱</span>
                <span className="text-[14px] font-medium">{record.displayName}</span>
              </div>
              <div>
                <span className="text-[12px] text-muted-foreground block">查詢日期</span>
                <span className="text-[14px]">{record.inquiryDate}</span>
              </div>
              <div>
                <span className="text-[12px] text-muted-foreground block">剩餘天數</span>
                <span className="text-[14px]">
                  {remaining === null ? '—' : remaining <= 0 ? `逾期 ${Math.abs(remaining)} 天` : `${remaining} 天`}
                </span>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <span className="text-[12px] text-muted-foreground block">項目類型</span>
                <span className="text-[14px] font-medium">{formatProjectTypes(record.projectTypes)}</span>
              </div>
              <div>
                <span className="text-[12px] text-muted-foreground block">負責 PM</span>
                <span className="text-[14px]">{record.assignedPmName || '—'}</span>
              </div>
              <div>
                <span className="text-[12px] text-muted-foreground block">Asana 連結</span>
                {record.asanaLink ? (
                  <a
                    href={record.asanaLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] text-teal-600 hover:underline break-all"
                  >
                    {record.asanaLink}
                  </a>
                ) : (
                  <span className="text-[14px]">—</span>
                )}
              </div>
            </div>
          </div>
          {record.description && (
            <div className="border-t border-border pt-4">
              <span className="text-[12px] text-muted-foreground block mb-1">提案描述</span>
              <p className="text-[14px] leading-relaxed text-foreground/80 whitespace-pre-wrap">{record.description}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'followups' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-8 text-center">
          <MessageSquare size={24} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-[13px] text-muted-foreground">
            {record.followUps.length > 0 ? `${record.followUps.length} 筆跟進記錄` : '暫無跟進記錄'}
          </p>
        </div>
      )}

      {activeTab === 'quotation' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6 text-center py-8">
          {record.linkedQuotationNumber ? (
            <p className="text-[14px] font-medium text-emerald-700">{record.linkedQuotationNumber}</p>
          ) : (
            <>
              <FileText size={24} className="mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-[13px] text-muted-foreground mb-3">此 Pitching 尚未轉換為正式報價單</p>
              {record.status !== 'closed' && (
                <button
                  onClick={onConvertToQuote}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors mx-auto active:scale-[0.97]"
                >
                  <FileText size={13} /> 立即轉正式報價單
                </button>
              )}
            </>
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
        </div>
      )}
    </div>
  );
}

export function PitchingModule() {
  const { navigateTo } = useApp();
  const { systemUser, userInfo } = useAuth();
  const { records, loading, error, lastSyncedAt, refresh, addRecord } = useQuotationClientProjects();
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedRecord, setSelectedRecord] = useState<PitchingRecord | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const pmName = systemUser?.display_name || userInfo?.display_name || '—';

  const handleView = (record: PitchingRecord) => {
    setSelectedRecord(record);
    setView('detail');
  };

  const handleSyncAsana = async () => {
    setSyncing(true);
    try {
      const result = await invokeAsanaPitchingSync();
      await refresh();
      toast.success(
        `Asana 同步完成：${result.records_upserted ?? 0} 筆（${result.projects_synced ?? 0} 個專案）`,
      );
      if (result.errors?.length) {
        toast.warning(`${result.errors.length} 筆同步警告，詳見主控台`);
        console.warn('[Asana sync]', result.errors);
      }
    } catch (e) {
      toast.error(`Asana 同步失敗：${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleAddPitching = async (form: NewPitchingForm) => {
    const { error: addErr } = await addRecord({
      clientId: form.clientId,
      clientName: form.clientName,
      displayName: form.displayName.trim(),
      inquiryDate: form.inquiryDate,
      description: form.description.trim() || undefined,
      projectTypes: form.projectTypes,
      assignedPm: systemUser?.id ?? '',
      assignedPmName: pmName,
      status: 'initial',
      asanaLink: form.asanaLink.trim() || undefined,
    });
    if (addErr) {
      toast.error(`新增失敗：${addErr.message}`);
      return;
    }
    setShowAddModal(false);
    toast.success('Pitching 已成功新增');
  };

  const handleConvertToQuote = () => {
    toast.success('已將 Pitching 資料帶入新建報價單');
    navigateTo('quotation', 'new');
  };

  if (view === 'detail' && selectedRecord) {
    return (
      <PitchingDetail
        record={selectedRecord}
        onBack={() => {
          setView('list');
          setSelectedRecord(null);
        }}
        onConvertToQuote={handleConvertToQuote}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Pitching</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            記錄所有客戶初步查詢及提案，追蹤從查詢到報價的完整歷程。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSyncAsana()}
            disabled={syncing}
            className="flex items-center gap-1.5 px-4 py-2 border border-teal-200 text-teal-700 bg-teal-50 rounded-md text-[13px] font-medium hover:bg-teal-100 transition-colors disabled:opacity-60"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? '同步 Asana…' : '同步 Asana'}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97]"
          >
            <Plus size={14} /> 新增 Pitching
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          無法載入 Pitching 資料：{error}（請確認已執行 Supabase migration）
        </div>
      )}
      {lastSyncedAt && !error && (
        <p className="text-[12px] text-muted-foreground">最後更新：{lastSyncedAt.slice(0, 19).replace('T', ' ')}</p>
      )}

      {loading ? (
        <div className="text-center py-12 text-[13px] text-muted-foreground">載入 Pitching 資料中…</div>
      ) : (
        <PitchingList records={records} onView={handleView} />
      )}

      <NewPitchingModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddPitching}
      />
    </div>
  );
}
