/**
 * SEO 雷達 · 刪除確認（PRD §8）
 *
 * 「刪除」是不可逆操作，所以一律二次確認，並說明兩件事：
 *   1. 只作用在已勾選的候選詞，已採納的詞不會被刪
 *   2. 下次抓取若仍有曝光／搜尋建議，會重新長回來
 */

import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface DeleteDialogProps {
  open: boolean;
  count: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteDialog({ open, count, busy, onClose, onConfirm }: DeleteDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px]">刪除候選詞</DialogTitle>
          <DialogDescription className="text-[13px]">
            將永久刪除你已勾選的 <strong>{count}</strong> 個候選詞。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-[12px] leading-relaxed text-rose-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            刪除後無法復原；已採納的詞不在刪除範圍（它們是歷史證據）。下次抓取時，若這些詞仍有曝光或搜尋建議，會重新出現。
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            size="sm"
            className="bg-rose-600 text-white hover:bg-rose-700"
            onClick={onConfirm}
            disabled={busy || count === 0}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            確認刪除 {count} 個
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
