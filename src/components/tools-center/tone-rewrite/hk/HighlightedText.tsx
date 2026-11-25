import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { HkMark, HkMarkKind } from '@/lib/hkCantoneseRewrite';

const MARK_CLASS: Record<HkMarkKind, string> = {
  shape: 'rounded-[2px] bg-amber-100 px-0.5 text-amber-900 underline decoration-amber-400 decoration-dotted decoration-1 underline-offset-2',
  written: 'rounded-[2px] bg-teal-100 px-0.5 text-teal-900 underline decoration-teal-400 decoration-dotted decoration-1 underline-offset-2',
  colloquial: 'rounded-[2px] bg-rose-100 px-0.5 text-rose-900 underline decoration-rose-400 decoration-dotted decoration-1 underline-offset-2',
};

const MARK_SWATCH: Record<HkMarkKind, string> = {
  shape: 'bg-amber-100',
  written: 'bg-teal-100',
  colloquial: 'bg-rose-100',
};

const MARK_LABEL: Record<HkMarkKind, string> = {
  shape: '簡體字',
  written: '非港式用詞',
  colloquial: '口語改寫',
};

export function MarkLegend({
  className,
  kinds,
}: {
  className?: string;
  kinds?: HkMarkKind[];
}) {
  const visible = kinds ?? (Object.keys(MARK_LABEL) as HkMarkKind[]);
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground', className)}>
      {visible.map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1">
          <span className={cn('h-2.5 w-2.5 rounded-[2px]', MARK_SWATCH[kind])} />
          {MARK_LABEL[kind]}
        </span>
      ))}
    </div>
  );
}

export interface HighlightedTextProps {
  text: string;
  marks: HkMark[];
  className?: string;
}

/**
 * 依 marks 把文字切成一般文字與 <mark>；marks 的 start/end 是相對輸出文字的索引。
 * 重疊標記會被跳過，避免 React key／切片錯位。
 */
export function HighlightedText({ text, marks, className }: HighlightedTextProps) {
  if (!text) {
    return <span className="text-muted-foreground">—</span>;
  }

  const sorted = [...marks].sort((a, b) => a.start - b.start || a.end - b.end);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  sorted.forEach((mark, index) => {
    if (mark.start < cursor || mark.end > text.length) return;
    if (mark.start > cursor) nodes.push(text.slice(cursor, mark.start));
    nodes.push(
      <mark
        key={`${mark.ruleId}-${index}`}
        title={mark.title}
        className={MARK_CLASS[mark.kind]}
      >
        {text.slice(mark.start, mark.end)}
      </mark>,
    );
    cursor = mark.end;
  });

  if (cursor < text.length) nodes.push(text.slice(cursor));

  return <div className={cn('whitespace-pre-wrap break-words', className)}>{nodes}</div>;
}
