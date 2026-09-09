import type { ReactNode } from 'react';
import { ArrowLeft, Download, Eye, Receipt, Save, ScrollText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  INCOME_PAYMENT_STATUS_LABELS,
  INCOME_PAYMENT_STATUS_STYLES,
  formatIncomeMoney,
  isIncomePaymentStatus,
} from '@/lib/quotationIncomes';
import { formatDocumentDate, formatDocumentMoney, type IncomeDocumentSnippet } from '@/lib/invoiceReceipts';

const KIND = {
  invoice: {
    save: 'bg-blue-600 hover:bg-blue-700',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: 'text-blue-600',
    total: 'text-blue-600',
    previewTitle: '發票預覽 Invoice Preview',
    saveLabel: '儲存發票',
    back: '返回項目',
  },
  receipt: {
    save: 'bg-emerald-600 hover:bg-emerald-700',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: 'text-emerald-600',
    total: 'text-emerald-600',
    previewTitle: '收據預覽 Receipt Preview',
    saveLabel: '儲存收據',
    back: '返回項目',
  },
} as const;

export function InvoiceReceiptEditorShell({
  title,
  documentNo,
  kind,
  income,
  floorBlocked,
  saving,
  onBack,
  onPreview,
  onDownload,
  onSave,
  form,
  summary,
}: {
  title: string;
  documentNo: string;
  kind: 'invoice' | 'receipt';
  income: IncomeDocumentSnippet | null;
  floorBlocked?: boolean;
  saving?: boolean;
  onBack: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onSave: () => void;
  form: ReactNode;
  summary: ReactNode;
}) {
  const theme = KIND[kind];
  const Icon = kind === 'invoice' ? ScrollText : Receipt;
  const status = income?.paymentStatus;
  const statusLabel = isIncomePaymentStatus(status) ? INCOME_PAYMENT_STATUS_LABELS[status] : status || '—';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={16} />
            {theme.back}
          </button>
          <span className="text-border">|</span>
          <Icon size={18} className={theme.icon} />
          <h2 className="text-[20px] font-bold truncate">
            {title}
            {documentNo ? ` #${documentNo}` : ''}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <GhostButton onClick={onPreview} disabled={floorBlocked}>
            <Eye size={14} /> 預覽 PDF
          </GhostButton>
          <GhostButton onClick={onDownload} disabled={floorBlocked || saving}>
            <Download size={14} /> 下載 PDF
          </GhostButton>
          <button
            type="button"
            onClick={onSave}
            disabled={floorBlocked || saving}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-white rounded-md text-[13px] font-medium disabled:opacity-40',
              theme.save,
            )}
          >
            <Save size={14} /> {saving ? '儲存中…' : theme.saveLabel}
          </button>
        </div>
      </div>

      {income && (
        <div className="rounded-md border border-border bg-white px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted-foreground">
          <span>期數 <strong className="text-foreground">#{income.installmentNo ?? '—'}</strong></span>
          <span>收入金額 <strong className="text-foreground">{formatIncomeMoney(income.amount ?? 0)}</strong></span>
          <span>類型 <strong className="text-foreground">{income.type || '—'}</strong></span>
          <span className="inline-flex items-center gap-1.5">
            收款狀態
            <span
              className={cn(
                'inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border',
                isIncomePaymentStatus(status) ? INCOME_PAYMENT_STATUS_STYLES[status] : 'border-border bg-muted',
              )}
            >
              {statusLabel}
            </span>
          </span>
        </div>
      )}

      {floorBlocked && (
        <p className="text-[13px] text-rose-600">
          主項目與附加項目合計須至少等於相關收入金額。請用折扣把發票淨額降至收入金額以下。
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        <div className="space-y-4 min-w-0">{form}</div>
        <div className="xl:sticky xl:top-4 space-y-4">{summary}</div>
      </div>
    </div>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-[13px] font-medium bg-white hover:bg-muted/50 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function EditorCard({
  title,
  subtitle,
  extra,
  children,
}: {
  title: string;
  subtitle?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-[#0d1a2d]">
          {title}
          {subtitle ? <span className="ml-1.5 font-normal text-muted-foreground">{subtitle}</span> : null}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="text-[12px] text-muted-foreground block mb-1.5">{children}</label>;
}

export const editorInputClass =
  'bg-muted/40 border-transparent shadow-none focus-visible:bg-white focus-visible:border-input';

export function DocumentPreviewModal({
  kind,
  url,
  onClose,
  onDownload,
}: {
  kind: 'invoice' | 'receipt';
  url: string;
  onClose: () => void;
  onDownload: () => void;
}) {
  const theme = KIND[kind];
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#525659]">
      <div className="flex items-center justify-between gap-3 bg-white px-4 py-2.5 border-b border-border">
        <h2 className="text-[15px] font-semibold">{theme.previewTitle}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-[13px] hover:bg-muted/50"
          >
            <Download size={14} /> 下載 PDF
          </button>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-muted" aria-label="關閉預覽">
            <X size={16} />
          </button>
        </div>
      </div>
      <iframe title={theme.previewTitle} src={url} className="flex-1 w-full bg-[#525659]" />
    </div>
  );
}

export function DocumentSummaryCard({
  kind,
  title,
  rows,
  totalLabel,
  totalValue,
  meta,
  floorBlocked,
  saving,
  onSave,
  onPreview,
  onDownload,
}: {
  kind: 'invoice' | 'receipt';
  title: string;
  rows: Array<{ label: string; value: string; danger?: boolean }>;
  totalLabel: string;
  totalValue: string;
  meta: Array<{ label: string; value: string }>;
  floorBlocked?: boolean;
  saving?: boolean;
  onSave: () => void;
  onPreview: () => void;
  onDownload: () => void;
}) {
  const theme = KIND[kind];
  return (
    <section className="bg-white rounded-lg border border-[rgba(13,26,45,0.08)] shadow-card p-5 space-y-4">
      <h3 className="text-[14px] font-semibold text-[#0d1a2d]">{title}</h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className={cn('flex justify-between text-[13px]', row.danger && 'text-rose-600')}>
            <span className="text-muted-foreground">{row.label}</span>
            <span className="tabular-nums">{row.value}</span>
          </div>
        ))}
        <div className="flex justify-between items-baseline pt-3 mt-1 border-t border-border">
          <span className="text-[14px] font-semibold">{totalLabel}</span>
          <span className={cn('text-[22px] font-bold tabular-nums', theme.total)}>{totalValue}</span>
        </div>
      </div>
      <div className="text-[12px] text-muted-foreground space-y-1 leading-relaxed">
        {meta.map((item) => (
          <div key={item.label}>
            {item.label}：{item.value || '—'}
          </div>
        ))}
      </div>
      <div className="space-y-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          disabled={floorBlocked || saving}
          className={cn(
            'w-full py-2.5 rounded-md text-white text-[13px] font-medium disabled:opacity-40',
            theme.save,
          )}
        >
          {saving ? '儲存中…' : theme.saveLabel}
        </button>
        <button
          type="button"
          onClick={onPreview}
          disabled={floorBlocked}
          className="w-full py-2 rounded-md border border-border text-[13px] font-medium hover:bg-muted/50 disabled:opacity-40"
        >
          預覽 PDF
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={floorBlocked || saving}
          className="w-full py-2 rounded-md border border-border text-[13px] font-medium hover:bg-muted/50 disabled:opacity-40"
        >
          下載 PDF
        </button>
      </div>
    </section>
  );
}

export function formatSummaryDate(value: string) {
  return formatDocumentDate(value);
}

export function moneyOrMask(amount: number) {
  return formatDocumentMoney(amount);
}
