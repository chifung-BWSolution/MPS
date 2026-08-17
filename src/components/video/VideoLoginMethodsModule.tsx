import { useMemo, useState } from 'react';
import { Eye, EyeOff, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useVideoLoginMethods } from '@/hooks/useVideoLoginMethods';
import {
  VIDEO_LOGIN_METHOD_OPTIONS,
  VIDEO_TWO_FA_OPTIONS,
  normalizeTwoFaMethods,
  videoLoginMethodLabel,
  videoTwoFaLabel,
  type VideoLoginMethod,
  type VideoLoginMethodInput,
  type VideoLoginMethodKind,
  type VideoTwoFaMethod,
} from '@/types/videoLoginMethod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CrudModal, DeleteConfirmModal } from '@/components/ui/crud-modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type LoginMethodForm = {
  loginMethod: VideoLoginMethodKind | '';
  displayName: string;
  accountName: string;
  phoneNumber: string;
  email: string;
  password: string;
  twoFaMethods: VideoTwoFaMethod[];
  note: string;
  isActive: boolean;
};

const emptyForm = (): LoginMethodForm => ({
  loginMethod: '',
  displayName: '',
  accountName: '',
  phoneNumber: '',
  email: '',
  password: '',
  twoFaMethods: [],
  note: '',
  isActive: true,
});

function formFromItem(item: VideoLoginMethod): LoginMethodForm {
  return {
    loginMethod: item.loginMethod,
    displayName: item.displayName,
    accountName: item.accountName,
    phoneNumber: item.phoneNumber,
    email: item.email,
    password: item.password,
    twoFaMethods: item.twoFaMethods,
    note: item.note,
    isActive: item.isActive,
  };
}

function toInput(item: VideoLoginMethod, overrides: Partial<VideoLoginMethodInput> = {}): VideoLoginMethodInput {
  return {
    loginMethod: item.loginMethod,
    displayName: item.displayName,
    accountName: item.accountName,
    phoneNumber: item.phoneNumber,
    email: item.email,
    password: item.password,
    twoFaMethods: item.twoFaMethods,
    note: item.note,
    isActive: item.isActive,
    ...overrides,
  };
}

function maskPassword(password: string) {
  return password ? '••••••••' : '—';
}

