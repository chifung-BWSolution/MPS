import { useState, useMemo } from 'react';
import { Search, ChevronRight, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { useQuotationClientProjects, type QuotationClientProjectUpdate } from '@/hooks/useQuotationClientProjects';
import { useQuotationClientList } from '@/hooks/useQuotationClientList';
import {
  PitchingDetail,
  PitchingFormModal,
  pitchingFormToUpdate,
  RemainingDaysCell,
  PitchingStatusSelect,
  type PitchingFormValues,
} from '@/components/quotation/PitchingModule';
import {
  pitchingStatusConfig,
  formatProjectTypes,
  matchesProjectTypeFilter,
  PITCHING_PROJECT_TYPE_OPTIONS,
  isProjectPageRecord,
  type PitchingRecord,
  type PitchingStatus,
} from '@/data/pitchingData';

function ProjectList({
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
          p.assignedPmName.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [records, searchQuery, projectTypeFilter, statusFilter]);

  const totalCount = records.length;
  const confirmedCount = records.filter((p) => p.status === 'confirmed').length;
  const closedCount = records.filter((p) => p.status === 'closed').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">Project 總數</span>
          <span className="text-[22px] font-bold block mt-1">{totalCount}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">確認項目</span>
          <span className="text-[22px] font-bold block mt-1 text-teal-600">{confirmedCount}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">已成交開工</span>
          <span className="text-[22px] font-bold block mt-1 text-emerald-600">{confirmedCount}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">已結案</span>
          <span className="text-[22px] font-bold block mt-1 text-slate-600">{closedCount}</span>
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
          <option value="confirmed">確認項目</option>
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
                    <td className="px-4 py-3 text-[13px]">{record.assignedPmName || '—'}</td>
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
                    沒有找到符合條件的 Project 紀錄
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

export function ProjectModule() {
  const { navigateTo } = useApp();
  const { records, loading, error, lastSyncedAt, updateStatus, updateRecord } = useQuotationClientProjects();
  const { records: clientListRecords } = useQuotationClientList();
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedRecord, setSelectedRecord] = useState<PitchingRecord | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PitchingRecord | null>(null);

  const projectRecords = useMemo(
    () => records.filter(isProjectPageRecord),
    [records],
  );

  const pitchingClientOptions = useMemo(
    () =>
      clientListRecords.map((c) => ({
        value: c.id,
        label: c.companyNameZh,
        keywords: [c.companyNameZh, c.companyNameEn, c.contactPerson, c.brandName].filter(Boolean).join(' '),
      })),
    [clientListRecords],
  );

  const handleView = (record: PitchingRecord) => {
    setSelectedRecord(record);
    setView('detail');
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
    if (!editingRecord) return;
    const payload = pitchingFormToUpdate(form);
    const { error: saveErr } = await updateRecord(editingRecord.id, payload);
    if (saveErr) {
      toast.error(`儲存失敗：${saveErr.message}`);
      return;
    }
    if (selectedRecord?.id === editingRecord.id) {
      setSelectedRecord((prev) =>
        prev ? { ...prev, ...payload, updatedAt: new Date().toISOString() } : null,
      );
    }
    closeFormModal();
    toast.success('Project 已更新');
  };

  const handleStatusChange = async (id: string, status: PitchingStatus) => {
    const { error: updateErr } = await updateStatus(id, status);
    if (updateErr) {
      toast.error(`狀態更新失敗：${updateErr.message}`);
      return;
    }
    if (selectedRecord?.id === id) {
      setSelectedRecord((prev) => (prev ? { ...prev, status } : null));
    }
  };

  const handleSaveRecord = async (id: string, data: QuotationClientProjectUpdate) => {
    const { error: saveErr } = await updateRecord(id, data);
    if (!saveErr && selectedRecord?.id === id) {
      setSelectedRecord((prev) => (prev ? { ...prev, ...data, updatedAt: new Date().toISOString() } : null));
    }
    return { error: saveErr };
  };

  const handleConvertToQuote = () => {
    toast.success('已將 Project 資料帶入新建報價單');
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
        onSave={handleSaveRecord}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold">Project</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            顯示 Pitching 中狀態為「確認項目」的專案（與 Pitching 共用 quotation_client_project 資料表）。
          </p>
          {lastSyncedAt && (
            <p className="text-[11px] text-muted-foreground mt-1">
              最後更新：{new Date(lastSyncedAt).toLocaleString('zh-HK', { hour12: false })}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          載入失敗：{error}
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-muted-foreground py-12 text-center">載入中…</div>
      ) : (
        <ProjectList
          records={projectRecords}
          onView={handleView}
          onEdit={openEditModal}
          onStatusChange={(id, status) => void handleStatusChange(id, status)}
        />
      )}

      <PitchingFormModal
        isOpen={formModalOpen}
        onClose={closeFormModal}
        onSubmit={handleFormSubmit}
        clientOptions={pitchingClientOptions}
        initialRecord={editingRecord}
      />
    </div>
  );
}
