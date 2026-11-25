import { ChevronDown, Wand2 } from 'lucide-react';

import { buildHkRewritePrompt, HK_REWRITE_SYSTEM_PROMPT } from '@/lib/hkCantonesePrompts';
import { CopyButton } from './CopyButton';

export interface RewriteRulesPanelProps {
  input: string;
}

export function RewriteRulesPanel({ input }: RewriteRulesPanelProps) {
  return (
    <details className="group rounded-md border border-[rgba(13,26,45,0.08)] bg-white p-5 shadow-[0_2px_6px_rgba(0,20,40,0.05)]">
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[16px] font-bold">
            <Wand2 size={16} className="text-teal-600" />
            改寫規則與 Prompt
          </span>
          <span className="mt-1 block text-[12px] text-muted-foreground">
            來源：B100-Manager「設定 → 寫作要求」（Beauty100／IG／FB），已改成通用品牌版本。
          </span>
        </span>
        <ChevronDown size={16} className="mt-1 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="mt-4 space-y-3">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          本工具用同一套規則在瀏覽器即時處理；如果想要更自然的全文改寫，可把下面 prompt 貼到 ChatGPT／Gemini。
          「複製 Prompt」只有規則；「複製 Prompt + 原文」會連你的原文一齊複製。
        </p>

        <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-[#f5f8fc] p-3 text-[12px] leading-relaxed text-[#0d1a2d]">
          {HK_REWRITE_SYSTEM_PROMPT}
        </pre>

        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={HK_REWRITE_SYSTEM_PROMPT} label="複製 Prompt" />
          <CopyButton text={buildHkRewritePrompt(input)} label="複製 Prompt + 原文" />
          {!input.trim() && (
            <span className="text-[11px] text-muted-foreground">（未輸入原文，只會複製規則）</span>
          )}
        </div>
      </div>
    </details>
  );
}
