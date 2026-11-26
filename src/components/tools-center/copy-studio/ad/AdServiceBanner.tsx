import { AlertTriangle, PlugZap, RefreshCw } from 'lucide-react';

import type { AdServiceStatus } from '@/lib/adCreativeApi';

export interface AdServiceBannerProps {
  status: AdServiceStatus;
  checking: boolean;
  onRetry: () => void;
}

export function AdServiceBanner({ status, checking, onRetry }: AdServiceBannerProps) {
  if (status === 'ready') return null;

  if (checking && status !== 'missing') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[rgba(13,26,45,0.08)] bg-white px-3 py-2 text-[12px] text-muted-foreground">
        <RefreshCw size={13} className="animate-spin" />
        檢查生成服務…
      </div>
    );
  }

  if (status === 'missing') {
    return (
      <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <PlugZap size={16} className="mt-0.5 shrink-0" />
            <div>
              <h3 className="text-[14px] font-bold">生成服務尚未部署</h3>
              <p className="mt-1 text-[12px] leading-relaxed">
                這個子功能只做 AI 生成，不會用假文案代替。完成以下三步後，按「重新檢查」即可使用。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetry}
            disabled={checking}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 text-[12px] font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={12} className={checking ? 'animate-spin' : undefined} />
            重新檢查
          </button>
        </div>

        <ol className="mt-3 space-y-1.5 text-[12px] leading-relaxed">
          <li>
            1. 部署函式：
            <code className="ml-1 rounded bg-white/80 px-1.5 py-0.5 font-mono text-[11px]">
              supabase functions deploy ad-creative-writer
            </code>
          </li>
          <li>
            2. 確認 Supabase secrets 已有{' '}
            <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[11px]">XAI_API_KEY</code>
            {' '}或{' '}
            <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[11px]">GEMINI_API_KEY</code>
            （沿用 crosspost-writer，不用新增）。
          </li>
          <li>3. 回到本頁按「重新檢查」；成功後生成按鈕才會啟用。</li>
        </ol>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-start gap-2 text-[12px] leading-relaxed">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            未能確認生成服務狀態（可能是網絡或瀏覽器 CORS）。你仍可以嘗試生成；如果失敗，會顯示具體錯誤。
          </span>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={checking}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 text-[12px] font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={12} className={checking ? 'animate-spin' : undefined} />
          重新檢查
        </button>
      </div>
    </section>
  );
}

export interface AdErrorBannerProps {
  code: string;
  message: string;
  onRetry: () => void;
}

export function AdErrorBanner({ code, message, onRetry }: AdErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-800"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <div className="text-[12px] leading-relaxed">
          <p className="font-semibold">{message}</p>
          <p className="mt-0.5 text-[11px] text-rose-700/80">錯誤碼：{code}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-rose-300 bg-white px-2.5 text-[12px] font-medium text-rose-700 transition-colors hover:bg-rose-100"
      >
        <RefreshCw size={12} />
        重試
      </button>
    </div>
  );
}
