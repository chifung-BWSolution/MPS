import { useMemo, useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useQuotationProjectTypes } from '@/hooks/useQuotationProjectTypes';
import {
  QUOTATION_PROJECT_TYPE_SECTION_LABELS,
  QUOTATION_PROJECT_TYPE_SECTIONS,
  slugifyProjectTypeCode,
  type QuotationProjectType,
  type QuotationProjectTypeSection,
} from '@/lib/quotationProjectTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { CrudModal } from '@/components/ui/crud-modal';
import { cn } from '@/lib/utils';

type TypeForm = {
  code: string;
  display: string;
  codeInitial: string;
  section: QuotationProjectTypeSection;
  isActive: boolean;
};

const emptyForm = (): TypeForm => ({
  code: '',
  display: '',
  codeInitial: '',
  section: 'quotation',
  isActive: true,
});

export function QuotationProjectTypesSettings() {
  const { types, loading, error, addType, updateType } = useQuotationProjectTypes();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QuotationProjectType | null>(null);
  const [form, setForm] = useState<TypeForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return types.filter((type) =>
      !q
      || type.display.toLowerCase().includes(q)
      || type.code.toLowerCase().includes(q)
      || type.codeInitial.toLowerCase().includes(q)
      || QUOTATION_PROJECT_TYPE_SECTION_LABELS[type.section].toLowerCase().includes(q),
    );
  }, [types, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (type: QuotationProjectType) => {
    setEditing(type);
    setForm({
      code: type.code,
      display: type.display,
      codeInitial: type.codeInitial,
      section: type.section,
      isActive: type.isActive,
    });
    setModalOpen(true);
  };

  const handleDisplayChange = (display: string) => {
    setForm((prev) => ({
      ...prev,
      display,
      code: editing ? prev.code : slugifyProjectTypeCode(display) || prev.code,
    }));
  };

  const handleSave = async () => {
    const display = form.display.trim();
    if (!display) {
      toast.error('請輸入顯示名稱');
      return;
    }
    setSaving(true);
    const result = editing
      ? await updateType(editing.id, {
          display,
          code: form.code,
          codeInitial: form.codeInitial,
          section: form.section,
          isActive: form.isActive,
        })
      : await addType({
          code: form.code,
          display,
          codeInitial: form.codeInitial,
          section: form.section,
          isActive: form.isActive,
        });
    setSaving(false);
    if (!result.ok) {
      toast.error(editing ? '更新類型失敗' : '新增類型失敗', { description: result.error });
      return;
    }
    toast.success(editing ? '已更新項目類型' : '已新增項目類型');
    setModalOpen(false);
    setEditing(null);
  };

  const handleToggleActive = async (type: QuotationProjectType) => {
    const result = await updateType(type.id, { isActive: !type.isActive });
    if (!result.ok) {
      toast.error('更新狀態失敗', { description: result.error });
      return;
    }
    toast.success(type.isActive ? '已停用類型' : '已啟用類型');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋顯示名稱、識別碼或前綴…"
            className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
          />
        </div>
        <Button size="sm" className="ml-auto bg-teal-600 hover:bg-teal-700 text-white" onClick={openCreate}>
          <Plus size={14} className="mr-1.5" />
          新增類型
        </Button>
      </div>
      {error ? <p className="text-[12px] text-red-600">{error}</p> : null}

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">顯示名稱</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">識別碼</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">代碼前綴</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">所屬模組</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">狀態</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  載入中…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {search.trim() ? '沒有符合的項目類型' : '尚未建立項目類型。請按「新增類型」。'}
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((type) => (
                <tr key={type.id} className="border-t border-border/50 hover:bg-muted/10 transition-colors duration-200">
                  <td className="px-4 py-3 font-medium">{type.display}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-[12px]">{type.code}</td>
                  <td className="px-4 py-3 font-mono text-[12px]">{type.codeInitial}</td>
                  <td className="px-4 py-3">{QUOTATION_PROJECT_TYPE_SECTION_LABELS[type.section]}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={type.isActive}
                        onCheckedChange={() => void handleToggleActive(type)}
                      />
                      <span className={cn('text-[12px]', type.isActive ? 'text-teal-700' : 'text-amber-700')}>
                        {type.isActive ? '啟用' : '停用'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(type)}
                        className="p-1 hover:bg-muted rounded transition-colors"
                        title="編輯"
                      >
                        <Pencil size={12} className="text-teal-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <CrudModal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? '編輯項目類型' : '新增項目類型'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">顯示名稱 *</label>
            <Input
              value={form.display}
              onChange={(e) => handleDisplayChange(e.target.value)}
              placeholder="例如 BWT-網頁"
              className="h-9 text-[13px]"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">識別碼 *</label>
            <Input
              value={form.code}
              onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
              placeholder="例如 bwt_web"
              className="h-9 text-[13px] font-mono"
              disabled={!!editing}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              系統識別碼（Asana 對應用），建立後不可更改。
            </p>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">代碼前綴 *</label>
            <Input
              value={form.codeInitial}
              onChange={(e) => setForm((prev) => ({ ...prev, codeInitial: e.target.value }))}
              placeholder="例如 BWT-W"
              className="h-9 text-[13px] font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              用於產生 Pitching 編號，例如 BWT-W26-001。
            </p>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">所屬模組 *</label>
            <select
              value={form.section}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, section: e.target.value as QuotationProjectTypeSection }))
              }
              className="w-full h-9 px-3 border border-border rounded-md text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
            >
              {QUOTATION_PROJECT_TYPE_SECTIONS.map((section) => (
                <option key={section} value={section}>
                  {QUOTATION_PROJECT_TYPE_SECTION_LABELS[section]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <div className="text-[13px] font-medium">狀態</div>
              <div className="text-[11px] text-muted-foreground">
                {form.isActive ? '啟用中，可在項目選用' : '已停用，不會出現在新的選單'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('text-[12px] font-medium', form.isActive ? 'text-teal-700' : 'text-amber-700')}>
                {form.isActive ? '啟用' : '停用'}
              </span>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" disabled={saving} onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              disabled={saving || !form.display.trim() || !form.code.trim() || !form.codeInitial.trim()}
              onClick={() => void handleSave()}
            >
              {saving ? '儲存中…' : '儲存'}
            </Button>
          </div>
        </div>
      </CrudModal>
    </div>
  );
}
