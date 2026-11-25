import { cn } from '@/lib/utils';
import {
  statusLabel,
  statusTone,
  type ContentMachine,
  type ContentStatusTone,
} from '@/lib/contentState.ts';

const TONE_CLASS: Record<ContentStatusTone, string> = {
  slate: 'bg-slate-100 text-slate-600 border-transparent',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  'amber-outline': 'bg-transparent text-amber-700 border-amber-300',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  'teal-dark': 'bg-teal-600 text-white border-teal-600',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'indigo-outline': 'bg-transparent text-indigo-700 border-indigo-300',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  muted: 'bg-slate-50 text-slate-400 border-slate-200',
};

const DOT_CLASS: Record<ContentStatusTone, string> = {
  slate: 'bg-slate-400',
  amber: 'bg-amber-500',
  'amber-outline': 'bg-amber-500',
  teal: 'bg-teal-500',
  'teal-dark': 'bg-teal-200',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  'indigo-outline': 'bg-indigo-500',
  rose: 'bg-rose-500',
  green: 'bg-emerald-500',
  muted: 'bg-slate-300',
};

export interface ContentStatusPillProps {
  status?: string | null;
  /** 決定標籤與色票的狀態機；不給時請自行給 label + tone */
  machine?: ContentMachine | 'health';
  label?: string;
  tone?: ContentStatusTone;
  dot?: boolean;
  className?: string;
  title?: string;
}

/**
 * 狀態色票（PRD §8.1）— 全插件唯一輸出點。
 * 任何頁面都不要再自己寫狀態顏色。
 */
export function ContentStatusPill({
  status,
  machine,
  label,
  tone,
  dot = true,
  className,
  title,
}: ContentStatusPillProps) {
  const resolvedTone = tone ?? (machine && status ? statusTone(machine, status) : 'slate');
  const resolvedLabel =
    label ?? (machine && status ? statusLabel(machine, status) : status ?? '—');

  return (
    <span
      title={title ?? String(resolvedLabel)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-[3px] text-[11px] font-semibold leading-4 whitespace-nowrap',
        TONE_CLASS[resolvedTone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASS[resolvedTone])} />}
      {resolvedLabel}
    </span>
  );
}
