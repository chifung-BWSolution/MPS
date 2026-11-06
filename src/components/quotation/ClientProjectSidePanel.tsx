import { useMemo, useState } from 'react';
import { CalendarDays, ExternalLink, Link2, Wallet } from 'lucide-react';
import { localTodayIso } from '@/data/pitchingData';
import { CompletionPhotoPreview } from '@/components/quotation/CompletionPhotosSection';
import { useQuotationDocs } from '@/hooks/useQuotationDocs';
import { useQuotationIncomes } from '@/hooks/useQuotationIncomes';
import { useSchedules } from '@/hooks/useSchedules';
import { cn } from '@/lib/utils';
import {
  BILLING_STATUS_SHORT_LABELS,
  billingStillShort,
  buildBillingBrief,
  buildKeyDateRows,
  deliverableExtraLabel,
  deliverablePhotoPreview,
  deliverablesSectionVisible,
  hasMediaPublications,
  type BillingBriefRow,
  type KeyDateRow,
} from '@/lib/clientProjectSidePanel';
import type { MediaPublication } from '@/lib/mediaPublications';
import { completionPhotosFromDocs } from '@/lib/quotationDocs';
import {
  INCOME_PAYMENT_STATUS_STYLES,
  formatIncomeMoney,
} from '@/lib/quotationIncomes';
import type { ServicePeriods } from '@/lib/servicePeriods';

function SectionHeading({
  icon: Icon,
  title,
  meta,
}: {
  icon: typeof CalendarDays;
  title: string;
  meta?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-md bg-teal-50 flex items-center justify-center shrink-0">
          <Icon size={14} className="text-teal-700" />
        </div>
        <h3 className="text-[13px] font-semibold">{title}</h3>
      </div>
      {meta ? <span className="text-[11px] text-muted-foreground shrink-0">{meta}</span> : null}
    </div>
  );
}

function KeyDateLine({ row }: { row: KeyDateRow }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-[12px] text-muted-foreground leading-5 min-w-0">{row.label}</span>
      <span className="text-[12px] font-medium tabular-nums shrink-0 leading-5">{row.date}</span>
    </div>
  );
}

function NextBillingCallout({ row }: { row: BillingBriefRow }) {
  const partial = billingStillShort(row);
  return (
    <div
      className={cn(
        'rounded-md px-3 py-3 mb-3',
        row.overdue ? 'bg-rose-50 border border-rose-100' : 'bg-teal-50 border border-teal-100',
      )}
    >
      <p className={cn('text-[11px] font-medium', row.overdue ? 'text-rose-800' : 'text-teal-800')}>
        {row.overdue ? '下一筆收款 · 已逾期' : '下一筆收款'}
      </p>
      <p className="text-[18px] font-bold tabular-nums mt-1 leading-none">
        {row.dueDate ?? '未設定到期日'}
      </p>
      <p className="text-[14px] font-semibold mt-1.5">{formatIncomeMoney(row.billedAmount, row.currency)}</p>
      {partial ? (
        <p className="text-[11px] text-muted-foreground mt-0.5">
          尚欠 {formatIncomeMoney(row.outstanding, row.currency)}
        </p>
      ) : null}
      <p className="text-[12px] text-muted-foreground mt-1">{row.label}</p>
    </div>
  );
}

