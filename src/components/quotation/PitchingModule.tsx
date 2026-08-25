import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, ChevronRight, FileText, MessageSquare, ArrowLeft, Link2, Save, X, DollarSign, User, Pencil, Clock, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useQuotationClientProjects, type QuotationClientProjectUpdate } from '@/hooks/useQuotationClientProjects';
import { useQuotationClientList } from '@/hooks/useQuotationClientList';
import { useActiveStaffOptions, type StaffSelectOption } from '@/hooks/useActiveStaffOptions';
import {
  toQuotationClientSelectOption,
  type QuotationClient,
  type QuotationClientInput,
  type QuotationClientSelectOption,
} from '@/data/quotationClientList';
import { useQuotationClientDetailId } from '@/hooks/useQuotationClientDetailId';
import { ClientFormModal } from '@/components/crm/ClientFormModal';
import { CrudModal } from '@/components/ui/crud-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  pitchingStatusConfig,
  PITCHING_PROJECT_TYPE_OPTIONS,
  PITCHING_STATUS_OPTIONS,
  calcRemainingDays,
  formatProjectTypes,
  formatMainPmName,
  matchesProjectTypeFilter,
  optionalIsoDate,
  type PitchingRecord,
  type PitchingStatus,
  type PitchingProjectType,
  type PitchingExpenseItem,
} from '@/data/pitchingData';
import { PitchingBudgetTab } from '@/components/quotation/PitchingBudgetTab';
import { PitchingDocsTab } from '@/components/quotation/PitchingDocsTab';
import { PitchingFollowUpsTab } from '@/components/quotation/PitchingFollowUpsTab';
import { PitchingWorkHoursTab } from '@/components/quotation/PitchingWorkHoursTab';
import { QuotationBvCard } from '@/components/quotation/QuotationBvCard';

export type PitchingFormValues = {
  clientId: string;
  clientName: string;
  displayName: string;
  inquiryDate: string;
  signedDate: string;
  handoverDate: string;
  description: string;
  projectTypes: PitchingProjectType[];
  mainPmId: string;
  asanaLink: string;
};

export type ClientOption = QuotationClientSelectOption;

function companyNamesForClient(clientId: string, clientOptions: ClientOption[]) {
  const client = clientOptions.find((c) => c.value === clientId);
  return {
    companyNameZh: client?.companyNameZh ?? '',
    companyNameEn: client?.companyNameEn ?? '',
  };
}

const todayIso = () => new Date().toISOString().split('T')[0]!;

const emptyForm = (defaultMainPmId = ''): PitchingFormValues => ({
  clientId: '',
  clientName: '',
  displayName: '',
  inquiryDate: todayIso(),
  signedDate: '',
  handoverDate: '',
  description: '',
  projectTypes: [],
  mainPmId: defaultMainPmId,
  asanaLink: '',
});

function formFromRecord(record: PitchingRecord, clientOptions: ClientOption[]): PitchingFormValues {
  const byId = record.clientId
    ? clientOptions.find((c) => c.value === record.clientId)
    : undefined;
  const byName =
    !byId && record.clientName && record.clientName !== '—'
      ? clientOptions.find((c) => c.label === record.clientName)
      : undefined;
  const matched = byId ?? byName;
  const clientName = matched?.label ?? (record.clientName === '—' ? '' : record.clientName);
  return {
    clientId: matched?.value ?? record.clientId?.trim() ?? '',
    clientName,
    displayName: record.displayName,
    inquiryDate: record.inquiryDate,
    signedDate: optionalIsoDate(record.signedDate) ?? '',
    handoverDate: optionalIsoDate(record.handoverDate) ?? '',
    description: record.description ?? '',
    projectTypes: record.projectTypes,
    mainPmId: record.mainPmId ?? '',
    asanaLink: record.asanaLink ?? '',
  };
}

