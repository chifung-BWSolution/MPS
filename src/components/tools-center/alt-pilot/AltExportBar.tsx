import { CheckCheck, ClipboardCopy, Download, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface AltExportBarProps {
  generatedCount: number;
  failedCount: number;
  onExportCsv: () => void;
  onExportJson: () => void;
  onCopyAll: () => void;
  onMarkExported: () => void;
  canMarkExported: boolean;
}

export function AltExportBar({
  generatedCount,
  failedCount,
  onExportCsv,
  onExportJson,
  onCopyAll,
  onMarkExported,
  canMarkExported,
}: AltExportBarProps) {
  const hasGenerated = generatedCount > 0;

  return (
    <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white/95 p-3 shadow-card backdrop-blur">
      <div className="text-[12px] text-muted-foreground">
        <span className="font-semibold text-[#0d1a2d]">已生成 {generatedCount}</span>
        {failedCount > 0 ? ` · 失敗 ${failedCount}` : ''}
        {!hasGenerated ? ' · 生成後可直接匯出' : ' · 匯出包含目前所有已生成 ALT'}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 bg-white text-[12px]"
          onClick={onCopyAll}
          disabled={!hasGenerated}
        >
          <ClipboardCopy size={13} />
          複製全部
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 bg-white text-[12px]"
          onClick={onExportJson}
          disabled={!hasGenerated}
        >
          <FileJson size={13} />
          JSON
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 bg-[#0D9488] px-3 text-[12px] text-white hover:bg-[#0b8076]"
          onClick={onExportCsv}
          disabled={!hasGenerated}
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
          disabled={!canMarkExported || !hasGenerated}
        >
          <CheckCheck size={13} />
          標記已匯出
        </Button>
      </div>
    </div>
  );
}
