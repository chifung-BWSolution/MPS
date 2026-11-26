/**
 * SEO 雷達 · 通用確認浮層
 *
 * 用在兩個「一按就影響全域」的動作：全站自動抓取、每日自動抓取開關。
 * 說明文字刻意用非技術語言（不提 GSC／cron／API），讓非工程同事也看得懂。
 */

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  description: string;
  children?: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  tone?: 'default' | 'danger';
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmActionDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  busy = false,
  tone = 'default',
  onClose,
  onConfirm,
}: ConfirmActionDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px]">{title}</DialogTitle>
          <DialogDescription className="text-[13px]">{description}</DialogDescription>
        </DialogHeader>

        {children && (
          <div className="space-y-2 text-[12px] leading-relaxed text-slate-600">{children}</div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            size="sm"
            className={cn(
              tone === 'danger'
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'bg-teal-600 text-white hover:bg-teal-700',
            )}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