export function pitchingFormToUpdate(form: PitchingFormValues): QuotationClientProjectUpdate {
  return {
    clientId: form.clientId.trim(),
    clientName: form.clientName.trim(),
    displayName: form.displayName.trim(),
    inquiryDate: form.inquiryDate,
    signedDate: form.signedDate,
    handoverDate: form.handoverDate,
    description: form.description.trim() || undefined,
    projectTypes: form.projectTypes,
    mainPmId: form.mainPmId.trim(),
    asanaLink: form.asanaLink.trim() || undefined,
  };
}

function formatEnquiryDateLabel(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${y}年${parseInt(m!, 10)}月${parseInt(d!, 10)}日`;
}

export function PitchingStatusSelect({
  value,
  onChange,
  className,
}: {
  value: PitchingStatus;
  onChange: (status: PitchingStatus) => void;
  className?: string;
}) {
  const config = pitchingStatusConfig[value];
  return (
    <select
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value as PitchingStatus)}
      className={cn(
        'text-[12px] font-medium px-2 py-1 rounded-sm border border-transparent cursor-pointer',
        'hover:ring-1 hover:ring-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-500',
        config.bgColor,
        config.color,
        className,
      )}
      aria-label="變更狀態"
    >
      {PITCHING_STATUS_OPTIONS.map((status) => (
        <option key={status} value={status}>
          {pitchingStatusConfig[status].label}
        </option>
      ))}
    </select>
  );
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

export function PitchingFormModal({
  isOpen,
  onClose,
  onSubmit,
  clientOptions,
  staffOptions,
  defaultMainPmId,
  initialRecord,
  onCreateClient,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (form: PitchingFormValues) => void | Promise<void>;
  clientOptions: ClientOption[];
  staffOptions: StaffSelectOption[];
  defaultMainPmId?: string;
  initialRecord?: PitchingRecord | null;
  onCreateClient?: (input: QuotationClientInput) => Promise<QuotationClient | null>;
}) {
  const [form, setForm] = useState<PitchingFormValues>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [showQuickAddClient, setShowQuickAddClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const isEdit = Boolean(initialRecord);

  useEffect(() => {
    if (!isOpen) return;
    setForm(
      initialRecord
        ? formFromRecord(initialRecord, clientOptions)
        : emptyForm(defaultMainPmId ?? ''),
    );
    setShowQuickAddClient(false);
    // Only reset when the dialog opens or the edited row changes — not when the client list refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialRecord?.id]);

  const handleClose = () => {
    setForm(emptyForm(defaultMainPmId ?? ''));
    setShowQuickAddClient(false);
    onClose();
  };

  const applyClient = (clientId: string, clientName: string) => {
    setForm((prev) => ({
      ...prev,
      clientId,
      clientName,
      displayName: prev.displayName || clientName,
    }));
  };

  const handleClientChange = (clientId: string) => {
    const client = clientOptions.find((c) => c.value === clientId);
    applyClient(clientId, client?.label ?? '');
  };

  const handleQuickAddClient = async (input: QuotationClientInput) => {
    if (!onCreateClient) return null;
    setSavingClient(true);
    try {
      const client = await onCreateClient(input);
      if (!client) {
        toast.error('儲存客戶失敗');
        return null;
      }
      const option = toQuotationClientSelectOption(client);
      applyClient(client.id, option.label);
      return client;
    } finally {
      setSavingClient(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.clientId.trim()) {
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
    if (!form.mainPmId.trim()) {
      toast.error('請選擇負責 PM');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <>
    <CrudModal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? '編輯提案 Edit Pitching' : '新增提案 New Pitching'}
      size="xl"
    >
      <div className="space-y-6 pb-2">
        <section className="space-y-3">
          <h3 className="text-[14px] font-semibold flex items-center gap-2">
            <User size={15} className="text-teal-600" />
            客戶 Customer
          </h3>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">客戶 Customer *</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <SearchableSelect
                  value={form.clientId}
                  onValueChange={handleClientChange}
                  options={clientOptions}
                  placeholder="搜尋客戶..."
                  searchPlaceholder="搜尋客戶名稱..."
                  emptyText="找不到客戶"
                />
              </div>
              {onCreateClient && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowQuickAddClient(true)}
                  className="h-9 shrink-0 gap-1.5 text-[13px] border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100"
                >
                  <Plus size={14} /> 新增客戶
                </Button>
              )}
            </div>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">查詢日期 Enquiry Date *</label>
              <Input
                type="date"
                value={form.inquiryDate}
                min={`${currentYear}-01-01`}
                max={`${currentYear + 1}-12-31`}
                onChange={(e) => setForm((prev) => ({ ...prev, inquiryDate: e.target.value }))}
                className="h-9 text-[13px] w-full"
              />
              {form.inquiryDate && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  已選：{formatEnquiryDateLabel(form.inquiryDate)}
                  {isEdit ? '' : '（預設為新增當日）'}
                </p>
              )}
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">簽約日期 Signed Date</label>
              <Input
                type="date"
                value={form.signedDate}
                min={`${currentYear - 2}-01-01`}
                max={`${currentYear + 2}-12-31`}
                onChange={(e) => setForm((prev) => ({ ...prev, signedDate: e.target.value }))}
                className="h-9 text-[13px] w-full"
              />
              {form.signedDate && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  已選：{formatEnquiryDateLabel(form.signedDate)}
                </p>
              )}
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">交付日期 Handover Date</label>
              <Input
                type="date"
                value={form.handoverDate}
                min={`${currentYear - 2}-01-01`}
                max={`${currentYear + 2}-12-31`}
                onChange={(e) => setForm((prev) => ({ ...prev, handoverDate: e.target.value }))}
                className="h-9 text-[13px] w-full"
              />
              {form.handoverDate && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  已選：{formatEnquiryDateLabel(form.handoverDate)}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">專案類型 Project Type *</label>
            <ProjectTypeMultiSelect
              value={form.projectTypes}
              onChange={(projectTypes) => setForm((prev) => ({ ...prev, projectTypes }))}
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">負責 PM *</label>
            <SearchableSelect
              value={form.mainPmId}
              onValueChange={(mainPmId) => setForm((prev) => ({ ...prev, mainPmId }))}
              options={staffOptions}
              placeholder="選擇負責 PM..."
              searchPlaceholder="搜尋同事名稱或電郵..."
              emptyText="找不到同事"
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
          <Button variant="secondary" onClick={handleClose} className="gap-1.5" disabled={submitting}>
            <X size={14} /> 取消
          </Button>
          <Button
            className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            <Save size={14} /> {submitting ? '儲存中…' : isEdit ? '儲存' : '建立'}
          </Button>
        </div>
      </div>
    </CrudModal>
    {onCreateClient && (
      <ClientFormModal
        open={showQuickAddClient}
        onClose={() => setShowQuickAddClient(false)}
        onSave={handleQuickAddClient}
        saving={savingClient}
        overlayClassName="z-[120]"
      />
    )}
    </>
  );
}

function PitchingList({
  records,
  onView,
  onEdit,
  onStatusChange,
}: {
  records: PitchingRecord[];
  onView: (record: PitchingRecord) => void;
  onEdit: (record: PitchingRecord) => void;
  onStatusChange: (id: string, status: PitchingStatus) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [projectTypeFilter, setProjectTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return records.filter((p) => {
      if (!matchesProjectTypeFilter(p.projectTypes, projectTypeFilter)) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          p.pitchingId.toLowerCase().includes(query) ||
          p.clientName.toLowerCase().includes(query) ||
          p.displayName.toLowerCase().includes(query) ||
          formatProjectTypes(p.projectTypes).toLowerCase().includes(query) ||
          formatMainPmName(p).toLowerCase().includes(query) ||
          p.assignedPmName.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [records, searchQuery, projectTypeFilter, statusFilter]);

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
          value={projectTypeFilter}
          onChange={(e) => setProjectTypeFilter(e.target.value)}
          className="text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="all">全部項目類型</option>
          {PITCHING_PROJECT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
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
              {filtered.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => onView(record)}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-[13px] text-muted-foreground tabular-nums">{record.inquiryDate}</td>
                    <td className="px-4 py-3 text-[13px]">
                      <RemainingDaysCell inquiryDate={record.inquiryDate} status={record.status} />
                    </td>
                    <td className="px-4 py-3 text-[13px] max-w-[180px]">{formatProjectTypes(record.projectTypes)}</td>
                    <td className="px-4 py-3 text-[14px] font-medium">{record.displayName}</td>
                    <td className="px-4 py-3 text-[13px]">{formatMainPmName(record)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <PitchingStatusSelect
                        value={record.status}
                        onChange={(status) => onStatusChange(record.id, status)}
                      />
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onEdit(record)}
                          className="flex items-center gap-1 text-[12px] text-teal-600 font-medium hover:text-teal-700"
                        >
                          <Pencil size={12} /> 編輯
                        </button>
                        <button
                          type="button"
                          onClick={() => onView(record)}
                          className="flex items-center gap-1 text-[12px] text-muted-foreground font-medium hover:text-foreground"
                        >
                          詳情 <ChevronRight size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

type DetailDraft = {
  clientId: string;
  clientName: string;
  displayName: string;
  inquiryDate: string;
  signedDate: string;
  handoverDate: string;
  description: string;
  projectTypes: PitchingProjectType[];
  asanaLink: string;
  status: PitchingStatus;
  estimatedIncome: number | undefined;
  estimatedExpenses: PitchingExpenseItem[];
};

function draftFromRecord(record: PitchingRecord, clientOptions: ClientOption[]): DetailDraft {
  const byId = record.clientId
    ? clientOptions.find((c) => c.value === record.clientId)
    : undefined;
  const byName =
    !byId && record.clientName && record.clientName !== '—'
      ? clientOptions.find((c) => c.label === record.clientName)
      : undefined;
  const matched = byId ?? byName;
  return {
    clientId: matched?.value ?? record.clientId?.trim() ?? '',
    clientName: matched?.label ?? (record.clientName === '—' ? '' : record.clientName),
    displayName: record.displayName,
    inquiryDate: record.inquiryDate,
    signedDate: optionalIsoDate(record.signedDate) ?? '',
    handoverDate: optionalIsoDate(record.handoverDate) ?? '',
    description: record.description ?? '',
    projectTypes: record.projectTypes,
    asanaLink: record.asanaLink ?? '',
    status: record.status,
    estimatedIncome: record.estimatedIncome,
    estimatedExpenses: record.estimatedExpenses ?? [],
  };
}

function EditableTextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="min-w-0">
        <span className="text-[12px] text-muted-foreground block mb-1">{label}</span>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
          placeholder={placeholder}
          className="text-[14px] h-9 min-w-0"
        />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <span className="text-[12px] text-muted-foreground block">{label}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left text-[14px] font-medium rounded px-1 -mx-1 py-0.5 hover:bg-muted/50 transition-colors w-full min-w-0 max-w-full break-all whitespace-normal"
      >
        {value.trim() || <span className="text-muted-foreground font-normal italic">點擊編輯</span>}
      </button>
    </div>
  );
}

function EditableDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div>
        <span className="text-[12px] text-muted-foreground block mb-1">{label}</span>
        <Input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
          className="text-[14px] h-9 w-auto"
        />
      </div>
    );
  }

  return (
    <div>
      <span className="text-[12px] text-muted-foreground block">{label}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left text-[14px] rounded px-1 -mx-1 py-0.5 hover:bg-muted/50 transition-colors"
      >
        {value || '—'}
      </button>
    </div>
  );
}

function EditableTextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div>
        <span className="text-[12px] text-muted-foreground block mb-1">{label}</span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
          rows={5}
          placeholder={placeholder}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-[14px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>
    );
  }

  return (
    <div>
      <span className="text-[12px] text-muted-foreground block mb-1">{label}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left text-[14px] leading-relaxed text-foreground/80 whitespace-pre-wrap rounded px-1 -mx-1 py-0.5 hover:bg-muted/50 transition-colors w-full"
      >
        {value.trim() || <span className="text-muted-foreground italic">點擊新增描述</span>}
      </button>
    </div>
  );
}

function EditableProjectTypesField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PitchingProjectType[];
  onChange: (next: PitchingProjectType[]) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div>
        <span className="text-[12px] text-muted-foreground block mb-1">{label}</span>
        <ProjectTypeMultiSelect value={value} onChange={onChange} />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="mt-2 text-[12px] text-teal-600 hover:text-teal-700"
        >
          完成
        </button>
      </div>
    );
  }

  return (
    <div>
      <span className="text-[12px] text-muted-foreground block">{label}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left text-[14px] font-medium rounded px-1 -mx-1 py-0.5 hover:bg-muted/50 transition-colors"
      >
        {formatProjectTypes(value)}
      </button>
    </div>
  );
}

export function PitchingDetail({
  record,
  clientOptions,
  onBack,
  onEdit,
  onConvertToQuote,
  onSave,
}: {
  record: PitchingRecord;
  clientOptions: ClientOption[];
  onBack: () => void;
  onEdit: () => void;
  onConvertToQuote: () => void;
  onSave: (id: string, data: QuotationClientProjectUpdate) => Promise<{ error: { message: string } | null }>;
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'followups' | 'hours' | 'quotation' | 'docs' | 'budget'>('info');
  const [draft, setDraft] = useState<DetailDraft>(() => draftFromRecord(record, clientOptions));
  const [saving, setSaving] = useState(false);
  const clientCompany = companyNamesForClient(draft.clientId, clientOptions);

  useEffect(() => {
    setDraft(draftFromRecord(record, clientOptions));
    // Reset when the viewed row changes — not when the client list refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id, record.updatedAt]);

  const remaining = calcRemainingDays(draft.inquiryDate, draft.status);

  const hasChanges = useMemo(() => {
    const initial = draftFromRecord(record, clientOptions);
    const typesChanged =
      draft.projectTypes.length !== initial.projectTypes.length ||
      [...draft.projectTypes].sort().join(',') !== [...initial.projectTypes].sort().join(',');
    const expensesChanged =
      draft.estimatedExpenses.length !== initial.estimatedExpenses.length ||
      JSON.stringify(draft.estimatedExpenses) !== JSON.stringify(initial.estimatedExpenses);
    return (
      draft.clientId !== initial.clientId ||
      draft.clientName !== initial.clientName ||
      draft.displayName !== initial.displayName ||
      draft.inquiryDate !== initial.inquiryDate ||
      draft.signedDate !== initial.signedDate ||
      draft.handoverDate !== initial.handoverDate ||
      draft.description !== initial.description ||
      draft.asanaLink !== initial.asanaLink ||
      draft.status !== initial.status ||
      draft.estimatedIncome !== initial.estimatedIncome ||
      expensesChanged ||
      typesChanged
    );
  }, [draft, record, clientOptions]);

  const patchDraft = (patch: Partial<DetailDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = async () => {
    if (!draft.clientId.trim()) {
      toast.error('請選擇客戶');
      return;
    }
    if (!draft.displayName.trim()) {
      toast.error('提案顯示名稱不可為空');
      return;
    }
    if (!draft.inquiryDate) {
      toast.error('請選擇查詢日期');
      return;
    }

    setSaving(true);
    const payload: QuotationClientProjectUpdate = {
      clientId: draft.clientId.trim(),
      clientName: draft.clientName,
      displayName: draft.displayName.trim(),
      inquiryDate: draft.inquiryDate,
      signedDate: draft.signedDate,
      handoverDate: draft.handoverDate,
      description: draft.description.trim() || undefined,
      projectTypes: draft.projectTypes,
      asanaLink: draft.asanaLink.trim() || undefined,
      status: draft.status,
      estimatedIncome: draft.estimatedIncome,
      estimatedExpenses: draft.estimatedExpenses,
    };
    const { error } = await onSave(record.id, payload);
    setSaving(false);
    if (error) {
      toast.error(`儲存失敗：${error.message}`);
    }
  };

  const tabs = [
    { id: 'info', label: '基本資訊', icon: FileText },
    { id: 'followups', label: '跟進記錄', icon: MessageSquare },
    { id: 'hours', label: '工作時數', icon: Clock },
    { id: 'quotation', label: '關聯報價單', icon: FileText },
    { id: 'docs', label: '項目文件', icon: FolderOpen },
    { id: 'budget', label: '預計收入支出', icon: DollarSign },
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
              <h2 className="text-[20px] font-bold">{draft.displayName || record.displayName}</h2>
              <span
                className={cn(
                  'text-[12px] font-medium px-2.5 py-1 rounded-sm',
                  pitchingStatusConfig[draft.status].bgColor,
                  pitchingStatusConfig[draft.status].color,
                )}
              >
                {pitchingStatusConfig[draft.status].label}
              </span>
            </div>
            <p className="text-[13px] text-muted-foreground mt-0.5">{record.pitchingId} · {draft.clientName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-md text-[13px] font-medium text-foreground hover:bg-muted/50 transition-colors active:scale-[0.97]"
          >
            <Pencil size={14} /> 編輯
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !hasChanges}
            className="flex items-center gap-1.5 px-4 py-2 border border-teal-200 text-teal-700 bg-teal-50 rounded-md text-[13px] font-medium hover:bg-teal-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]"
          >
            <Save size={14} className={saving ? 'animate-pulse' : ''} />
            {saving ? '儲存中…' : '儲存'}
          </button>
          <PitchingStatusSelect
            value={draft.status}
            onChange={(status) => patchDraft({ status })}
            className="text-[13px] px-3 py-1.5"
          />
          {draft.status !== 'closed' && (
            <button
              onClick={onConvertToQuote}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]"
            >
              <FileText size={14} /> 生成報價單
            </button>
          )}
        </div>
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
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6 space-y-5 min-w-0 overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-w-0">
                <div className="space-y-4 min-w-0">
                  <div>
                    <span className="text-[12px] text-muted-foreground block mb-1">客戶 Customer</span>
                    <SearchableSelect
                      value={draft.clientId}
                      onValueChange={(clientId) => {
                        const client = clientOptions.find((c) => c.value === clientId);
                        patchDraft({
                          clientId,
                          clientName: client?.label ?? '',
                        });
                      }}
                      options={clientOptions}
                      placeholder="搜尋客戶..."
                      searchPlaceholder="搜尋客戶名稱..."
                      emptyText="找不到客戶"
                    />
                  </div>
                  <EditableTextField
                    label="提案顯示名稱"
                    value={draft.displayName}
                    onChange={(displayName) => patchDraft({ displayName })}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-[12px] text-muted-foreground block">公司名稱 (中文)</span>
                      <p className="text-[14px] font-medium mt-0.5">{clientCompany.companyNameZh || '—'}</p>
                    </div>
                    <div>
                      <span className="text-[12px] text-muted-foreground block">公司名稱 (Eng)</span>
                      <p className="text-[14px] font-medium mt-0.5">{clientCompany.companyNameEn || '—'}</p>
                    </div>
                  </div>
                  <EditableDateField
                    label="查詢日期"
                    value={draft.inquiryDate}
                    onChange={(inquiryDate) => patchDraft({ inquiryDate })}
                  />
                  <EditableDateField
                    label="簽約日期"
                    value={draft.signedDate}
                    onChange={(signedDate) => patchDraft({ signedDate })}
                  />
                  <EditableDateField
                    label="交付日期"
                    value={draft.handoverDate}
                    onChange={(handoverDate) => patchDraft({ handoverDate })}
                  />
                  <div>
                    <span className="text-[12px] text-muted-foreground block">剩餘天數</span>
                    <span className="text-[14px]">
                      {remaining === null ? '—' : remaining <= 0 ? `逾期 ${Math.abs(remaining)} 天` : `${remaining} 天`}
                    </span>
                  </div>
                </div>
                <div className="space-y-4 min-w-0">
                  <EditableProjectTypesField
                    label="項目類型"
                    value={draft.projectTypes}
                    onChange={(projectTypes) => patchDraft({ projectTypes })}
                  />
                  <div>
                    <span className="text-[12px] text-muted-foreground block">負責 PM</span>
                    <p className="text-[14px] font-medium mt-0.5">{formatMainPmName(record)}</p>
                  </div>
                  <EditableTextField
                    label="Asana 連結"
                    value={draft.asanaLink}
                    onChange={(asanaLink) => patchDraft({ asanaLink })}
                    placeholder="https://app.asana.com/..."
                  />
                </div>
              </div>
            </div>
            <QuotationBvCard projectId={record.id} />
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6">
            <EditableTextAreaField
              label="提案描述"
              value={draft.description}
              onChange={(description) => patchDraft({ description })}
            />
          </div>
        </div>
      )}

      {activeTab === 'followups' && (
        <PitchingFollowUpsTab
          projectId={record.id}
          asanaLink={draft.asanaLink || record.asanaLink || ''}
          asanaTaskGid={record.asanaTaskGid}
        />
      )}

      {activeTab === 'hours' && (
        <PitchingWorkHoursTab projectId={record.id} />
      )}

      {activeTab === 'quotation' && (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-6 text-center py-8">
          {record.linkedQuotationNumber ? (
            <p className="text-[14px] font-medium text-emerald-700">{record.linkedQuotationNumber}</p>
          ) : (
            <>
              <FileText size={24} className="mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-[13px] text-muted-foreground mb-3">此 Pitching 尚未生成報價單</p>
              {draft.status !== 'closed' && (
                <button
                  onClick={onConvertToQuote}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors mx-auto active:scale-[0.97]"
                >
                  <FileText size={13} /> 立即生成報價單
                </button>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'docs' && (
        <PitchingDocsTab projectId={record.id} />
      )}

      {activeTab === 'budget' && (
        <PitchingBudgetTab
          income={draft.estimatedIncome}
          expenses={draft.estimatedExpenses}
          onIncomeChange={(estimatedIncome) => patchDraft({ estimatedIncome })}
          onExpensesChange={(estimatedExpenses) => patchDraft({ estimatedExpenses })}
        />
      )}
    </div>
  );
}

export function PitchingModule() {
  const { navigateTo } = useApp();
  const { systemUser } = useAuth();
  const { records, loading, error, lastSyncedAt, addRecord, updateStatus, updateRecord } = useQuotationClientProjects();
  const { records: clientListRecords, addClient } = useQuotationClientList();
  const { detailId, openDetail, closeDetail } = useQuotationClientDetailId('pitching');
  const selectedRecord = useMemo(
    () => (detailId ? records.find((r) => r.id === detailId) ?? null : null),
    [detailId, records],
  );
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PitchingRecord | null>(null);
  const { options: staffOptions } = useActiveStaffOptions([
    editingRecord?.mainPmId,
    selectedRecord?.mainPmId,
  ]);

  const pitchingClientOptions = useMemo(
    () => clientListRecords.map(toQuotationClientSelectOption),
    [clientListRecords],
  );

  const handleView = (record: PitchingRecord) => {
    openDetail(record.id);
  };

  const openCreateModal = () => {
    setEditingRecord(null);
    setFormModalOpen(true);
  };

  const openEditModal = (record: PitchingRecord) => {
    setEditingRecord(record);
    setFormModalOpen(true);
  };

  const closeFormModal = () => {
    setFormModalOpen(false);
    setEditingRecord(null);
  };

  const handleFormSubmit = async (form: PitchingFormValues) => {
    const selectedStaff = staffOptions.find((s) => s.value === form.mainPmId);
    const payload = {
      ...pitchingFormToUpdate(form),
      assignedPmName: selectedStaff?.label || '',
      mainPmName: selectedStaff?.label || undefined,
    };
    if (editingRecord) {
      const { error: saveErr } = await updateRecord(editingRecord.id, payload);
      if (saveErr) {
        toast.error(`儲存失敗：${saveErr.message}`);
        return;
      }
      closeFormModal();
      toast.success('Pitching 已更新');
      return;
    }

    const { error: addErr } = await addRecord({
      clientId: form.clientId.trim(),
      clientName: form.clientName.trim(),
      displayName: form.displayName.trim(),
      inquiryDate: form.inquiryDate,
      signedDate: form.signedDate || undefined,
      handoverDate: form.handoverDate || undefined,
      description: form.description.trim() || undefined,
      projectTypes: form.projectTypes,
      assignedPm: '',
      assignedPmName: selectedStaff?.label || '',
      mainPmId: form.mainPmId.trim() || undefined,
      mainPmName: selectedStaff?.label || undefined,
      status: 'initial',
      asanaLink: form.asanaLink.trim() || undefined,
    });
    if (addErr) {
      toast.error(`新增失敗：${addErr.message}`);
      return;
    }
    closeFormModal();
    toast.success('Pitching 已成功新增');
  };

  const handleStatusChange = async (id: string, status: PitchingStatus) => {
    const { error: updateErr } = await updateStatus(id, status);
    if (updateErr) {
      toast.error(`狀態更新失敗：${updateErr.message}`);
      return;
    }
  };

  const handleSaveRecord = async (id: string, data: QuotationClientProjectUpdate) => {
    return updateRecord(id, data);
  };

  const handleConvertToQuote = () => {
    toast.success('已將 Pitching 資料帶入新建報價單');
    navigateTo('quotation', 'new');
  };

  const formModal = (
    <PitchingFormModal
      isOpen={formModalOpen}
      onClose={closeFormModal}
      onSubmit={handleFormSubmit}
      clientOptions={pitchingClientOptions}
      staffOptions={staffOptions}
      defaultMainPmId={systemUser?.staff_id}
      initialRecord={editingRecord}
      onCreateClient={addClient}
    />
  );

  if (detailId) {
    if (loading && !selectedRecord) {
      return <div className="text-center py-12 text-[13px] text-muted-foreground">載入 Pitching 資料中…</div>;
    }
    if (!selectedRecord) {
      return (
        <div className="space-y-4">
          <button
            type="button"
            onClick={closeDetail}
            className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> 返回 Pitching 列表
          </button>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            找不到此 Pitching 紀錄（id: {detailId}）
          </div>
        </div>
      );
    }
    return (
      <>
        <PitchingDetail
          record={selectedRecord}
          clientOptions={pitchingClientOptions}
          onBack={closeDetail}
          onEdit={() => openEditModal(selectedRecord)}
          onConvertToQuote={handleConvertToQuote}
          onSave={handleSaveRecord}
        />
        {formModal}
      </>
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
            onClick={openCreateModal}
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
        <PitchingList
          records={records}
          onView={handleView}
          onEdit={openEditModal}
          onStatusChange={(id, status) => void handleStatusChange(id, status)}
        />
      )}

      {formModal}
    </div>
  );
}
