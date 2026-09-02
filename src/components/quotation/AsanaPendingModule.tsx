import { useMemo, useState } from 'react';
import { RefreshCw, Search, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useAsanaSyncedTasks, type AsanaSyncedTask } from '@/hooks/useAsanaSyncedTasks';
import { useQuotationClientProjects } from '@/hooks/useQuotationClientProjects';
import { useQuotationClientList } from '@/hooks/useQuotationClientList';
import { useActiveStaffOptions } from '@/hooks/useActiveStaffOptions';
import {
  toQuotationClientSelectOption,
  type QuotationClientSelectOption,
} from '@/data/quotationClientList';
import {
  pitchingStatusConfig,
  PITCHING_PROJECT_TYPE_OPTIONS,
  formatProjectTypes,
  matchesProjectTypeFilter,
} from '@/data/pitchingData';
import { assignedNameMatchesDisplayName } from '@/lib/mainPmMatch';
import {
  PitchingFormModal,
  type PitchingFormValues,
} from '@/components/quotation/PitchingModule';

function matchClientOption(
  parsedName: string,
  options: QuotationClientSelectOption[],
): QuotationClientSelectOption | undefined {
  const name = parsedName.trim().toLowerCase();
  if (!name) return undefined;
  return options.find((option) => {
    if (option.label.trim().toLowerCase() === name) return true;
    if ((option.companyNameZh || '').trim().toLowerCase() === name) return true;
    if ((option.companyNameEn || '').trim().toLowerCase() === name) return true;
    return (option.keywords || '').toLowerCase().split(/\s+/).includes(name);
  });
}

function formDefaultsFromTask(
  task: AsanaSyncedTask,
  clientOptions: QuotationClientSelectOption[],
  staffOptions: { value: string; label: string }[],
  fallbackPmId: string,
): PitchingFormValues {
  const matched = matchClientOption(task.clientName, clientOptions);
  const matchedPm =
    staffOptions.find((staff) => assignedNameMatchesDisplayName(task.assignedPmName, staff.label))
      ?.value ?? '';
  return {
    clientId: matched?.value ?? '',
    clientName: matched?.label ?? '',
    displayName: task.displayName,
    inquiryDate: task.inquiryDate,
    signedDate: '',
    handoverDate: '',
    description: task.description,
    projectTypes: task.projectTypes,
    mainPmId: matchedPm || fallbackPmId,
    webandsystemListId: '',
    asanaLink: task.asanaLink,
  };
}

