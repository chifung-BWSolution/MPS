import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HOTSPOT_KIND_LABEL } from '@/lib/hotspotRadar';
import { cn } from '@/lib/utils';
import type {
  HotspotKind,
  HotspotTargetInput,
  HotspotTargetRow,
} from '@/types/hotspotRadar';

const KIND_HINT: Record<HotspotKind, string> = {
  account: '例：@brand_hk 或 instagram.com/brand_hk（公開商業／創作者帳號）',
  hashtag: '例：#網頁設計 或 foodhk（不要空白）',
  ad_keyword: '例：室內設計（Meta 廣告庫用關鍵字搜尋）',
};

function formatDate(iso: string | null): string {
  if (!iso) return '從未抓取';
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '—';
  return new Date(time).toLocaleString('zh-HK', {
    timeZone: 'Asia/Hong_Kong',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HotspotTargetsPanel({
  open,
  onClose,
  targets,
  canManage,
  saving,
  onCreate,
  onUpdate,
  onDelete,
  onTest,
}: {
  open: boolean;
  onClose: () => void;
  targets: HotspotTargetRow[];
  canManage: boolean;
  saving: boolean;
  onCreate: (input: HotspotTargetInput) => Promise<void>;
  onUpdate: (id: string, patch: Partial<HotspotTargetInput>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTest: (kind: HotspotKind, value: string) => Promise<{ valid: boolean; preview_count: number; cost_usd: number }>;
}) {
  const [kind, setKind] = useState<HotspotKind>('account');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; preview_count: number; cost_usd: number } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const resetForm = () => {
    setValue('');
    setLabel('');
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!canManage || !value.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(kind, value.trim());
      setTestResult(result);
      if (!result.valid) toast.error('格式不正確，請看提示');
      else if (result.preview_count === 0) toast.warning('格式正確，但這次沒有抓到內容（可先儲存，之後再抓）');
      else toast.success(`可用：試抓 ${result.preview_count} 則`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '驗證失敗');
    } finally {
      setTesting(false);
    }
  };

  const handleCreate = async () => {
    if (!canManage || !value.trim()) return;
    try {
      await onCreate({ kind, value: value.trim(), label: label.trim() || null });
      toast.success('已新增監測目標');
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '新增失敗');
    }
  };

  const handleDelete = async (target: HotspotTargetRow) => {
    if (!canManage) return;
    if (confirmDeleteId !== target.id) {
      setConfirmDeleteId(target.id);
      return;
    }
    try {
      await onDelete(target.id);
      toast.success('已刪除目標（已抓到的內容會保留）');
      setConfirmDeleteId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '刪除失敗');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>監測目標</DialogTitle>
          <DialogDescription>
            對標帳號、Hashtag、廣告關鍵字共用同一個熱門池；每日抓取會優先處理最久沒更新的目標。
          </DialogDescription>
        </DialogHeader>

        {!canManage && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            只有管理層可以新增／修改監測目標；你仍然可以瀏覽與收藏。
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/60 p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-500">類型</span>
            <Select
              value={kind}
              onValueChange={(next) => {
                setKind(next as HotspotKind);
                setTestResult(null);
              }}
            >
              <SelectTrigger className="h-8 w-[124px] bg-white text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(HOTSPOT_KIND_LABEL) as HotspotKind[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {HOTSPOT_KIND_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-500">內容</span>
            <Input
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setTestResult(null);
              }}
              placeholder={KIND_HINT[kind]}
              className="h-8 bg-white text-[12px]"
              disabled={!canManage}
            />
          </label>

          <label className="flex w-[150px] flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-500">顯示名稱（選填）</span>
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="例：競品 A"
              className="h-8 bg-white text-[12px]"
              disabled={!canManage}
            />
          </label>

          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => void handleTest()}
            disabled={!canManage || testing || !value.trim()}
          >
            {testing ? <Loader2 size={13} className="animate-spin" /> : null}
            驗證
          </Button>
          <Button
            size="sm"
            className="h-8 bg-teal-600 text-white hover:bg-teal-700"
            onClick={() => void handleCreate()}
            disabled={!canManage || saving || !value.trim()}
          >
            <Plus size={13} />
            新增
          </Button>
        </div>

        {testResult && (
          <div
            className={cn(
              'rounded-md border px-3 py-2 text-[12px]',
              testResult.valid
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800',
            )}
          >
            {testResult.valid
              ? `格式正確；試抓 ${testResult.preview_count} 則（約 US$${testResult.cost_usd.toFixed(4)}）。`
              : '格式不正確，請檢查內容。'}
          </div>
        )}

        <div className="max-h-[42vh] space-y-2 overflow-y-auto">
          {targets.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-[12px] text-slate-500">
              還沒有監測目標。先加一個對標帳號，再按「立即抓取」。
            </div>
          ) : (
            targets.map((target) => (
              <div
                key={target.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-[rgba(13,26,45,0.08)] bg-white px-3 py-2"
              >
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-600">
                  {HOTSPOT_KIND_LABEL[target.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-[#0d1a2d]">
                    {target.label ? `${target.label}（${target.value}）` : target.value}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {formatDate(target.last_fetched_at)}
                    {target.last_error ? ` · 上次失敗：${target.last_error}` : ''}
                  </div>
                </div>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-teal-600"
                    checked={target.active}
                    disabled={!canManage || saving}
                    onChange={(event) =>
                      void onUpdate(target.id, { active: event.target.checked }).catch((error) =>
                        toast.error(error instanceof Error ? error.message : '更新失敗'),
                      )
                    }
                  />
                  啟用
                </label>
                <Button
                  size="sm"
                  variant={confirmDeleteId === target.id ? 'default' : 'outline'}
                  className={cn(
                    'h-7 px-2 text-[11.5px]',
                    confirmDeleteId === target.id && 'bg-rose-600 text-white hover:bg-rose-700',
                  )}
                  disabled={!canManage || saving}
                  onClick={() => void handleDelete(target)}
                >
                  <Trash2 size={12} />
                  {confirmDeleteId === target.id ? '確認刪除' : '刪除'}
                </Button>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            關閉
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
