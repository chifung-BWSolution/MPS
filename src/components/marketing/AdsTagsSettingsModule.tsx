import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAdsTags } from '@/hooks/useAdsTags';
import {
  ADS_TAG_COLOR_OPTIONS,
  adsTagColorClass,
  type AdsTag,
} from '@/types/adsTags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { cn } from '@/lib/utils';

type TagForm = {
  name: string;
  color: string;
  isActive: boolean;
};

const emptyForm = (): TagForm => ({
  name: '',
  color: 'teal',
  isActive: true,
});

export function AdsTagsSettingsModule() {
  const { tags, loading, error, addTag, updateTag, deleteTag } = useAdsTags();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdsTag | null>(null);
  const [form, setForm] = useState<TagForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdsTag | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tags.filter((tag) => !q || tag.name.toLowerCase().includes(q));
  }, [tags, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (tag: AdsTag) => {
    setEditing(tag);
    setForm({
      name: tag.name,
      color: tag.color || 'teal',
      isActive: tag.isActive,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error('請輸入標籤名稱');
      return;
    }
    setSaving(true);
    const result = editing
      ? await updateTag(editing.id, {
          name,
          color: form.color,
          isActive: form.isActive,
        })
      : await addTag({
          name,
          color: form.color,
          isActive: form.isActive,
        });
    setSaving(false);
    if (!result.ok) {
      toast.error(editing ? '更新標籤失敗' : '新增標籤失敗', { description: result.error });
      return;
    }
    toast.success(editing ? '已更新標籤' : '已新增標籤');
    setModalOpen(false);
    setEditing(null);
  };

  const handleToggleActive = async (tag: AdsTag) => {
    const result = await updateTag(tag.id, { isActive: !tag.isActive });
    if (!result.ok) {
      toast.error('更新狀態失敗', { description: result.error });
      return;
    }
    toast.success(tag.isActive ? '已停用標籤' : '已啟用標籤');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteTag(deleteTarget.id);
    if (!result.ok) {
      toast.error('刪除標籤失敗', { description: result.error });
      return;
    }
    toast.success('已刪除標籤');
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-0">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋標籤名稱…"
              className="pl-8 h-9 text-[13px] bg-white"
            />
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} className="mr-1.5" />
            新增標籤
          </Button>
        </div>
        <div className="text-[12px] text-muted-foreground">
          標籤可供 Google Ads / Facebook Ads Campaign 共用。停用後不會出現在新的標籤選單，已套用的仍會保留。
          {error ? <span className="text-red-600 ml-2">{error}</span> : null}
        </div>
      </div>

      <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-muted-foreground">
              <tr>
                <th className="font-medium px-3 py-2.5 text-left">標籤</th>
                <th className="font-medium px-3 py-2.5 text-left">狀態</th>
                <th className="font-medium px-3 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                    載入中…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                    {search.trim() ? '沒有符合的標籤。' : '尚未建立標籤。請按「新增標籤」。'}
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((tag) => (
                  <tr key={tag.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          'inline-flex items-center rounded border px-2 py-0.5 text-[12px] font-medium',
                          adsTagColorClass(tag.color),
                        )}
                      >
                        {tag.name}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={tag.isActive}
                          onCheckedChange={() => void handleToggleActive(tag)}
                        />
                        <span
                          className={cn(
                            'text-[12px]',
                            tag.isActive ? 'text-teal-700' : 'text-amber-700',
                          )}
                        >
                          {tag.isActive ? '啟用' : '停用'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(tag)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-teal-50 hover:text-teal-700"
                          title="編輯"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(tag)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-700"
                          title="刪除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <CrudModal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? '編輯標籤' : '新增標籤'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">
              標籤名稱
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="例如：品牌搜尋、再行銷"
              className="h-9 text-[13px]"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">
              顏色
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ADS_TAG_COLOR_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, color: option.id }))}
                  className={cn(
                    'rounded border px-2 py-1 text-[11px] font-medium',
                    option.className,
                    form.color === option.id ? 'ring-2 ring-teal-500 ring-offset-1' : '',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <div className="text-[13px] font-medium">啟用</div>
              <div className="text-[11px] text-muted-foreground">停用後不會出現在 Campaign 標籤選單</div>
            </div>
            <Switch
              checked={form.isActive}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" disabled={saving} onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? '儲存中…' : '儲存'}
            </Button>
          </div>
        </div>
      </CrudModal>

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
        itemName={deleteTarget?.name || ''}
        canDelete
      />
    </div>
  );
}
