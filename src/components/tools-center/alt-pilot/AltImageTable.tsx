import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AltImageCandidate, AltRow } from '@/lib/altTypes.ts';
import { AltSuggestionRow } from './AltSuggestionRow';
import { isPendingRow, isSelectableRow } from './AltPilotUtils';

export interface AltImageTableProps {
  rows: AltRow[];
  selected: Set<string>;
  onToggle: (url: string) => void;
  onToggleAll: () => void;
  onOpenDetail: (url: string) => void;
  onCopy: (text: string) => void;
  onApprove: (id: string, alt: string) => void;
  onReject: (id: string) => void;
  onUnapprove: (id: string) => void;
  onRegenerate: (id: string) => void;
  onGenerateOne: (image: AltImageCandidate) => void;
  onSaveAlt: (id: string, alt: string) => void;
  onDraftChange: (id: string, alt: string) => void;
  onGenerateSelected: () => void;
  onApproveSelected: () => void;
  onRejectSelected: () => void;
  generating: boolean;
  progress: { done: number; total: number } | null;
  bulkBusy: boolean;
  busyForRow: (row: AltRow) => string | null;
}

export function AltImageTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  onOpenDetail,
  onCopy,
  onApprove,
  onReject,
  onUnapprove,
  onRegenerate,
  onGenerateOne,
  onSaveAlt,
  onDraftChange,
  onGenerateSelected,
  onApproveSelected,
  onRejectSelected,
  generating,
  progress,
  bulkBusy,
  busyForRow,
}: AltImageTableProps) {
  const selectable = rows.filter(isSelectableRow);
  const selectedRows = selectable.filter((row) => selected.has(row.image.url));
  const allSelected = selectable.length > 0 && selectedRows.length === selectable.length;
  const someSelected = selectedRows.length > 0 && !allSelected;
  const generatableSelected = selectedRows.filter(
    (row) => !row.suggestion || isPendingRow(row),
  );
  const approvableSelected = selectedRows.filter(
    (row) =>
      isPendingRow(row) &&
      (Boolean(row.suggestion?.suggested_alt.trim()) || Boolean(row.suggestion?.decorative)),
  );

  return (
    <div className="overflow-hidden rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[#0d1a2d]">圖片與 ALT</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            生成後逐張確認；批准後才會出現在匯出檔。裝飾圖會建議 <code className="rounded bg-[#f5f8fc] px-1">alt=""</code>。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-[12px]"
            onClick={onToggleAll}
            disabled={selectable.length === 0 || generating || bulkBusy}
          >
            {allSelected ? '取消全選' : '全選'}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 bg-[#0D9488] px-3 text-[12px] text-white hover:bg-[#0b8076]"
            onClick={onGenerateSelected}
            disabled={generating || bulkBusy || generatableSelected.length === 0}
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            生成 ALT（{generatableSelected.length}）
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 bg-white px-3 text-[12px]"
            onClick={onApproveSelected}
            disabled={generating || bulkBusy || approvableSelected.length === 0}
          >
            <Check size={13} />
            批准（{approvableSelected.length}）
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-[12px] text-muted-foreground"
            onClick={onRejectSelected}
            disabled={generating || bulkBusy || selectedRows.length === 0}
          >
            <X size={13} />
            略過
          </Button>
        </div>
      </div>

      {generating ? (
        <div className="border-b border-border bg-[#f0fdfa] px-4 py-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-teal-800">
            <span>正在生成 ALT，已完成的圖片會即時出現。</span>
            <span>
              {progress ? `${progress.done}/${progress.total}` : '準備中…'}
            </span>
          </div>
          <Progress
            value={progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 8}
            className="h-1.5 bg-teal-100"
          />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="px-6 py-14 text-center text-[13px] text-muted-foreground">
          這次分析沒有可處理的圖片；背景圖、iframe、SVG 不在第一期範圍。
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow className="bg-[#f8fafc] hover:bg-[#f8fafc]">
                <TableHead className="w-10 pl-3">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={onToggleAll}
                    aria-label="全選圖片"
                    disabled={selectable.length === 0 || generating || bulkBusy}
                  />
                </TableHead>
                <TableHead className="w-[64px]">圖</TableHead>
                <TableHead className="w-[190px]">檔名／位置</TableHead>
                <TableHead className="w-[170px]">現有 ALT</TableHead>
                <TableHead className="w-[300px]">建議 ALT</TableHead>
                <TableHead className="w-[110px]">狀態／風險</TableHead>
                <TableHead className="w-[70px]">信心</TableHead>
                <TableHead className="w-[150px] pr-3 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const suggestion = row.suggestion;
                return (
                  <AltSuggestionRow
                    key={row.image.url}
                    row={row}
                    selected={selected.has(row.image.url)}
                    onToggle={() => onToggle(row.image.url)}
                    onOpenDetail={() => onOpenDetail(row.image.url)}
                    onCopy={onCopy}
                    onApprove={(alt) => suggestion && onApprove(suggestion.id, alt)}
                    onReject={() => suggestion && onReject(suggestion.id)}
                    onUnapprove={() => suggestion && onUnapprove(suggestion.id)}
                    onRegenerate={() => suggestion && onRegenerate(suggestion.id)}
                    onGenerateOne={() => onGenerateOne(row.image)}
                    onSaveAlt={(alt) => suggestion && onSaveAlt(suggestion.id, alt)}
                    onDraftChange={(alt) => suggestion && onDraftChange(suggestion.id, alt)}
                    busy={generating || bulkBusy || Boolean(busyForRow(row))}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
