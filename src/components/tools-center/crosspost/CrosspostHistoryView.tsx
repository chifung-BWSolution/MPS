import { useMemo, useState } from 'react';
import { Eye, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PLATFORM_RULES } from '@/lib/crosspost';
import type { SavedCopySet } from '@/lib/crosspostApi';

export interface CrosspostHistoryViewProps {
  sets: SavedCopySet[];
  loading: boolean;
  error: string | null;
  available: boolean;
  onOpen: (set: SavedCopySet) => void;
  onReuse: (set: SavedCopySet) => void;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => void;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CrosspostHistoryView({
  sets,
  loading,
  error,
  available,
  onOpen,
  onReuse,
  onDelete,
  onRefresh,
}: CrosspostHistoryViewProps) {
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<SavedCopySet | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return sets;
    return sets.filter((set) =>
      [
        set.title,
        set.brief.coreInfo,
        set.brief.audience,
        set.brief.cta,
        set.brief.brandName ?? '',
      ].some((text) => text.toLowerCase().includes(keyword)),
    );
  }, [sets, query]);

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-[#0d1a2d]">歷史紀錄</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            最近 50 組生成紀錄；可重開結果、重用 brief 或刪除。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋標題、品牌、受眾…"
              aria-label="搜尋歷史紀錄"
              className="w-[220px] rounded-md border border-border bg-white py-1.5 pl-8 pr-3 text-[12px] outline-none focus:border-teal-500"
            />
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#0d1a2d]/75 transition-colors hover:bg-muted/30"
          >
            <RefreshCw size={13} />
            重新整理
          </button>
        </div>
      </div>

      {!available ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
          歷史功能尚未啟用（資料表未建立）。生成文案仍可使用，寫入歷史會失敗；完成 migration 後重新整理即可。
        </div>
      ) : error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-700">
          <span className="min-w-0 break-words">載入歷史失敗：{error}</span>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded border border-rose-300 bg-white px-2 py-1 text-[12px] font-medium hover:bg-rose-100"
          >
            重試
          </button>
        </div>
      ) : loading && sets.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-12 animate-pulse rounded-md border border-border/50 bg-white" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-white p-10 text-center">
          <p className="text-[14px] font-medium text-[#0d1a2d]">
            {sets.length === 0 ? '還沒有生成紀錄' : '沒有符合搜尋的紀錄'}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {sets.length === 0 ? '回到「生成文案」填三個必填欄位即可開始。' : '試試其他關鍵字。'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-[12px] text-muted-foreground">
                <th className="px-3 py-2 font-medium">標題</th>
                <th className="px-3 py-2 font-medium">品牌</th>
                <th className="px-3 py-2 font-medium">受眾</th>
                <th className="px-3 py-2 font-medium">平台</th>
                <th className="px-3 py-2 font-medium">建立時間</th>
                <th className="px-3 py-2 font-medium">建立人</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((set) => (
                <tr key={set.id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/20">
                  <td className="max-w-[240px] px-3 py-2">
                    <p className="truncate font-medium text-[#0d1a2d]" title={set.title}>
                      {set.title}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-[#0d1a2d]/75">{set.brief.brandName || '—'}</td>
                  <td className="max-w-[220px] px-3 py-2">
                    <p className="truncate text-[#0d1a2d]/75" title={set.brief.audience}>
                      {set.brief.audience || '—'}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-[#0d1a2d]/75">
                    {set.variants.map((variant) => PLATFORM_RULES[variant.platform].label).join('、') ||
                      '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[12px] text-muted-foreground">
                    {formatDateTime(set.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-[#0d1a2d]/75">{set.createdByName || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onOpen(set)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-teal-700 hover:bg-teal-50"
                      >
                        <Eye size={12} />
                        開啟
                      </button>
                      <button
                        type="button"
                        onClick={() => onReuse(set)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-[#0d1a2d]/75 hover:bg-muted/40"
                      >
                        <RotateCcw size={12} />
                        重用 brief
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(set)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 size={12} />
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除這組文案？</AlertDialogTitle>
            <AlertDialogDescription>
              「{pendingDelete?.title ?? '未命名文案'}」與其所有平台版本會一併刪除，無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {deleting ? '刪除中…' : '刪除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
