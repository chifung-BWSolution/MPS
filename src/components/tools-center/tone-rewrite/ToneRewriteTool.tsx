import { Languages, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { HkRewritePanel } from './hk/HkRewritePanel';

/**
 * 《語氣校對改寫器》工具切換器。
 * 第一批只有港式；第二批英文商務版只需要在這裡加一個可選 tab，
 * 下方換成對應 panel 即可，路由與側欄都不用再改。
 */
export function ToneRewriteTool() {
  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap items-center gap-1 rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-1 shadow-[0_1px_2px_rgba(0,20,40,0.04)]">
        <button
          type="button"
          aria-pressed="true"
          className="inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-teal-600 px-3 text-[13px] font-semibold text-white"
        >
          <Languages size={14} />
          港式語氣改寫器
        </button>
        <button
          type="button"
          aria-disabled="true"
          title="英文商務語氣改寫器會於第二批加入"
          onClick={() => toast.info('英文商務語氣改寫器會於第二批加入')}
          className="inline-flex h-8 items-center gap-1.5 rounded-[4px] px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/60"
        >
          <Languages size={14} />
          英文商務語氣改寫器
          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
            第二批
          </span>
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Sparkles size={12} className="text-teal-600" />
        規則引擎在瀏覽器即時執行；不用等 AI，也不會有額度問題。
      </div>

      <HkRewritePanel />
    </div>
  );
}
