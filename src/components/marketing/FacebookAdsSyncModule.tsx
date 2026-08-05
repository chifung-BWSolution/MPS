import { useMemo } from 'react';
import { Pause, Play, RefreshCw, Square, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useFacebookAdsBackfill } from '@/hooks/useFacebookAdsBackfill';
import { Button } from '@/components/ui/button';

function statusLabel(status?: string) {
  switch (status) {
    case 'running':
      return { text: '執行中', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'paused':
      return { text: '已暫停', className: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'completed':
      return { text: '已完成', className: 'bg-slate-100 text-slate-700 border-slate-200' };
    case 'failed':
      return { text: '失敗', className: 'bg-red-50 text-red-700 border-red-200' };
    case 'cancelled':
      return { text: '已取消', className: 'bg-slate-100 text-slate-600 border-slate-200' };
    default:
      return { text: '尚未開始', className: 'bg-slate-50 text-slate-600 border-slate-200' };
  }
}

export function FacebookAdsSyncModule() {
  const {
    job,
    loading,
    working,
    error,
    autoRun,
    start,
    pause,
    resume,
    cancel,
    refreshJob,
  } = useFacebookAdsBackfill();

  const pct = useMemo(() => {
    if (!job || !job.totalMonths) return 0;
    return Math.min(100, Math.round((job.completedMonths / job.totalMonths) * 100));
  }, [job]);

  const status = statusLabel(job?.status);
  const recentErrors = job?.meta?.recent_errors ?? [];

  return (
    <div className="space-y-0">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-3 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex px-2.5 py-1 rounded border text-[12px] font-medium ${status.className}`}>
              {status.text}
            </span>
            {autoRun && job?.status === 'running' ? (
              <span className="text-[12px] text-emerald-700">自動推進中…請保持此分頁開啟</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void refreshJob()} disabled={loading}>
              <RefreshCw size={14} className="mr-1.5" /> 重新整理
            </Button>
            {!job || ['completed', 'cancelled'].includes(job.status) ? (
              <Button
                size="sm"
                disabled={working}
                onClick={async () => {
                  const r = await start();
                  if (r.ok) toast.success('已開始完整歷史同步');
                  else toast.error(r.error || '啟動失敗');
                }}
              >
                開始完整歷史同步
              </Button>
            ) : null}
            {job?.status === 'running' ? (
              <Button
                variant="outline"
                size="sm"
                disabled={working}
                onClick={async () => {
                  const r = await pause();
                  if (r.ok) toast.message('已暫停');
                  else toast.error(r.error || '暫停失敗');
                }}
              >
                <Pause size={14} className="mr-1.5" /> 暫停
              </Button>
            ) : null}
            {job && ['paused', 'failed'].includes(job.status) ? (
              <Button
                size="sm"
                disabled={working}
                onClick={async () => {
                  const r = await resume();
                  if (r.ok) toast.success('已繼續同步');
                  else toast.error(r.error || '繼續失敗');
                }}
              >
                <Play size={14} className="mr-1.5" /> 繼續
              </Button>
            ) : null}
            {job && ['running', 'paused', 'failed', 'pending'].includes(job.status) ? (
              <Button
                variant="outline"
                size="sm"
                disabled={working}
                onClick={async () => {
                  const r = await cancel();
                  if (r.ok) toast.message('已取消');
                  else toast.error(r.error || '取消失敗');
                }}
              >
                <Square size={14} className="mr-1.5" /> 取消
              </Button>
            ) : null}
          </div>
        </div>
        {error ? <div className="text-[12px] text-red-600">{error}</div> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card p-5 space-y-4">
          <h3 className="text-[15px] font-bold">進度</h3>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-teal-600 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-[13px] text-muted-foreground">
            {job
              ? `${job.completedMonths} / ${job.totalMonths} 個月（${pct}%）`
              : '尚無任務'}
          </div>
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <div className="text-muted-foreground text-[11px]">歷史起訖</div>
              <div className="font-medium">
                {job ? `${job.historyStartDate} → ${job.historyEndDate}` : '—'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">目前月份游標</div>
              <div className="font-medium">{job?.cursorMonth || '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">已寫入列數</div>
              <div className="font-medium">{job ? job.rowsUpserted.toLocaleString() : '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">目標帳戶</div>
              <div className="font-medium">{job?.accountsTargeted ?? '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">上次處理月份</div>
              <div className="font-medium">{job?.meta?.last_month || '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">錯誤數</div>
              <div className="font-medium">{job?.errorCount ?? 0}</div>
            </div>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Meta Insights 約僅保留近 37 個月資料。完整歷史以「每月一個步驟」推進，避免 Edge Function 逾時。
            執行中請保持此分頁開啟以自動推進；關閉後可按「繼續」從資料庫游標恢復。涵蓋 Branding Works、Food and Wine、Attitude Beauty 等已設定憑證的廣告帳戶。
          </p>
        </div>

        <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold">最近錯誤 / 日誌</h3>
            {job?.lastError ? (
              <span className="text-[11px] text-red-600 flex items-center gap-1">
                <Trash2 size={12} /> 有帳戶權限或 API 錯誤屬預期
              </span>
            ) : null}
          </div>
          {loading ? (
            <div className="text-[13px] text-muted-foreground">載入中…</div>
          ) : recentErrors.length === 0 ? (
            <div className="text-[13px] text-muted-foreground">尚無錯誤記錄</div>
          ) : (
            <ul className="space-y-2 max-h-[320px] overflow-y-auto text-[12px]">
              {recentErrors.map((e, i) => (
                <li key={`${i}-${e.slice(0, 24)}`} className="border border-slate-100 rounded px-2 py-1.5 bg-slate-50">
                  {e}
                </li>
              ))}
            </ul>
          )}
          {job?.startedAt ? (
            <div className="text-[11px] text-muted-foreground pt-2 border-t">
              開始：{new Date(job.startedAt).toLocaleString()}
              {job.finishedAt ? ` · 結束：${new Date(job.finishedAt).toLocaleString()}` : ''}
              {job.updatedAt ? ` · 更新：${new Date(job.updatedAt).toLocaleString()}` : ''}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
