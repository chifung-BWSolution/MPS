import { useState, useMemo, useEffect } from 'react';
import { Search, ChevronRight, Pencil, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useQuotationClientProjects, type QuotationClientProjectUpdate } from '@/hooks/useQuotationClientProjects';
import { useQuotationClientList } from '@/hooks/useQuotationClientList';
import { useActiveStaffOptions } from '@/hooks/useActiveStaffOptions';
import { toQuotationClientSelectOption } from '@/data/quotationClientList';
import { useQuotationClientDetailId } from '@/hooks/useQuotationClientDetailId';
import { openQuotationProjectDetail, quotationProjectSubModule, readQuotationClientPage } from '@/lib/quotationProjectNavigation';
import {
  PitchingDetail,
  PitchingFormModal,
  pitchingFormToUpdate,
  RemainingDaysCell,
  PitchingStatusBadge,
  type PitchingFormValues,
} from '@/components/quotation/PitchingModule';
import {
  formatProjectTypes,
  formatMainPmName,
  formatRelatedClientName,
  matchesProjectTypeFilter,
  PITCHING_PROJECT_TYPE_OPTIONS,
  isProjectPageRecord,
  type PitchingRecord,
} from '@/data/pitchingData';
import {
  QuotationClientProjectTableHeaders,
  QuotationListMoneyCells,
  useQuotationListSort,
} from '@/components/quotation/QuotationListSortHeader';
import { useQuotationProjectActuals } from '@/hooks/useQuotationProjectActuals';
import { projectActualsFor, QUOTATION_LIST_COLUMN_COUNT } from '@/lib/quotationListMoney';

function ProjectList({
  records,
  onView,
  onEdit,
}: {
  records: PitchingRecord[];
  onView: (record: PitchingRecord) => void;
  onEdit: (record: PitchingRecord) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [projectTypeFilter, setProjectTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { actuals, loading: actualsLoading, error: actualsError } = useQuotationProjectActuals();

  const withMoney = useMemo(
    () =>
      records.map((record) => {
        if (actualsLoading || actualsError) {
          return { ...record, income: null, expense: null, gp: null };
        }
        return { ...record, ...projectActualsFor(record.id, actuals) };
      }),
    [records, actuals, actualsLoading, actualsError],
  );

  const filtered = useMemo(() => {
    return withMoney.filter((p) => {
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
  }, [withMoney, searchQuery, projectTypeFilter, statusFilter]);
  const { sorted, sortKey, sortDir, onSort } = useQuotationListSort(filtered);

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
              <QuotationClientProjectTableHeaders
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                moneyColumns="actual"
                remainingDaysLabel="項目進度"
              />
            </thead>
            <tbody>
              {sorted.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => onView(record)}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-[13px] text-muted-foreground tabular-nums">{record.inquiryDate}</td>
                    <td className="px-4 py-3 text-[13px]">
                      <RemainingDaysCell
                        inquiryDate={record.inquiryDate}
                        status={record.status}
                        signedDate={record.signedDate}
                        handoverDate={record.handoverDate}
                      />
                    </td>
                    <td className="px-4 py-3 text-[13px] max-w-[180px]">{formatProjectTypes(record.projectTypes)}</td>
                    <td className="px-4 py-3 text-[14px] font-medium">{record.displayName}</td>
                    <td className="px-4 py-3 text-[13px]">{formatRelatedClientName(record)}</td>
                    <td className="px-4 py-3 text-[13px]">{formatMainPmName(record)}</td>
                    <QuotationListMoneyCells
                      income={record.income}
                      expense={record.expense}
                      gp={record.gp}
                    />
                    <td className="px-4 py-3">
                      <PitchingStatusBadge status={record.status} />
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
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={QUOTATION_LIST_COLUMN_COUNT} className="px-4 py-8 text-center text-[13px] text-muted-foreground">
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
  const { records, loading, error, lastSyncedAt, refresh, updateRecord } = useQuotationClientProjects();
  const { records: clientListRecords, addClient } = useQuotationClientList();
  const { detailId, openDetail, closeDetail } = useQuotationClientDetailId('projects');
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

  const projectRecords = useMemo(
    () => records.filter(isProjectPageRecord),
    [records],
  );

  const pitchingClientOptions = useMemo(
    () => clientListRecords.map(toQuotationClientSelectOption),
    [clientListRecords],
  );

  useEffect(() => {
    if (!selectedRecord) return;
    if (readQuotationClientPage() === quotationProjectSubModule(selectedRecord.status)) return;
    openQuotationProjectDetail(selectedRecord.id, selectedRecord.status);
  }, [selectedRecord]);

  const handleView = (record: PitchingRecord) => {
    openQuotationProjectDetail(record.id, record.status);
    if (record.status === 'confirmed') openDetail(record.id);
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
    const selectedStaff = staffOptions.find((s) => s.value === form.mainPmId);
    const payload = {
      ...pitchingFormToUpdate(form),
      assignedPmName: selectedStaff?.label || '',
      mainPmName: selectedStaff?.label || undefined,
    };
    const { error: saveErr } = await updateRecord(editingRecord.id, payload);
    if (saveErr) {
      toast.error(`儲存失敗：${saveErr.message}`);
      return;
    }
    closeFormModal();
    toast.success('Project 已更新');
  };

  const handleSaveRecord = async (id: string, data: QuotationClientProjectUpdate) => {
    const result = await updateRecord(id, data);
    if (!result.error) {
      await refresh();
    }
    return result;
  };

  const formModal = (
    <PitchingFormModal
      isOpen={formModalOpen}
      onClose={closeFormModal}
      onSubmit={handleFormSubmit}
      clientOptions={pitchingClientOptions}
      staffOptions={staffOptions}
      initialRecord={editingRecord}
      onCreateClient={addClient}
    />
  );

  if (detailId) {
    if (loading && !selectedRecord) {
      return <div className="text-[13px] text-muted-foreground py-12 text-center">載入中…</div>;
    }
    if (!selectedRecord) {
      return (
        <div className="space-y-4">
          <button
            type="button"
            onClick={closeDetail}
            className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> 返回 Project 列表
          </button>
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
            找不到此 Project 紀錄（id: {detailId}）
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
          onSave={handleSaveRecord}
        />
        {formModal}
      </>
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
        />
      )}

      {formModal}
    </div>
  );
}
