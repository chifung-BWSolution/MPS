import { useMemo, useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useVideoLoginMethods } from '@/hooks/useVideoLoginMethods';
import {
  VIDEO_LOGIN_METHOD_OPTIONS,
  videoLoginMethodLabel,
  videoTwoFaLabel,
  type VideoLoginMethod,
  type VideoLoginMethodInput,
} from '@/types/videoLoginMethod';
import {
  emptyLoginMethodForm,
  loginMethodFormFromItem,
  loginMethodFormToInput,
  type LoginMethodForm,
} from '@/lib/videoLoginMethodForm';
import { filterVideoLoginMethods, loginMethodListMetrics } from '@/lib/videoLoginMethodList';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { CrudModal } from '@/components/ui/crud-modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { VideoLoginMethodFormFields } from './VideoLoginMethodFormFields';

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
  const { items, loading, error, addItem, updateItem } = useVideoLoginMethods();
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VideoLoginMethod | null>(null);
  const [form, setForm] = useState<LoginMethodForm>(emptyLoginMethodForm());
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loginMethodMetrics = useMemo(() => loginMethodListMetrics(items), [items]);
  const filtered = useMemo(
    () => filterVideoLoginMethods(items, { search, methodFilter, statusFilter }),
    [items, search, methodFilter, statusFilter],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyLoginMethodForm());
    setShowPassword(false);
    setModalOpen(true);
  };

  const openEdit = (item: VideoLoginMethod) => {
    setEditing(item);
    setForm(loginMethodFormFromItem(item));
    setShowPassword(false);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const payload = loginMethodFormToInput(form);
    if (!payload) {
      toast.error(!form.loginMethod ? '請選擇登入方式' : '請輸入顯示名稱');
      return;
    }

    setSaving(true);
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

  return (
    <div className="space-y-0">
      <div className="sticky top-[calc(48px+var(--app-banner-h))] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">登入方式</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            管理影片製作相關帳號的登入方式、聯絡資料與雙重驗證。
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">登入方式總數</span>
            <p className="text-[18px] font-bold">{loginMethodMetrics.total}</p>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">啟用</span>
            <p className="text-[18px] font-bold text-teal-600">{loginMethodMetrics.active}</p>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">雙重驗證</span>
            <p className="text-[18px] font-bold">{loginMethodMetrics.twoFa}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋名稱、帳號、電郵或電話..."
              className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
            />
          </div>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-[140px] h-9 text-[12px]"><SelectValue placeholder="登入方式" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部登入方式</SelectItem>
              {VIDEO_LOGIN_METHOD_OPTIONS.map(option => (
                <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] h-9 text-[12px]"><SelectValue placeholder="狀態" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部狀態</SelectItem>
              <SelectItem value="active">啟用</SelectItem>
              <SelectItem value="inactive">停用</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="ml-auto bg-teal-600 hover:bg-teal-700 text-white" onClick={openCreate}>
            <Plus size={14} className="mr-1.5" />
            新增登入方式
          </Button>
        </div>
        {error ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            無法載入 Supabase 資料：{error}
          </div>
        ) : null}
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
          <VideoLoginMethodFormFields
            form={form}
            setForm={setForm}
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword(prev => !prev)}
          />

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
    </div>
  );
}