function BillingLine({ row }: { row: BillingBriefRow }) {
  const detail = [
    row.dueDate,
    formatIncomeMoney(row.billedAmount, row.currency),
    row.overdue ? '已逾期' : '',
  ].filter(Boolean).join(' · ');

  return (
    <li
      className={cn(
        'rounded-md px-2.5 py-2',
        row.isNext ? 'bg-teal-50 ring-1 ring-inset ring-teal-200' : '',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium leading-5 min-w-0">{row.label}</p>
        {row.paymentStatus ? (
          <span
            className={cn(
              'shrink-0 text-[10px] leading-4 px-1.5 py-0.5 rounded border',
              INCOME_PAYMENT_STATUS_STYLES[row.paymentStatus],
            )}
          >
            {BILLING_STATUS_SHORT_LABELS[row.paymentStatus]}
          </span>
        ) : null}
      </div>
      {detail ? <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">{detail}</p> : null}
    </li>
  );
}

export function ClientProjectSidePanel({
  projectId,
  inquiryDate,
  signedDate,
  handoverDate,
  contractStartDate,
  contractEndDate,
  servicePeriods,
  mediaPublications,
}: {
  projectId: string;
  inquiryDate?: string | null;
  signedDate?: string | null;
  handoverDate?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  servicePeriods?: ServicePeriods | null;
  mediaPublications?: readonly MediaPublication[] | null;
}) {
  const {
    rows: schedules,
    loading: schedulesLoading,
    error: schedulesError,
  } = useSchedules('quotation_client', projectId);
  const {
    rows: incomes,
    loading: incomesLoading,
    error: incomesError,
  } = useQuotationIncomes(projectId);
  const {
    rows: docs,
    error: photosError,
  } = useQuotationDocs(projectId);
  const [photoPreviewIndex, setPhotoPreviewIndex] = useState<number | null>(null);

  const keyDates = useMemo(
    () => buildKeyDateRows(
      {
        inquiryDate,
        signedDate,
        handoverDate,
        contractStartDate,
        contractEndDate,
        servicePeriods,
      },
      schedules,
    ),
    [
      inquiryDate,
      signedDate,
      handoverDate,
      contractStartDate,
      contractEndDate,
      servicePeriods,
      schedules,
    ],
  );
  const projectDates = keyDates.filter((row) => row.kind === 'project');
  const scheduleDates = keyDates.filter((row) => row.kind === 'schedule');

  const billing = useMemo(
    () => buildBillingBrief(incomes, localTodayIso()),
    [incomes],
  );
  const publications = useMemo(
    () => (hasMediaPublications(mediaPublications)
      ? (mediaPublications ?? []).filter((item) => item.url.trim())
      : []),
    [mediaPublications],
  );
  const photos = useMemo(
    () => completionPhotosFromDocs(docs).filter((photo) => photo.fileUrl.trim()),
    [docs],
  );
  const photoPreview = useMemo(() => deliverablePhotoPreview(photos), [photos]);
  const showDeliverables = deliverablesSectionVisible(publications.length > 0, photos.length) || Boolean(photosError);

  return (
    <aside className="w-full xl:w-[300px] shrink-0 xl:sticky xl:top-[calc(48px+var(--app-banner-h))] xl:self-start xl:max-h-[calc(100vh-48px-var(--app-banner-h)-1.5rem)] xl:overflow-y-auto">
      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card divide-y divide-[rgba(13,26,45,0.08)]">
        <section className="px-4 py-4">
          <SectionHeading
            icon={CalendarDays}
            title="關鍵日期"
            meta={keyDates.length > 0 ? `${keyDates.length} 項` : undefined}
          />
          {projectDates.length === 0 && scheduleDates.length === 0 && !schedulesLoading ? (
            <p className="text-[12px] text-muted-foreground">尚無關鍵日期</p>
          ) : (
            <div>
              {projectDates.map((row) => <KeyDateLine key={row.id} row={row} />)}
              {scheduleDates.length > 0 && (
                <div className={projectDates.length > 0 ? 'mt-2 pt-2 border-t border-[rgba(13,26,45,0.06)]' : undefined}>
                  <p className="text-[11px] font-medium text-muted-foreground mb-0.5">排程</p>
                  {scheduleDates.map((row) => <KeyDateLine key={row.id} row={row} />)}
                </div>
              )}
              {schedulesLoading && scheduleDates.length === 0 && (
                <p className="text-[12px] text-muted-foreground pt-1">載入排程中…</p>
              )}
            </div>
          )}
          {schedulesError && (
            <p className="text-[12px] text-amber-800 mt-2">無法載入排程：{schedulesError}</p>
          )}
        </section>

        <section className="px-4 py-4">
          <SectionHeading
            icon={Wallet}
            title="收款資料"
            meta={billing.rows.length > 0 ? `${billing.rows.length} 筆` : undefined}
          />
          {incomesError && (
            <p className="text-[12px] text-amber-800 mb-2">無法載入收款：{incomesError}</p>
          )}
          {incomesLoading && billing.rows.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">載入收款資料中…</p>
          ) : billing.rows.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">尚未建立收款資料</p>
          ) : (
            <>
              {billing.next ? (
                <NextBillingCallout row={billing.next} />
              ) : (
                <p className="text-[12px] text-emerald-700 mb-3">已全部收款</p>
              )}
              <ul className="space-y-1 max-h-[280px] overflow-y-auto">
                {billing.rows.map((row) => <BillingLine key={row.id} row={row} />)}
              </ul>
            </>
          )}
        </section>

        {showDeliverables && (
          <section className="px-4 py-4">
            <SectionHeading
              icon={Link2}
              title="成果輸出"
              meta={publications.length > 0 ? `${publications.length} 項` : undefined}
            />
            {photosError && (
              <p className="text-[12px] text-amber-800 mb-2">無法載入完工相片：{photosError}</p>
            )}
            {photoPreview.visible.length > 0 && (
              <div className={cn('flex items-center gap-2', publications.length > 0 && 'mb-3')}>
                {photoPreview.visible.map((photo, index) => (
                  <button
                    key={photo.id}
                    type="button"
                    aria-label={`預覽 ${photo.fileName}`}
                    onClick={() => setPhotoPreviewIndex(index)}
                    className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-[rgba(13,26,45,0.08)] bg-muted"
                  >
                    <img
                      src={photo.fileUrl}
                      alt={photo.fileName}
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
                {photoPreview.extraCount > 0 && (
                  <button
                    type="button"
                    aria-label={`還有 ${photoPreview.extraCount} 張完工相片`}
                    onClick={() => setPhotoPreviewIndex(photoPreview.visible.length)}
                    className="shrink-0 px-0.5 text-[12px] font-medium tabular-nums text-muted-foreground hover:text-teal-800"
                  >
                    {deliverableExtraLabel(photoPreview.extraCount)}
                  </button>
                )}
              </div>
            )}
            {publications.length > 0 && (
              <ul className="space-y-2">
                {publications.map((item) => (
                  <li key={item.id}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start gap-1.5 text-[12px] text-teal-700 hover:text-teal-800 break-all"
                    >
                      <ExternalLink size={12} className="mt-0.5 shrink-0" />
                      <span>{item.url}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <CompletionPhotoPreview
          photos={photos}
          index={photoPreviewIndex}
          onIndexChange={setPhotoPreviewIndex}
        />
      </div>
    </aside>
  );
}