export function AsanaPendingModule() {
  const { systemUser } = useAuth();
  const {
    tasks,
    loading,
    syncing,
    error,
    lastSyncedAt,
    syncSources,
    pendingCount,
    importedCount,
    refresh,
    syncNow,
  } = useAsanaSyncedTasks();
  const { addRecord } = useQuotationClientProjects();
  const { records: clientListRecords, addClient } = useQuotationClientList();
  const { options: staffOptions } = useActiveStaffOptions([systemUser?.staff_id]);

  const [importFilter, setImportFilter] = useState<'pending' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [projectTypeFilter, setProjectTypeFilter] = useState('all');
  const [importingTask, setImportingTask] = useState<AsanaSyncedTask | null>(null);

  const clientOptions = useMemo(
    () => clientListRecords.map(toQuotationClientSelectOption),
    [clientListRecords],
  );

  const defaultValues = useMemo(
    () =>
      importingTask
        ? formDefaultsFromTask(
            importingTask,
            clientOptions,
            staffOptions,
            systemUser?.staff_id ?? '',
          )
        : null,
    [importingTask, clientOptions, staffOptions, systemUser?.staff_id],
  );

  const visible = useMemo(() => {
    return tasks.filter((task) => {
      if (importFilter === 'pending' && task.imported) return false;
      if (!matchesProjectTypeFilter(task.projectTypes, projectTypeFilter)) return false;
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        task.displayName.toLowerCase().includes(query) ||
        task.clientName.toLowerCase().includes(query) ||
        task.asanaProjectName.toLowerCase().includes(query) ||
        task.asanaSectionName.toLowerCase().includes(query) ||
        task.assignedPmName.toLowerCase().includes(query) ||
        formatProjectTypes(task.projectTypes).toLowerCase().includes(query)
      );
    });
  }, [tasks, importFilter, projectTypeFilter, searchQuery]);

  const handleSync = async () => {
    try {
      const result = await syncNow();
      if (result.errors?.length) {
        toast.warning(`已同步，但有 ${result.errors.length} 筆錯誤`);
      } else {
        toast.success(`已同步 ${result.records_upserted ?? 0} 筆 Asana 項目`);
      }
    } catch (e) {
      toast.error(`同步失敗：${(e as Error).message}`);
    }
  };

  const handleFormSubmit = async (form: PitchingFormValues) => {
    if (!importingTask) return;
    const selectedStaff = staffOptions.find((s) => s.value === form.mainPmId);
    const { error: addErr } = await addRecord({
      clientId: form.clientId.trim(),
      clientName: form.clientName.trim(),
      displayName: form.displayName.trim(),
      inquiryDate: form.inquiryDate,
      signedDate: form.signedDate || undefined,
      handoverDate: form.handoverDate || undefined,
      description: form.description.trim() || undefined,
      projectTypes: form.projectTypes,
      assignedPm: importingTask.assignedPm,
      assignedPmName: selectedStaff?.label || importingTask.assignedPmName || '',
      mainPmId: form.mainPmId.trim() || undefined,
      mainPmName: selectedStaff?.label || undefined,
      asanaTaskGid: importingTask.asanaTaskGid,
      asanaProjectGid: importingTask.asanaProjectGid || undefined,
      asanaProjectName: importingTask.asanaProjectName || undefined,
      asanaSectionName: importingTask.asanaSectionName || undefined,
      asanaLink: form.asanaLink.trim() || undefined,
      webandsystemListId: form.webandsystemListId.trim() || undefined,
      status: importingTask.mappedStatus,
      pitchingId: `ASANA-${importingTask.asanaTaskGid.slice(-8)}`,
    });
    if (addErr) {
      const duplicate = addErr.code === '23505' || /asana_task_gid|duplicate/i.test(addErr.message);
      toast.error(duplicate ? '此 Asana 項目已匯入' : `新增失敗：${addErr.message}`);
      await refresh();
      return;
    }
    toast.success('已建立報價客戶項目');
    setImportingTask(null);
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Asana 待匯入</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5 max-w-3xl">
            {syncSources.length
              ? `只同步這些 Asana 專案：${syncSources.map((s) => s.projectName).join('、')}。任務依各專案日期規則篩選（目前為建立日 ${syncSources.find((s) => s.syncYearFrom)?.syncYearFrom ?? 2026} 年起）。尚未匯入的項目需透過表單建立報價客戶項目。`
              : '只同步已啟用的 Asana 專案，並依各專案的日期規則篩選任務。尚未匯入的項目需透過表單建立報價客戶項目。'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSync()}
          disabled={syncing}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors duration-200 active:scale-[0.97] disabled:opacity-60"
        >
          <RefreshCw size={14} className={cn(syncing && 'animate-spin')} />
          {syncing ? '同步中…' : '同步 Asana'}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          無法載入 Asana 清單：{error}（請確認已執行 Supabase migration）
        </div>
      )}
      {lastSyncedAt && !error && (
        <p className="text-[12px] text-muted-foreground">
          最後同步：{lastSyncedAt.slice(0, 19).replace('T', ' ')}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">待匯入</span>
          <span className="text-[22px] font-bold block mt-1 text-amber-600">{pendingCount}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">已匯入</span>
          <span className="text-[22px] font-bold block mt-1 text-teal-600">{importedCount}</span>
        </div>
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5">
          <span className="text-[13px] font-medium text-muted-foreground">Asana 總數</span>
          <span className="text-[22px] font-bold block mt-1">{tasks.length}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <input
            type="text"
            placeholder="搜尋名稱、客戶、Asana 專案..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-[13px] border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        <select
          value={importFilter}
          onChange={(e) => setImportFilter(e.target.value as 'pending' | 'all')}
          className="text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          <option value="pending">待匯入</option>
          <option value="all">全部</option>
        </select>
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
      </div>

      {loading ? (
        <div className="text-center py-12 text-[13px] text-muted-foreground">載入 Asana 清單中…</div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    查詢日期
                  </th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    Asana 專案
                  </th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    區塊
                  </th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    顯示名稱
                  </th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    客戶
                  </th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    負責 PM
                  </th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    狀態
                  </th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((task) => {
                  const status = pitchingStatusConfig[task.mappedStatus];
                  return (
                    <tr key={task.asanaTaskGid} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-[13px] text-muted-foreground tabular-nums">{task.inquiryDate}</td>
                      <td className="px-4 py-3 text-[13px] max-w-[180px]">{task.asanaProjectName || '—'}</td>
                      <td className="px-4 py-3 text-[13px] text-muted-foreground">{task.asanaSectionName || '—'}</td>
                      <td className="px-4 py-3 text-[14px] font-medium">{task.displayName}</td>
                      <td className="px-4 py-3 text-[13px]">{task.clientName || '—'}</td>
                      <td className="px-4 py-3 text-[13px]">{task.assignedPmName || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[12px] font-medium px-2 py-1 rounded-sm', status.bgColor, status.color)}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {task.imported ? (
                          <span className="text-[12px] text-muted-foreground">已匯入</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setImportingTask(task)}
                            className="flex items-center gap-1 text-[12px] text-teal-600 font-medium hover:text-teal-700"
                          >
                            <Download size={12} /> 匯入
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                      {importFilter === 'pending' ? '沒有待匯入的 Asana 項目' : '沒有找到符合條件的 Asana 項目'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PitchingFormModal
        isOpen={Boolean(importingTask)}
        onClose={() => setImportingTask(null)}
        onSubmit={handleFormSubmit}
        clientOptions={clientOptions}
        staffOptions={staffOptions}
        defaultMainPmId={systemUser?.staff_id}
        defaultValues={defaultValues}
        defaultsKey={importingTask?.asanaTaskGid}
        createTitle="從 Asana 新增項目"
        onCreateClient={addClient}
      />
    </div>
  );
}
