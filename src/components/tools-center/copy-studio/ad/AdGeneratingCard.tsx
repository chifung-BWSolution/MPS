import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

const STEPS = [
  '讀取產品資料與切角…',
  '拆解賣點、受眾與語氣…',
  '撰寫 A/B 雙版完整文案…',
  '檢查 CTA 與平台字數上限…',
] as const;

/** 生成中提示卡：隱藏所有輸入卡，只留這張，帶輕量動畫與可取消 */
export function AdGeneratingCard({
  angleCount,
  platformLabel,
  onCancel,
}: {
  angleCount: number;
  platformLabel: string;
  onCancel: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    const step = window.setInterval(() => {
      setStepIndex((previous) => (previous + 1) % STEPS.length);
    }, 2600);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(step);
    };
  }, []);

  return (
    <section
      aria-live="polite"
      aria-busy="true"
      className="relative overflow-hidden rounded-xl border border-teal-100 bg-white px-6 py-12 text-center animate-in fade-in-0 zoom-in-95 duration-300 motion-reduce:animate-none"
    >
      {/* 頂部流光 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] overflow-hidden bg-teal-100">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-transparent via-teal-500 to-transparent" />
      </div>

      <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-dashed border-teal-200 motion-safe:animate-[spin_9s_linear_infinite]" />
        <span className="absolute inset-2 rounded-full bg-teal-50" />
        <Sparkles size={22} className="relative text-teal-600 motion-safe:animate-pulse" />
      </div>

      <h3 className="mt-4 text-[16px] font-bold text-[#0d1a2d]">正在生成文案矩陣</h3>
      <p className="mt-1 h-5 text-[12px] text-teal-700 transition-opacity duration-300">
        {STEPS[stepIndex]}
      </p>

      <div className="mt-3 flex items-center justify-center gap-1.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400 [animation-delay:-300ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500 [animation-delay:-150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-600" />
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed text-muted-foreground">
        {platformLabel} · {angleCount} 個切角 · 通常 15–40 秒
        {elapsed > 0 ? ` · 已用 ${elapsed} 秒` : ''}
      </p>
      {elapsed >= 40 && (
        <p className="mt-1 text-[11px] text-amber-700">比平時久一點，AI 仍在處理，可繼續等或取消後重試。</p>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="mt-5 inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
      >
        <Loader2 size={12} className="animate-spin" />
        取消生成
      </button>
    </section>
  );
}
