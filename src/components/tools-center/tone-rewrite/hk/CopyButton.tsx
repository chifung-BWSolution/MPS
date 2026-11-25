import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

export interface CopyButtonProps {
  text: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * 複製按鈕：成功後 2 秒回到「複製」，失敗時提示手動選取。
 * - text 改變時立刻重置「已複製」，避免切換平台後仍顯示上一個結果
 * - unmount 時清掉 timer，避免 setState-after-unmount
 */
export function CopyButton({ text, label = '複製', disabled = false, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setCopied(false);
  }, [text]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    if (disabled || !text) return;
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${label}已複製`);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, 2000);
    } catch {
      toast.error('瀏覽器不允許剪貼簿存取，請手動選取複製');
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      disabled={disabled || !text}
      aria-label={label}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2.5 text-[12px] font-medium transition-colors',
        copied
          ? 'border-teal-200 bg-teal-50 text-teal-700'
          : 'border-border bg-white text-muted-foreground hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? '已複製' : label}
    </button>
  );
}
