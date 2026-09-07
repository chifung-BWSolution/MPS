import { useMemo, useState } from 'react';
import { ExternalLink, FileText, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useQuotationDocs } from '@/hooks/useQuotationDocs';
import { useQuotationDocTypes } from '@/hooks/useQuotationDocTypes';
import {
  QUOTATION_DOC_MAX_SIZE_MB,
  formatDocDate,
  formatFileSize,
  isImageDoc,
  quotationDocExpiryStatus,
  validateQuotationDocDates,
  type QuotationDoc,
} from '@/lib/quotationDocs';
import { CrudModal, CrudModalFooter, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';

type Draft = {
  docTypeId: string;
  documentDate: string;
  expiryDate: string;
  file: File | null;
};

const emptyDraft = (): Draft => ({
  docTypeId: '',
  documentDate: '',
  expiryDate: '',
  file: null,
});

function expiryBadge(status: ReturnType<typeof quotationDocExpiryStatus>) {
  if (status === 'expired') return { label: '已過期', className: 'bg-rose-50 text-rose-700' };
  if (status === 'expiring') return { label: '即將到期', className: 'bg-amber-50 text-amber-800' };
  return null;
}

export function PitchingDocsTab({ projectId }: { projectId: string }) {
  const { rows, loading, error, addDoc, updateDoc, deleteDoc } = useQuotationDocs(projectId);
  const { types } = useQuotationDocTypes();
  const [typeFilter, setTypeFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QuotationDoc | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<QuotationDoc | null>(null);

  const typeById = useMemo(() => new Map(types.map((type) => [type.id, type])), [types]);

  const dialogTypes = useMemo(() => {
    const active = types.filter((type) => type.isActive);
    if (draft.docTypeId && !active.some((type) => type.id === draft.docTypeId)) {
      const current = typeById.get(draft.docTypeId);
      if (current) return [current, ...active];
    }
    return active;
  }, [draft.docTypeId, typeById, types]);

  const typeOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { id: string; display: string }[] = [];
    for (const row of rows) {
      if (!row.docTypeId || seen.has(row.docTypeId)) continue;
      seen.add(row.docTypeId);
      options.push({
        id: row.docTypeId,
        display: typeById.get(row.docTypeId)?.display || row.docTypeDisplay || '—',
      });
    }
    return options;
  }, [rows, typeById]);

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return rows;
    return rows.filter((row) => row.docTypeId === typeFilter);
  }, [rows, typeFilter]);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setModalOpen(true);
  };

  const openEdit = (row: QuotationDoc) => {
    setEditing(row);
    setDraft({
      docTypeId: row.docTypeId,
      documentDate: row.documentDate ?? '',
      expiryDate: row.expiryDate ?? '',
      file: null,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setDraft(emptyDraft());
  };

  const handleSave = async () => {
    const docTypeId = draft.docTypeId.trim();
    if (!docTypeId) {
      toast.error('請選擇文件類型');
      return;
    }
    if (!editing && !draft.file) {
      toast.error('請選擇檔案');
      return;
    }
    const dateError = validateQuotationDocDates(draft.documentDate, draft.expiryDate);
    if (dateError) {
      toast.error(dateError);
      return;
    }

    setSaving(true);
    if (editing) {
      const { error: saveErr } = await updateDoc(editing.id, {
        docTypeId,
        documentDate: draft.documentDate,
        expiryDate: draft.expiryDate,
        file: draft.file ?? undefined,
      });
      setSaving(false);
      if (saveErr) {
        toast.error(`更新失敗：${saveErr.message}`);
        return;
      }
      toast.success('已更新文件');
    } else if (draft.file) {
      const { error: addErr } = await addDoc({
        docTypeId,
        fileName: draft.file.name,
        fileUrl: '',
        storagePath: '',
        documentDate: draft.documentDate,
        expiryDate: draft.expiryDate,
        file: draft.file,
      });
      setSaving(false);
      if (addErr) {
        toast.error(`新增失敗：${addErr.message}`);
        return;
      }
      toast.success('已上傳文件');
    }
    closeModal();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error: delErr } = await deleteDoc(deleting.id);
    if (delErr) {
      toast.error(`刪除失敗：${delErr.message}`);
      return;
    }
    toast.success('已刪除文件');
    setDeleting(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="篩選文件類型"
            className="text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="all">全部類型</option>
            {typeOptions.map((type) => (
              <option key={type.id} value={type.id}>
                {type.display}
              </option>
            ))}
          </select>
          <span className="text-[12px] text-muted-foreground">共 {filtered.length} 份</span>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white rounded-md text-[13px] font-medium hover:bg-teal-700 transition-colors active:scale-[0.97]"
        >
          <Plus size={14} /> 新增文件
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          無法載入項目文件：{error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-10 text-center text-[13px] text-muted-foreground">
          載入項目文件中…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-8 text-center">
          <FolderOpen size={24} className="mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-[13px] text-muted-foreground">尚未上傳項目文件</p>
          <p className="text-[12px] text-muted-foreground/70 mt-1">可上傳報價單、項目合約、參考圖片或其他檔案</p>
        </div>
      ) : (
        <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">類型</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">檔案</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">文件日期</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">到期日</th>
                  <th className="text-left text-[12px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const status = quotationDocExpiryStatus(row.expiryDate);
                  const badge = expiryBadge(status);
                  return (
                    <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-3 text-[13px] font-medium whitespace-nowrap">
                        {typeById.get(row.docTypeId)?.display || row.docTypeDisplay || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {isImageDoc(row.mimeType, row.fileName) ? (
                            <img
                              src={row.fileUrl}
                              alt=""
                              className="h-9 w-9 rounded object-cover border border-border/60 bg-muted shrink-0"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                              <FileText size={14} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <a
                              href={row.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[13px] font-medium text-teal-700 hover:text-teal-800 truncate block"
                            >
                              {row.fileName}
                            </a>
                            <p className="text-[11px] text-muted-foreground">{formatFileSize(row.fileSize)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px] tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatDocDate(row.documentDate)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] tabular-nums">{formatDocDate(row.expiryDate)}</span>
                          {badge && (
                            <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded', badge.className)}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <a
                            href={row.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            aria-label={`開啟 ${row.fileName}`}
                          >
                            <ExternalLink size={13} />
                          </a>
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            aria-label={`編輯 ${row.fileName}`}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(row)}
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600 transition-colors"
                            aria-label={`刪除 ${row.fileName}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CrudModal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editing ? '編輯項目文件' : '新增項目文件'}
        size="md"
        footer={
          <CrudModalFooter className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 text-[13px] font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-4 py-2 text-[13px] font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? '儲存中…' : '儲存'}
            </button>
          </CrudModalFooter>
        }
      >
        <div className="space-y-4">
          <div>
            <span className="text-[12px] text-muted-foreground block mb-1">文件類型 *</span>
            {dialogTypes.length === 0 ? (
              <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                尚未設定可用的文件類型。請到項目管理 → 設置 → 文件類型新增。
              </p>
            ) : (
              <select
                value={draft.docTypeId}
                onChange={(e) => setDraft((prev) => ({ ...prev, docTypeId: e.target.value }))}
                aria-label="文件類型"
                className="w-full text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">請選擇文件類型</option>
                {dialogTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.display}{type.isActive ? '' : '（已停用）'}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <span className="text-[12px] text-muted-foreground block mb-1">
              {editing ? '更換檔案（選填）' : '檔案 *'}
            </span>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
              onChange={(e) => setDraft((prev) => ({ ...prev, file: e.target.files?.[0] ?? null }))}
              className="text-[13px]"
              aria-label="選擇檔案"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {draft.file
                ? `${draft.file.name}（${formatFileSize(draft.file.size)}）`
                : editing
                  ? `目前：${editing.fileName}`
                  : `支援 PDF、圖片、Office、ZIP，上限 ${QUOTATION_DOC_MAX_SIZE_MB}MB`}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">文件日期</span>
              <Input
                type="date"
                value={draft.documentDate}
                onChange={(e) => setDraft((prev) => ({ ...prev, documentDate: e.target.value }))}
                className="text-[13px]"
                aria-label="文件日期"
              />
            </div>
            <div>
              <span className="text-[12px] text-muted-foreground block mb-1">到期日</span>
              <Input
                type="date"
                value={draft.expiryDate}
                onChange={(e) => setDraft((prev) => ({ ...prev, expiryDate: e.target.value }))}
                className="text-[13px]"
                aria-label="到期日"
              />
            </div>
          </div>
        </div>
      </CrudModal>

      <DeleteConfirmModal
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
        itemName={deleting?.fileName || '文件'}
        canDelete
        description={`確定要刪除「${deleting?.fileName || ''}」嗎？檔案會一併從儲存空間移除。`}
      />
    </div>
  );
}
