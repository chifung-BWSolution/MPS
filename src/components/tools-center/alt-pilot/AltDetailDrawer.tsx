import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ImageOff,
  RefreshCw,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { AltImageCandidate, AltRow } from '@/lib/altTypes.ts';
import { cn } from '@/lib/utils';
import { AltIssueHint, AltLocationBadge, AltRiskBadge, AltStatusPill } from './AltBadges';
import { displayAlt, formatDateTime, formatPercent } from './AltPilotUtils';

export interface AltDetailDrawerProps {
  row: AltRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCopy: (text: string) => void;
  onApprove: (id: string, alt: string) => void;
  onReject: (id: string) => void;
  onUnapprove: (id: string) => void;
  onRegenerate: (id: string) => void;
  onGenerateOne: (image: AltImageCandidate) => void;
  onSaveAlt: (id: string, alt: string) => void;
  busy: boolean;
}

export function AltDetailDrawer({
  row,
  open,
  onOpenChange,
  onCopy,
  onApprove,
  onReject,
  onUnapprove,
  onRegenerate,
  onGenerateOne,
  onSaveAlt,
  busy,
}: AltDetailDrawerProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const suggestion = row?.suggestion || null;

  useEffect(() => {
    setImageFailed(false);
  }, [row?.image.url]);

  const approved = suggestion?.status === 'approved';
  const savedAlt = displayAlt(suggestion);
  const draftAlt = suggestion?.suggested_alt || '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[620px]">
        <SheetHeader className="shrink-0 space-y-1 border-b border-border px-6 py-4 pr-12 text-left">
          <SheetTitle className="text-[16px]">ALT 詳情</SheetTitle>
          <SheetDescription className="text-[12px]">
            {row?.image.filename || '圖片'} · {row ? formatDateTime(suggestion?.created_at) : '—'}
          </SheetDescription>
        </SheetHeader>

        {!row ? (
          <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
            尚未選擇圖片。
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="overflow-hidden rounded-lg border border-border bg-[#f5f8fc]">
                {imageFailed ? (
                  <div className="flex h-[220px] items-center justify-center text-muted-foreground">
                    <ImageOff size={28} />
                  </div>
                ) : (
                  <img
                    src={row.image.url}
                    alt=""
                    className="max-h-[300px] w-full object-contain"
                    referrerPolicy="no-referrer"
                    onError={() => setImageFailed(true)}
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <AltStatusPill status={suggestion?.status || 'empty'} />
                {suggestion ? <AltRiskBadge risk={suggestion.risk} /> : null}
                <AltLocationBadge location={row.image.location} />
                {suggestion ? (
                  <span className="rounded-full border border-border bg-white px-2 py-0.5 text-[10px] text-muted-foreground">
                    信心 {formatPercent(suggestion.confidence)} · {suggestion.provider || '—'}
                  </span>
                ) : null}
                {suggestion?.issues.length ? <AltIssueHint issues={suggestion.issues} /> : null}
              </div>

              <section className="space-y-2">
                <h3 className="text-[12px] font-semibold text-[#0d1a2d]">現有 ALT</h3>
                <p className="rounded-md border border-border bg-[#f8fafc] p-3 text-[12px] leading-relaxed text-muted-foreground">
                  {row.image.currentAlt || '（空白）'}
                </p>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[12px] font-semibold text-[#0d1a2d]">建議 ALT</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px]"
                    disabled={!(approved ? savedAlt : draftAlt)}
                    onClick={() => onCopy(approved ? savedAlt : draftAlt)}
                  >
                    <Copy size={11} />
                    複製
                  </Button>
                </div>
                <p className="rounded-md border border-teal-200 bg-[#f0fdfa] p-3 text-[13px] leading-relaxed text-[#0d1a2d]">
                  {approved
                    ? savedAlt || '（裝飾圖，alt=""）'
                    : draftAlt || (suggestion?.decorative ? '（裝飾圖，建議 alt=""）' : '尚未生成；可按下方「生成這張」。')}
                </p>
                <p className={cn('text-[10px]', Array.from(draftAlt).length > 125 ? 'text-rose-600' : 'text-muted-foreground')}>
                  {Array.from(draftAlt).length}/125 字元 · 目標 20–60 字（中文）
                </p>
              </section>

              {suggestion?.alternatives?.length ? (
                <section className="space-y-2">
                  <h3 className="text-[12px] font-semibold text-[#0d1a2d]">備選（點擊套用）</h3>
                  <div className="space-y-1.5">
                    {suggestion.alternatives.map((alternative) => (
                      <button
                        key={alternative}
                        type="button"
                        onClick={() => onSaveAlt(suggestion.id, alternative)}
                        className="w-full rounded-md border border-border bg-white p-2.5 text-left text-[12px] leading-relaxed text-[#0d1a2d] transition-colors hover:border-teal-300 hover:bg-[#f0fdfa]"
                      >
                        {alternative}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {suggestion?.rationale ? (
                <section className="space-y-2">
                  <h3 className="text-[12px] font-semibold text-[#0d1a2d]">為什麼這樣寫</h3>
                  <p className="rounded-md border border-border bg-[#f8fafc] p-3 text-[12px] leading-relaxed text-muted-foreground">
                    {suggestion.rationale}
                  </p>
                </section>
              ) : null}

              {suggestion?.issues?.length ? (
                <section className="space-y-2">
                  <h3 className="text-[12px] font-semibold text-[#0d1a2d]">品質提示</h3>
                  <ul className="space-y-1.5">
                    {suggestion.issues.map((issue, index) => (
                      <li
                        key={`${issue.id}-${index}`}
                        className={cn(
                          'rounded-md border px-3 py-2 text-[11px] leading-relaxed',
                          issue.severity === 'hard'
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700',
                        )}
                      >
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="space-y-2">
                <h3 className="text-[12px] font-semibold text-[#0d1a2d]">頁面上下文</h3>
                <div className="space-y-1.5 rounded-md border border-border bg-[#f8fafc] p-3 text-[11px] leading-relaxed text-muted-foreground">
                  <p>
                    <span className="text-[#0d1a2d]">圖片 URL：</span>
                    <span className="break-all">{row.image.url}</span>
                  </p>
                  {row.image.nearbyHeading ? (
                    <p>
                      <span className="text-[#0d1a2d]">最近標題：</span>
                      {row.image.nearbyHeading}
                    </p>
                  ) : null}
                  {row.image.nearbyCaption ? (
                    <p>
                      <span className="text-[#0d1a2d]">圖片 caption：</span>
                      {row.image.nearbyCaption}
                    </p>
                  ) : null}
                  {row.image.nearbyParagraph ? (
                    <p>
                      <span className="text-[#0d1a2d]">前一段文字：</span>
                      {row.image.nearbyParagraph}
                    </p>
                  ) : null}
                  {suggestion?.keyword ? (
                    <p>
                      <span className="text-[#0d1a2d]">本次關鍵字：</span>
                      {suggestion.keyword}
                    </p>
                  ) : null}
                </div>
              </section>
            </div>

            <div className="shrink-0 border-t border-border bg-white px-6 py-3">
              <div className="flex flex-wrap items-center justify-end gap-2">
                {suggestion ? (
                  <>
                    {approved ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 bg-white"
                        onClick={() => onUnapprove(suggestion.id)}
                        disabled={busy}
                      >
                        <Undo2 size={13} />
                        解除批准
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 bg-white text-muted-foreground"
                          onClick={() => onReject(suggestion.id)}
                          disabled={busy || suggestion.status === 'rejected'}
                        >
                          <X size={13} />
                          略過
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1.5 bg-[#0D9488] text-white hover:bg-[#0b8076]"
                          onClick={() => onApprove(suggestion.id, draftAlt)}
                          disabled={busy || (!draftAlt.trim() && !suggestion.decorative)}
                        >
                          <Check size={13} />
                          批准
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 bg-white"
                      onClick={() => onRegenerate(suggestion.id)}
                      disabled={busy}
                    >
                      <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
                      重新生成
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 bg-[#0D9488] text-white hover:bg-[#0b8076]"
                    onClick={() => onGenerateOne(row.image)}
                    disabled={busy}
                  >
                    <Sparkles size={13} />
                    生成這張
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
