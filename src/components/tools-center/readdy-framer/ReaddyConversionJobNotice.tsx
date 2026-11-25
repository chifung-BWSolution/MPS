import { CheckCircle2, Loader2, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useReaddyConversionJob } from '@/context/ReaddyConversionJobContext';

export function ReaddyConversionJobNotice() {
  const job = useReaddyConversionJob();
  const { navigateTo, currentModule, currentSubModule } = useApp();
  if (job.phase === 'idle') return null;

  const onWorkbench = currentModule === 'tools-center' && currentSubModule === 'readdy-framer';
  const ok = job.phase === 'success' && !job.emailError;
  const title =
    job.phase === 'running'
      ? 'Readdy 轉換在後台進行'
      : ok
        ? 'Readdy 轉換完成'
        : 'Readdy 轉換未完成';

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[min(360px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-start gap-3 px-3.5 py-3">
        <div className="mt-0.5 shrink-0">
          {job.phase === 'running' ? (
            <Loader2 size={16} className="animate-spin text-[#0BB59B]" />
          ) : (
            <CheckCircle2 size={16} className={ok ? 'text-[#0BB59B]' : 'text-rose-500'} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-[#101B2D]">{title}</div>
          <p className="mt-0.5 text-[12px] leading-5 text-slate-500">
            {job.siteName || '未命名網站'}
            {job.readdyCode ? ` · Readdy-${job.readdyCode}` : ''}
            {job.total > 0 ? ` · ${job.done}/${job.total}` : ''}
          </p>
          {job.currentLabel && (
            <p className="mt-1 text-[12px] leading-5 text-[#101B2D]">{job.currentLabel}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {!onWorkbench && (
              <button
                type="button"
                onClick={() => navigateTo('tools-center', 'readdy-framer')}
                className="rounded-md bg-[#101B2D] px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                回到轉換工作台
              </button>
            )}
            {job.phase === 'running' ? (
              <button
                type="button"
                onClick={job.cancel}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600"
              >
                中止
              </button>
            ) : (
              <button
                type="button"
                onClick={job.dismiss}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600"
              >
                關閉
              </button>
            )}
          </div>
        </div>
        {job.phase !== 'running' && (
          <button
            type="button"
            onClick={job.dismiss}
            className="text-slate-400 hover:text-slate-700"
            aria-label="關閉轉換通知"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
