/**
 * SEO 雷達 · 採納確認（PRD §6.3 / §8）
 *
 * 兩段式安全：
 *   1. 顯示「只影響已勾選的 N 個詞」
 *   2. 「同時加入自動生成佇列」預設不勾；勾了會明示 Gemini 成本與只作用在
 *      pipeline_status 為 NULL / backlog 的詞（已生成或已發佈的不會被覆寫）。
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface AdoptDialogProps {
  open: boolean;
  count: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (enqueue: boolean) => void;
}

export function AdoptDialog({ open, count, busy, onClose, onConfirm }: AdoptDialogProps) {
  const [enqueue, setEnqueue] = useState(false);

  useEffect(() => {
    if (open) setEnqueue(false);
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px]">採納到關鍵字庫</DialogTitle>
          <DialogDescription className="text-[13px]">
            只會影響你已勾選的 <strong>{count}</strong> 個詞；既有關鍵字不會被改寫。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <label className="flex items-start gap-2 rounded-md border border-border/60 p-3 cursor-pointer hover:bg-muted/20">
            <Checkbox
              checked={enqueue}
              onCheckedChange={(checked) => setEnqueue(checked === true)}
              className="mt-0.5"
            />
            <span className="text-[13px] leading-relaxed">
              同時加入自動生成佇列（<code className="text-[12px]">pipeline_status = backlog</code>）
              <span className="mt-1 block text-[12px] text-muted-foreground">
                不勾選時只會進關鍵字庫，之後可在「社媒自動化營運 → 關鍵字庫」再啟用。
              </span>
            </span>
          </label>

          {enqueue && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                加入佇列後，排程會用 Gemini 自動生成文章並消耗每日額度。已生成或已發佈的詞會被跳過，不會被覆寫。
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" onClick={() => onConfirm(enqueue)} disabled={busy || count === 0}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            確認採納 {count} 個
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
