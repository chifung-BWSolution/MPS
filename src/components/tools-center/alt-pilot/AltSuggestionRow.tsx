import { useEffect, useState, type ReactNode } from 'react';
import {
  Copy,
  ImageOff,
  Loader2,
  Maximize2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { countChars, truncateText } from '@/lib/altText.ts';
import type { AltRow } from '@/lib/altTypes.ts';
import { cn } from '@/lib/utils';
import { AltIssueHint, AltLocationBadge, AltRiskBadge, AltStatusPill } from './AltBadges';
import { displayAlt, formatPercent, isSelectableRow } from './AltPilotUtils';

export interface AltSuggestionRowProps {
  row: AltRow;
  selected: boolean;
  onToggle: () => void;
  onOpenDetail: () => void;
  onCopy: (text: string) => void;
  onApprove: (alt: string) => void;
  onReject: () => void;
  onUnapprove: () => void;
  onRegenerate: () => void;
  onGenerateOne: () => void;
  onSaveAlt: (alt: string) => void;
  onDraftChange: (alt: string) => void;
  busy: boolean;
}

function IconAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-[#0D9488]"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function AltSuggestionRow({
  row,
  selected,
  onToggle,
  onOpenDetail,
  onCopy,
  onApprove,
  onReject,
  onUnapprove,
  onRegenerate,
  onGenerateOne,
  onSaveAlt,
  onDraftChange,
  busy,
}: AltSuggestionRowProps) {
  const suggestion = row.suggestion;
  const approved = suggestion?.status === 'approved';
  const failed = suggestion?.status === 'failed';
  const selectable = isSelectableRow(row);
  const [draft, setDraft] = useState(suggestion?.suggested_alt || '');
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    setDraft(suggestion?.suggested_alt || '');
  }, [suggestion?.id, suggestion?.suggested_alt]);

  const savedAlt = displayAlt(suggestion);
  const charCount = countChars(draft);
  const overLimit = charCount > 125;

  return (
    <TableRow className={cn(selected ? 'bg-[#f0fdfa]/60' : undefined)}>
      <TableCell className="w-10 pl-3">
        <Checkbox
          checked={selected}
          disabled={!selectable || busy}
          onCheckedChange={onToggle}
          aria-label={`選擇 ${row.image.filename || '圖片'}`}
        />
      </TableCell>

      <TableCell className="w-[64px]">
        <button
          type="button"
          onClick={onOpenDetail}
          className="block h-12 w-12 overflow-hidden rounded-md border border-border bg-[#f5f8fc]"
          aria-label="查看圖片詳情"
        >
          {thumbFailed ? (
            <span className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageOff size={16} />
            </span>
          ) : (
            <img
              src={row.image.url}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
              onError={() => setThumbFailed(true)}
            />
          )}
        </button>
      </TableCell>

      <TableCell className="max-w-[190px]">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12px] font-medium text-[#0d1a2d]" title={row.image.filename}>
            {row.image.filename || '未命名圖片'}
          </span>
          <AltLocationBadge location={row.image.location} />
        </div>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={row.image.url}>
          {truncateText(row.image.url, 48)}
        </p>
      </TableCell>

      <TableCell className="max-w-[170px]">
        <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
          {row.image.currentAlt || '（空白）'}
        </p>
      </TableCell>

      <TableCell className="w-[300px]">
        {suggestion ? (
          approved ? (
            <div>
              <p className="text-[12px] leading-relaxed text-[#0d1a2d]">{savedAlt || '（裝飾圖，alt=""）'}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">已生成</span>
                {suggestion.issues.length > 0 ? <AltIssueHint issues={suggestion.issues} /> : null}
              </div>
            </div>
          ) : (
            <div>
              <Textarea
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  onDraftChange(event.target.value);
                }}
                onBlur={() => {
                  const next = draft.trim();
                  if (next !== (suggestion.suggested_alt || '').trim()) onSaveAlt(next);
                }}
                rows={2}
                disabled={busy}
                placeholder="尚未生成，或按「生成這張」"
                className="min-h-[54px] resize-y bg-white text-[12px] leading-relaxed"
                aria-label={`${row.image.filename || '圖片'} 的建議 ALT`}
              />
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className={cn('text-[10px]', overLimit ? 'text-rose-600' : 'text-muted-foreground')}>
                  {charCount}/125
                </span>
                {suggestion.issues.length > 0 ? <AltIssueHint issues={suggestion.issues} /> : null}
              </div>
            </div>
          )
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">尚未生成</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 bg-white px-2 text-[11px]"
              onClick={onGenerateOne}
              disabled={busy}
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              生成這張
            </Button>
          </div>
        )}
        {failed ? (
          <p className="mt-1 line-clamp-2 text-[10px] text-rose-600">
            {suggestion?.issues[0]?.message || '生成失敗，可重試'}
          </p>
        ) : null}
      </TableCell>

      <TableCell className="w-[110px]">
        {suggestion ? (
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-1">
              <AltStatusPill status={suggestion.status} />
              {suggestion.issues.length > 0 ? <AltIssueHint issues={suggestion.issues} /> : null}
            </div>
            <AltRiskBadge risk={suggestion.risk} />
          </div>
        ) : (
          <AltStatusPill status="empty" />
        )}
      </TableCell>

      <TableCell className="w-[70px] text-[11px] text-muted-foreground">
        {suggestion ? formatPercent(suggestion.confidence) : '—'}
      </TableCell>

      <TableCell className="w-[150px] pr-3">
        <div className="flex items-center justify-end gap-0.5">
          <IconAction label="詳情" onClick={onOpenDetail}>
            <Maximize2 size={13} />
          </IconAction>
          <IconAction
            label="複製 ALT"
            onClick={() => onCopy(approved ? savedAlt : draft)}
            disabled={!(approved ? savedAlt : draft).trim()}
          >
            <Copy size={13} />
          </IconAction>
          <IconAction
            label="重新生成"
            onClick={onRegenerate}
            disabled={busy || !suggestion}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </IconAction>
        </div>
      </TableCell>
    </TableRow>
  );
}
