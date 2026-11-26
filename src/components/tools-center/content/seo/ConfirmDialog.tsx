/**
 * Confirm 面板（M3-07；PRD §8.2.5、§9.3.3）
 *
 * Confirm = 批准 + 排定發布（不是立即發布）。本面板必須一次說清楚：
 *   站點／欄目／語言、標題／slug／字數、封面與內文圖、發佈時間（站點時區）、
 *   發佈模式（manual／draft／direct）、硬檢查結果、是否更新既有文章、不可逆提示。
 *
 * 規則：
 *   - 硬檢查未過 → 按鈕禁用，並逐條列出原因（blockingReasons，與後端同一支函式）。
 *   - `publish_at` 已過超過 2 小時 → 以 findNextPublishAt 算下一個空 slot，
 *     並在面板明示「將排到下一個空 slot」；2 小時內則視為立即發布。
 *   - 時間調整一律以「站點時區」輸入，送出前再轉回 UTC ISO。
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  Globe2,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type {
  ContentArticle,
  ContentAsset,
  ContentKeyword,
  ContentQaReport,
  ContentSiteSection,
  ContentSiteWithProfile,
  ContentSlot,
} from '@/lib/contentTypes.ts';
import { blockingReasons } from '@/lib/contentSeoQa.ts';
import {
  DEFAULT_CADENCE,
  HONG_KONG_TIME_ZONE,
  addHours,
  formatZoneDateTime,
  normalizeSlug,
  parseIsoSafe,
} from '@/lib/contentFormat.ts';
import {
  findNextPublishAt,
  fromZoneInputValue,
  normalizeCadence,
  toZoneInputValue,
} from '@/lib/contentPlanner.ts';
import { ADAPTER_REQUIRES_COVER, PUBLISH_MODE_LABEL } from '@/lib/contentState.ts';
import {
  BEAUTY100_CATEGORY_LABEL,
  beauty100ArticleUrl,
  beauty100CategoryForSection,
} from '@/lib/contentBeauty100.ts';
import { contentErrorMessage } from '@/lib/contentApi.ts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ContentStatusPill } from '../shell/ContentStatusPill';

const TWO_HOURS_MS = 2 * 3_600_000;

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: ContentArticle;
  site: ContentSiteWithProfile | null;
  section: ContentSiteSection | null;
  keyword: ContentKeyword | null;
  slot: ContentSlot | null;
  coverAsset: ContentAsset | null;
  coverUrl: string | null;
  imageAssets: ContentAsset[];
  imageUrls: Record<string, string>;
  qa: ContentQaReport;
  /** 同站其他文章的 slug（判斷是否會更新既有文章） */
  existingSlugs: string[];
  submitting?: boolean;
  onConfirm: (input: { expectedVersion: number; scheduledPublishAt: string }) => Promise<void>;
}

interface InitialPublishPlan {
  /** datetime-local 值（站點時區） */
  value: string;
  /** 逾期順延等提示 */
  note: string | null;
  /** 下一個空 slot（UTC ISO），供使用者一鍵套用 */
  nextAvailableIso: string | null;
}

