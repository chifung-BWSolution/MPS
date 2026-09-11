import { CrudModal, CrudModalFooter } from '@/components/ui/crud-modal';
import { Input } from '@/components/ui/input';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';
import {
  QUOTATION_DOC_MAX_SIZE_MB,
  formatFileSize,
  type QuotationDoc,
  type QuotationDocType,
} from '@/lib/quotationDocs';

export type QuotationDocFormDraft = {
  projectId: string;
  docTypeId: string;
  documentDate: string;
  expiryDate: string;
  file: File | null;
};

export function emptyQuotationDocFormDraft(): QuotationDocFormDraft {
  return {
    projectId: '',
    docTypeId: '',
    documentDate: '',
    expiryDate: '',
    file: null,
  };
}

export function QuotationDocFormDialog({
  isOpen,
  onClose,
  editing,
  draft,
  onDraftChange,
  types,
  saving,
  onSave,
  projectSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  editing: QuotationDoc | null;
  draft: QuotationDocFormDraft;
  onDraftChange: (next: QuotationDocFormDraft) => void;
  types: QuotationDocType[];
  saving: boolean;
  onSave: () => void;
  projectSelect?: {
    options: SearchableSelectOption[];
    disabled?: boolean;
  };
}) {
  return (
    <CrudModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? '編輯項目文件' : '新增項目文件'}
      size="md"
      footer={
        <CrudModalFooter className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-muted-foreground bg-secondary rounded-md hover:bg-secondary/80"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 text-[13px] font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? '儲存中…' : '儲存'}
          </button>
        </CrudModalFooter>
      }
    >
      <div className="space-y-4">
        {projectSelect && (
          <div>
            <span className="text-[12px] text-muted-foreground block mb-1">客戶項目 *</span>
            <SearchableSelect
              value={draft.projectId}
              onValueChange={(projectId) => onDraftChange({ ...draft, projectId })}
              options={projectSelect.options}
              placeholder="請選擇客戶項目"
              searchPlaceholder="搜尋項目或客戶..."
              emptyText="找不到客戶項目"
              disabled={projectSelect.disabled}
            />
          </div>
        )}
        <div>
          <span className="text-[12px] text-muted-foreground block mb-1">文件類型 *</span>
          {types.length === 0 ? (
            <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              尚未設定可用的文件類型。請到市場項目管理或系統開發管理 → 設置 → 文件類型新增。
            </p>
          ) : (
            <select
              value={draft.docTypeId}
              onChange={(e) => onDraftChange({ ...draft, docTypeId: e.target.value })}
              aria-label="文件類型"
              className="w-full text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="">請選擇文件類型</option>
              {types.map((type) => (
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
            onChange={(e) => onDraftChange({ ...draft, file: e.target.files?.[0] ?? null })}
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
              onChange={(e) => onDraftChange({ ...draft, documentDate: e.target.value })}
              className="text-[13px]"
              aria-label="文件日期"
            />
          </div>
          <div>
            <span className="text-[12px] text-muted-foreground block mb-1">到期日</span>
            <Input
              type="date"
              value={draft.expiryDate}
              onChange={(e) => onDraftChange({ ...draft, expiryDate: e.target.value })}
              className="text-[13px]"
              aria-label="到期日"
            />
          </div>
        </div>
      </div>
    </CrudModal>
  );
}
