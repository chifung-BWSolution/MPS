import { CheckCheck, ClipboardCopy, Download, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface AltExportBarProps {
  approvedCount: number;
  pendingCount: number;
  onExportCsv: () => void;
  onExportJson: () => void;
  onCopyApproved: () => void;
  onMarkExported: () => void;
  canMarkExported: boolean;
}

export function AltExportBar({
  approvedCount,
  pendingCount,
  onExportCsv,
  onExportJson,
  onCopyApproved,
  onMarkExported,
  canMarkExported,
}: AltExportBarProps) {
  const hasApproved = approvedCount > 0;

  return (
    <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white/95 p-3 shadow-card backdrop-blur">
      <div className="text-[12px] text-muted-foreground">
        <span className="font-semibold text-[#0d1a2d]">已批准 {approvedCount}</span>
        {pendingCount > 0 ? ` · 待批准 ${pendingCount}` : ''}
        {!hasApproved ? ' · 批准後才可匯出' : ' · 匯出只包含已批准項目'}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 bg-white text-[12px]"
          onClick={onCopyApproved}
          disabled={!hasApproved}
        >
          <ClipboardCopy size={13} />
          複製已批准
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 bg-white text-[12px]"
          onClick={onExportJson}
          disabled={!hasApproved}
        >
          <FileJson size={13} />
          JSON
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 bg-[#0D9488] px-3 text-[12px] text-white hover:bg-[#0b8076]"
          onClick={onExportCsv}
          disabled={!hasApproved}
        >
          <Download size={13} />
          匯出 CSV
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-[12px] text-muted-foreground"
          onClick={onMarkExported}
          disabled={!canMarkExported || !hasApproved}
        >
          <CheckCheck size={13} />
          標記已匯出
        </Button>
      </div>
    </div>
  );
}