function buildInitialPublishPlan(
  article: ContentArticle,
  slot: ContentSlot | null,
  site: ContentSiteWithProfile | null,
): InitialPublishPlan {
  const timezone = site?.timezone?.trim() || HONG_KONG_TIME_ZONE;
  const cadence = normalizeCadence(site?.cadence ?? DEFAULT_CADENCE);
  const now = new Date();
  const baseIso = slot?.publish_at ?? article.scheduled_publish_at ?? null;
  const baseDate = parseIsoSafe(baseIso);
  const nextAvailableIso = findNextPublishAt(cadence, timezone, now);

  if (baseDate) {
    const overTwoHours = now.getTime() - baseDate.getTime() > TWO_HOURS_MS;
    if (overTwoHours) {
      const nextIso = nextAvailableIso ?? addHours(now, 1).toISOString();
      return {
        value: toZoneInputValue(nextIso, timezone),
        note:
          `原定發佈時間 ${formatZoneDateTime(baseDate.toISOString(), timezone)} 已過去超過 2 小時；` +
          `將排到下一個空 slot：${formatZoneDateTime(nextIso, timezone)}（站點時區 ${timezone}）。`,
        nextAvailableIso,
      };
    }
    return { value: toZoneInputValue(baseDate.toISOString(), timezone), note: null, nextAvailableIso };
  }

  const fallbackIso = nextAvailableIso ?? addHours(now, 1).toISOString();
  return {
    value: toZoneInputValue(fallbackIso, timezone),
    note: nextAvailableIso
      ? '尚未排程，已帶入站點 cadence 的下一個發佈時段。'
      : '尚未排程，找不到 cadence 時段，暫以 1 小時後為預設值。',
    nextAvailableIso,
  };
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[12.5px] leading-relaxed text-[#0d1a2d]">{children}</div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  article,
  site,
  section,
  keyword,
  slot,
  coverAsset,
  coverUrl,
  imageAssets,
  imageUrls,
  qa,
  existingSlugs,
  submitting = false,
  onConfirm,
}: ConfirmDialogProps) {
  const timezone = site?.timezone?.trim() || HONG_KONG_TIME_ZONE;
  const initialPlan = useMemo(
    () => buildInitialPublishPlan(article, slot, site),
    // 只在開啟或文章版本變更時重算，避免使用者正在編輯時間時被覆蓋
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, article.id, article.version, slot?.id, slot?.publish_at, site?.timezone],
  );

  const [publishInput, setPublishInput] = useState(initialPlan.value);
  const [initialNote, setInitialNote] = useState<string | null>(initialPlan.note);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPublishInput(initialPlan.value);
    setInitialNote(initialPlan.note);
    setSubmitError(null);
  }, [open, initialPlan]);

  const hardPassed = qa.hardPassed;
  const reasons = blockingReasons(qa);
  const wordCount = qa.wordCount;
  const siteName = site?.profile?.website_name ?? article.site_id;
  const domain = site?.profile?.domain_url ?? null;
  const language = article.language || site?.locale || '—';
  const publishMode = site?.publish_mode ?? 'manual';
  const isBeauty100 = site?.adapter === 'beauty100';
  const beauty100Category = beauty100CategoryForSection(section);
  const beauty100Url = isBeauty100
    ? beauty100ArticleUrl(domain, beauty100Category, article.slug)
    : null;
  const needsCover = Boolean(
    site &&
      publishMode !== 'manual' &&
      ADAPTER_REQUIRES_COVER[site.adapter] &&
      !article.cover_asset_id,
  );
  const siteInactive = Boolean(site && publishMode !== 'manual' && site.status !== 'active');

  const existingSlugSet = useMemo(
    () => new Set(existingSlugs.map((slug) => normalizeSlug(slug)).filter(Boolean)),
    [existingSlugs],
  );
  const updatesExistingArticle =
    existingSlugSet.has(normalizeSlug(article.slug)) || Boolean(article.external_id);

  const scheduledIso = useMemo(() => fromZoneInputValue(publishInput, timezone), [publishInput, timezone]);
  const scheduledDate = scheduledIso ? new Date(scheduledIso) : null;
  const now = Date.now();
  const tooFarInPast = Boolean(scheduledDate && scheduledDate.getTime() < now - TWO_HOURS_MS);
  const withinTwoHoursPast = Boolean(
    scheduledDate && scheduledDate.getTime() < now && scheduledDate.getTime() >= now - TWO_HOURS_MS,
  );

  const disabledReason = !hardPassed
    ? `硬檢查有 ${reasons.length} 項未過`
    : needsCover
      ? 'Beauty100 發佈必須先有封面圖（請先在工作室產生或上傳封面）'
      : siteInactive
        ? '站點不是 active，不能排程自動發佈'
        : !scheduledIso
          ? '發佈時間格式不正確'
          : tooFarInPast
            ? '發佈時間已過去超過 2 小時，請改用下一個空 slot'
            : null;

  const canSubmit = !disabledReason && !busy && !submitting;

  const applyNextAvailable = () => {
    const nextIso =
      initialPlan.nextAvailableIso ??
      findNextPublishAt(normalizeCadence(site?.cadence ?? DEFAULT_CADENCE), timezone, new Date());
    if (!nextIso) {
      toast.error('站點 cadence 算不出下一個時段，請手動選擇時間。');
      return;
    }
    setPublishInput(toZoneInputValue(nextIso, timezone));
    setInitialNote(`已改排到下一個空 slot：${formatZoneDateTime(nextIso, timezone)}。`);
  };

  const handleSubmit = async () => {
    if (!scheduledIso) {
      setSubmitError('發佈時間格式不正確（請用站點時區的 YYYY-MM-DD HH:mm）。');
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      await onConfirm({
        expectedVersion: article.version,
        scheduledPublishAt: scheduledIso,
      });
    } catch (error) {
      const message = contentErrorMessage(error);
      setSubmitError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!busy ? onOpenChange(next) : undefined)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[17px]">
            <ShieldCheck size={18} className="text-teal-600" />
            批准並排定
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Confirm = 批准這篇並排入發佈佇列，不是立即發布。送出前請確認以下所有項目。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* 站點／欄目／語言 */}
          <div className="grid grid-cols-2 gap-3 rounded-md border border-[rgba(13,26,45,0.08)] bg-slate-50/60 p-3 sm:grid-cols-4">
            <Field label="站點">
              <span className="font-semibold">{siteName}</span>
              {domain && <span className="ml-1 text-[11px] text-muted-foreground">{domain}</span>}
            </Field>
            <Field label="欄目">{section?.name ?? '—'}</Field>
            <Field label="語言">{language}</Field>
            <Field label="關鍵字">{keyword?.keyword ?? '—'}</Field>
          </div>

          {/* 文章資料 + 封面 */}
          <div className="flex gap-3 rounded-md border border-[rgba(13,26,45,0.08)] p-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Field label="標題">
                <span className="line-clamp-2 text-[13.5px] font-semibold">{article.title || '（未命名）'}</span>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="網址代稱">
                  <span className="break-all font-mono text-[11.5px]">/{article.slug || '—'}</span>
                </Field>
                <Field label="字數">
                  <span className="tabular-nums">{wordCount} 字</span>
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    （版本 v{article.version}）
                  </span>
                </Field>
              </div>
              <Field label="發佈模式">
                <span className="inline-flex items-center gap-1.5">
                  <ContentStatusPill
                    label={PUBLISH_MODE_LABEL[publishMode] ?? publishMode}
                    tone={publishMode === 'manual' ? 'indigo' : publishMode === 'draft' ? 'blue' : 'teal'}
                    dot={false}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {publishMode === 'manual'
                      ? '到點產內容包，人工貼上後回填 URL（manual_done）'
                      : publishMode === 'draft'
                        ? '到點由 adapter 建立草稿（draft_published）'
                        : isBeauty100
                          ? '到點由 adapter 直接公開到 Beauty100，並自動驗證'
                          : '到點由 adapter 直接公開（published）'}
                  </span>
                </span>
              </Field>
              {isBeauty100 && (
                <Field label="Beauty100 目標分類">
                  <span className="font-semibold">
                    {beauty100Category}（{BEAUTY100_CATEGORY_LABEL[beauty100Category]}）
                  </span>
                  <span className="ml-1 break-all font-mono text-[11px] text-muted-foreground">
                    {beauty100Url ?? '/topics/{handle}'}
                  </span>
                </Field>
              )}
              <Field label="是否更新既有文章">
                {updatesExistingArticle ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-700">
                    <AlertTriangle size={12} strokeWidth={2.2} />
                    是：站內已有同 slug／external_id，Confirm 會沿用既有文章；Beauty100 若 slug 相同但標題不同會拒絕，請先改 slug
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700">
                    <CheckCircle2 size={12} strokeWidth={2.2} />
                    否：會建立新文章
                  </span>
                )}
              </Field>
            </div>

            <div className="w-[176px] shrink-0">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">封面</div>
              <div className="mt-1 aspect-video w-full overflow-hidden rounded border border-[rgba(13,26,45,0.08)] bg-slate-100">
                {coverUrl ? (
                  <img src={coverUrl} alt={coverAsset?.alt ?? article.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-400">
                    <ImageIcon size={18} strokeWidth={1.5} />
                    <span className="text-[10.5px]">未設定封面</span>
                  </div>
                )}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {coverAsset ? `${coverAsset.width ?? '?'}×${coverAsset.height ?? '?'} · ${coverAsset.source}` : '無'}
              </div>
              {imageAssets.length > 0 && (
                <div className="mt-1.5">
                  <div className="text-[10px] text-muted-foreground">內文圖 {imageAssets.length} 張</div>
                  <div className="mt-0.5 flex gap-1 overflow-hidden">
                    {imageAssets.slice(0, 3).map((asset) => (
                      <div
                        key={asset.id}
                        className="h-8 w-12 shrink-0 overflow-hidden rounded border border-[rgba(13,26,45,0.08)] bg-slate-100"
                      >
                        {imageUrls[asset.id] ? (
                          <img src={imageUrls[asset.id]} alt={asset.alt ?? ''} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 發佈時間 */}
          <div className="rounded-md border border-[rgba(13,26,45,0.08)] p-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#0d1a2d]">
                  <CalendarClock size={13} className="text-teal-600" strokeWidth={2} />
                  發佈時間（站點時區 {timezone}）
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  原定 slot：{slot?.publish_at ? formatZoneDateTime(slot.publish_at, timezone) : '無（尚未排程）'}
                  {slot?.status ? ` · ${slot.status}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  value={publishInput}
                  onChange={(event) => {
                    setPublishInput(event.target.value);
                    setInitialNote(null);
                    setSubmitError(null);
                  }}
                  disabled={busy}
                  className="h-8 w-[200px] text-[12px]"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={applyNextAvailable}
                  className="h-8 px-2 text-[11px]"
                >
                  下一個空 slot
                </Button>
              </div>
            </div>

            {scheduledIso && (
              <div className="mt-2 rounded bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
                送出時間（UTC）：
                <span className="ml-1 font-mono text-[10.5px]">{scheduledIso}</span>
                <span className="ml-2 text-muted-foreground">
                  站點時間：{formatZoneDateTime(scheduledIso, timezone)}
                </span>
              </div>
            )}

            {initialNote && (
              <div className="mt-2 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50/70 px-2 py-1.5 text-[11px] leading-relaxed text-amber-800">
                <AlertTriangle size={12} className="mt-[1px] shrink-0" strokeWidth={2.2} />
                <span>{initialNote}</span>
              </div>
            )}
            {withinTwoHoursPast && (
              <div className="mt-2 flex items-start gap-1.5 rounded border border-blue-200 bg-blue-50/70 px-2 py-1.5 text-[11px] leading-relaxed text-blue-800">
                <Globe2 size={12} className="mt-[1px] shrink-0" strokeWidth={2.2} />
                <span>時間已過但在 2 小時內，依 PRD §9.3.3 視為「立即發布」。</span>
              </div>
            )}
            {tooFarInPast && (
              <div className="mt-2 flex items-start gap-1.5 rounded border border-rose-200 bg-rose-50/70 px-2 py-1.5 text-[11px] leading-relaxed text-rose-700">
                <AlertTriangle size={12} className="mt-[1px] shrink-0" strokeWidth={2.2} />
                <span>時間已過去超過 2 小時；請按「下一個空 slot」或手動改到未來，否則無法 Confirm。</span>
              </div>
            )}
          </div>

          {/* 硬檢查 */}
          <div className="rounded-md border border-[rgba(13,26,45,0.08)] p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#0d1a2d]">
                {hardPassed ? (
                  <ShieldCheck size={13} className="text-emerald-600" strokeWidth={2} />
                ) : (
                  <ShieldAlert size={13} className="text-rose-600" strokeWidth={2} />
                )}
                硬檢查（{qa.hard.filter((check) => check.passed).length}/{qa.hard.length} 通過）
              </div>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10.5px] font-bold',
                  hardPassed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
                )}
              >
                {hardPassed ? '可 Confirm' : '阻擋'}
              </span>
            </div>
            <div className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {qa.hard.map((check) => (
                <div key={check.id} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed">
                  {check.passed ? (
                    <CheckCircle2 size={12} className="mt-[2px] shrink-0 text-emerald-600" strokeWidth={2.2} />
                  ) : (
                    <XCircle size={12} className="mt-[2px] shrink-0 text-rose-600" strokeWidth={2.2} />
                  )}
                  <span className={cn('min-w-0', check.passed ? 'text-slate-600' : 'font-medium text-rose-700')}>
                    {check.label}
                    <span className="ml-1 text-[10.5px] text-muted-foreground">{check.detail}</span>
                  </span>
                </div>
              ))}
            </div>
            {!hardPassed && (
              <ul className="mt-2 list-disc space-y-0.5 rounded border border-rose-200 bg-rose-50/60 px-2 py-1.5 pl-6 text-[11px] leading-relaxed text-rose-700">
                {reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>

          {/* 不可逆提示 */}
          <div className="rounded-md border border-rose-200 bg-rose-50/50 p-3">
            <div className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-rose-800">
              <AlertTriangle size={13} className="mt-[1px] shrink-0" strokeWidth={2.2} />
              <div className="space-y-1">
                <p className="font-semibold">送出後的行為不可逆，請再確認一次：</p>
                <p>
                  · 文章狀態會由 <code className="rounded bg-white/70 px-1">pending_review</code> 進入批准／排程；
                  到點後由 worker 依發佈模式產內容包或發布，並寫入發佈回執。
                </p>
                <p>
                  · 手動模式仍需人工貼上官網並回填 URL，系統會標「已手動上線」，
                  不會顯示為自動發布。
                </p>
                <p>
                  · Beauty100 會由專用帳號直接寫入官網文章，並用 REST 重新讀取驗證；
                  沒有封面或未批准會在後端被擋下。
                </p>
                <p>· 同一版本重複 Confirm 具冪等鍵保護，不會重建文章。</p>
              </div>
            </div>
          </div>

          {submitError && (
            <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-[11.5px] leading-relaxed text-rose-700">
              {submitError}
            </div>
          )}

          {!hardPassed && (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <FileText size={11} />
              請回到工作室修好硬檢查項目後再 Confirm；後端也會重驗，繞過前端不會成功。
            </p>
          )}

          {disabledReason && hardPassed && (
            <p className="flex items-center gap-1 text-[11px] text-amber-700">
              <AlertTriangle size={11} />
              {disabledReason}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            title={disabledReason ?? undefined}
            onClick={() => void handleSubmit()}
            className="gap-1.5 bg-teal-600 hover:bg-teal-700"
          >
            {busy || submitting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            確認並排定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