export function VideoLoginMethodsModule() {
  const { items, loading, error, addItem, updateItem, deleteItem } = useVideoLoginMethods();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VideoLoginMethod | null>(null);
  const [form, setForm] = useState<LoginMethodForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VideoLoginMethod | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = [
        item.displayName,
        videoLoginMethodLabel(item.loginMethod),
        item.accountName,
        item.phoneNumber,
        item.email,
        item.note,
        item.twoFaMethods.map(videoTwoFaLabel).join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowPassword(false);
    setModalOpen(true);
  };

  const openEdit = (item: VideoLoginMethod) => {
    setEditing(item);
    setForm(formFromItem(item));
    setShowPassword(false);
    setModalOpen(true);
  };

  const toggleTwoFa = (method: VideoTwoFaMethod, checked: boolean) => {
    setForm((prev) => {
      const next = checked
        ? [...prev.twoFaMethods, method]
        : prev.twoFaMethods.filter((value) => value !== method);
      return { ...prev, twoFaMethods: normalizeTwoFaMethods(next) };
    });
  };

  const handleSave = async () => {
    if (!form.loginMethod) {
      toast.error('請選擇登入方式');
      return;
    }
    if (!form.displayName.trim()) {
      toast.error('請輸入顯示名稱');
      return;
    }

    setSaving(true);
    const payload = {
      loginMethod: form.loginMethod,
      displayName: form.displayName,
      accountName: form.accountName,
      phoneNumber: form.phoneNumber,
      email: form.email,
      password: form.password,
      twoFaMethods: form.twoFaMethods,
      note: form.note,
      isActive: form.isActive,
    };
    const result = editing
      ? await updateItem(editing.id, payload)
      : await addItem(payload);
    setSaving(false);

    if (!result.ok) {
      toast.error(editing ? '更新登入方式失敗' : '新增登入方式失敗', { description: result.error });
      return;
    }

    toast.success(editing ? '已更新登入方式' : '已新增登入方式');
    setModalOpen(false);
    setEditing(null);
  };

  const handleToggleActive = async (item: VideoLoginMethod) => {
    const result = await updateItem(item.id, toInput(item, { isActive: !item.isActive }));
    if (!result.ok) {
      toast.error('更新狀態失敗', { description: result.error });
      return;
    }
    toast.success(item.isActive ? '已停用登入方式' : '已啟用登入方式');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteItem(deleteTarget.id);
    if (!result.ok) {
      toast.error('刪除登入方式失敗', { description: result.error });
      return;
    }
    toast.success('已刪除登入方式');
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-0">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">登入方式</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            管理影片製作相關帳號的登入方式、聯絡資料、雙重驗證、備註與啟用狀態。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋顯示名稱、帳號、電郵、電話或備註…"
              className="pl-8 h-9 text-[13px] bg-white"
            />
          </div>
          <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={openCreate}>
            <Plus size={14} className="mr-1.5" />
            新增登入方式
          </Button>
        </div>
        <div className="text-[12px] text-muted-foreground">
          共 {filtered.length} 筆
          {error ? <span className="text-red-600 ml-2">{error}</span> : null}
        </div>
      </div>

      <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[1020px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-muted-foreground">
              <tr>
                <th className="font-medium px-3 py-2.5 text-left">顯示名稱</th>
                <th className="font-medium px-3 py-2.5 text-left">登入方式</th>
                <th className="font-medium px-3 py-2.5 text-left">帳號名稱</th>
                <th className="font-medium px-3 py-2.5 text-left">電話號碼</th>
                <th className="font-medium px-3 py-2.5 text-left">電郵</th>
                <th className="font-medium px-3 py-2.5 text-left">密碼</th>
                <th className="font-medium px-3 py-2.5 text-left">雙重驗證</th>
                <th className="font-medium px-3 py-2.5 text-left">備註</th>
                <th className="font-medium px-3 py-2.5 text-left">狀態</th>
                <th className="font-medium px-3 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                    載入中…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                    {search.trim() ? '沒有符合的登入方式。' : '尚未建立登入方式。請按「新增登入方式」。'}
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={cn(
                      'border-b border-slate-100 hover:bg-slate-50/80',
                      !item.isActive && 'opacity-60',
                    )}
                  >
                    <td className="px-3 py-2.5 font-medium">{item.displayName}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[12px] font-medium text-teal-700">
                        {videoLoginMethodLabel(item.loginMethod)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">{item.accountName || '—'}</td>
                    <td className="px-3 py-2.5">{item.phoneNumber || '—'}</td>
                    <td className="px-3 py-2.5">{item.email || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{maskPassword(item.password)}</td>
                    <td className="px-3 py-2.5">
                      {item.twoFaMethods.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {item.twoFaMethods.map((method) => (
                            <span
                              key={method}
                              className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-700"
                            >
                              {videoTwoFaLabel(method)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-[220px]">
                      {item.note ? (
                        <span className="block truncate text-muted-foreground" title={item.note}>
                          {item.note}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={item.isActive}
                          onCheckedChange={() => void handleToggleActive(item)}
                        />
                        <span
                          className={cn(
                            'text-[12px]',
                            item.isActive ? 'text-teal-700' : 'text-amber-700',
                          )}
                        >
                          {item.isActive ? '啟用' : '停用'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-teal-50 hover:text-teal-700"
                          title="編輯"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
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
        title={editing ? '編輯登入方式' : '新增登入方式'}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">
              登入方式 *
            </label>
            <Select
              value={form.loginMethod || undefined}
              onValueChange={(value: VideoLoginMethodKind) =>
                setForm((prev) => ({ ...prev, loginMethod: value }))
              }
            >
              <SelectTrigger className="h-9 text-[13px]">
                <SelectValue placeholder="選擇登入方式" />
              </SelectTrigger>
              <SelectContent>
                {VIDEO_LOGIN_METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">
              顯示名稱 *
            </label>
            <Input
              value={form.displayName}
              onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
              placeholder="在本系統顯示的名稱"
              className="h-9 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">
              帳號名稱
            </label>
            <Input
              value={form.accountName}
              onChange={(e) => setForm((prev) => ({ ...prev, accountName: e.target.value }))}
              placeholder="帳號 / 用戶名稱 / 用戶 ID"
              className="h-9 text-[13px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">
                電話號碼
              </label>
              <Input
                value={form.phoneNumber}
                onChange={(e) => setForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                placeholder="例如 +852 9123 4567"
                className="h-9 text-[13px]"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">
                電郵
              </label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="name@example.com"
                className="h-9 text-[13px]"
              />
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">
              密碼
            </label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                className="h-9 text-[13px] pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title={showPassword ? '隱藏密碼' : '顯示密碼'}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-2">
              雙重驗證方式（可多選）
            </label>
            <div className="grid grid-cols-2 gap-2">
              {VIDEO_TWO_FA_OPTIONS.map((option) => {
                const checked = form.twoFaMethods.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] cursor-pointer',
                      checked ? 'border-teal-200 bg-teal-50' : 'border-border hover:bg-muted/30',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => toggleTwoFa(option.id, value === true)}
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">
              備註
            </label>
            <Textarea
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="補充說明、注意事項…"
              className="min-h-[72px] text-[13px]"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <div className="text-[13px] font-medium">啟用</div>
              <div className="text-[11px] text-muted-foreground">停用後此登入方式會標示為停用</div>
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
        itemName={deleteTarget?.displayName || ''}
        canDelete
      />
    </div>
  );
}
