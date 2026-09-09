import { Building2 } from 'lucide-react';
import { FieldLabel } from '@/components/quotation/InvoiceReceiptEditorShell';
import { Checkbox } from '@/components/ui/checkbox';
import {
  applySlotSourceChange,
  applySlotVisibility,
  slotSourceId,
  type CompanyBrandingSource,
  type PdfBranding,
  type PdfBrandingSlotKey,
} from '@/lib/pdfBranding';
import { cn } from '@/lib/utils';

type Accent = 'blue' | 'emerald';

const ACCENT: Record<Accent, { box: string; title: string; hint: string }> = {
  blue: {
    box: 'border-blue-100 bg-blue-50/40',
    title: 'text-blue-600',
    hint: 'text-blue-400',
  },
  emerald: {
    box: 'border-emerald-100 bg-emerald-50/40',
    title: 'text-emerald-600',
    hint: 'text-emerald-400',
  },
};

function companyLabel(company: CompanyBrandingSource) {
  return company.code || company.chineseDisplay || company.display || company.id.slice(0, 8);
}

function SourceSelect({
  value,
  companies,
  onChange,
}: {
  value: string;
  companies: CompanyBrandingSource[];
  onChange: (id: string) => void;
}) {
  return (
    <select
      className="h-7 w-[120px] shrink-0 rounded-md border border-border bg-white px-2 text-[11px]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {companies.map((company) => (
        <option key={company.id} value={company.id}>
          {companyLabel(company)}
        </option>
      ))}
    </select>
  );
}

export function PdfBrandingFields({
  branding,
  companies,
  primaryId,
  accent = 'blue',
  showPaymentInfo = true,
  onChange,
}: {
  branding: PdfBranding;
  companies: CompanyBrandingSource[];
  primaryId: string | null;
  accent?: Accent;
  showPaymentInfo?: boolean;
  onChange: (next: PdfBranding) => void;
}) {
  const colors = ACCENT[accent];

  const setVisible = (key: PdfBrandingSlotKey, visible: boolean) => {
    onChange(applySlotVisibility(branding, key, visible));
  };
  const setSource = (key: PdfBrandingSlotKey, sourceId: string) => {
    onChange(applySlotSourceChange(branding, key, sourceId || null, companies));
  };

  return (
    <div className={cn('rounded-lg border p-3 space-y-3', colors.box)}>
      <p className={cn('text-[13px] font-semibold', colors.title)}>
        <Building2 className="w-3 h-3 inline mr-1" />
        已選公司自動填入資料
        <span className={cn('ml-2 font-normal text-[11px]', colors.hint)}>
          勾選項目會顯示於 PDF；來源可改為其他公司
        </span>
      </p>

      <div className="space-y-3">
        <BrandingRow
          visible={branding.companyName.visible}
          onVisible={(v) => setVisible('companyName', v)}
          source={slotSourceId(branding, 'companyName', primaryId)}
          companies={companies}
          onSource={(id) => setSource('companyName', id)}
        >
          <p className="text-[12px] text-muted-foreground">公司名稱</p>
          <p className="font-medium text-[13px] text-foreground">{branding.companyName.value.display || 'N/A'}</p>
          {branding.companyName.value.chineseDisplay ? (
            <p className="text-[12px] text-muted-foreground">{branding.companyName.value.chineseDisplay}</p>
          ) : null}
        </BrandingRow>

        <BrandingRow
          visible={branding.companyLogo.visible}
          onVisible={(v) => setVisible('companyLogo', v)}
          source={slotSourceId(branding, 'companyLogo', primaryId)}
          companies={companies}
          onSource={(id) => setSource('companyLogo', id)}
        >
          <div className="flex items-start gap-2">
            {branding.companyLogo.value.url ? (
              <img
                src={branding.companyLogo.value.url}
                alt="Logo"
                className="h-8 w-auto object-contain rounded border bg-white p-0.5"
              />
            ) : null}
            <div>
              <p className="text-[12px] text-muted-foreground">公司 Logo</p>
              <p className="font-medium text-[13px]">{branding.companyLogo.value.url ? '已設定' : '未設定'}</p>
            </div>
          </div>
        </BrandingRow>

        <BrandingRow
          visible={branding.companyChop.visible}
          onVisible={(v) => setVisible('companyChop', v)}
          source={slotSourceId(branding, 'companyChop', primaryId)}
          companies={companies}
          onSource={(id) => setSource('companyChop', id)}
        >
          <div className="flex items-start gap-2">
            {branding.companyChop.value.url ? (
              <img
                src={branding.companyChop.value.url}
                alt="Chop"
                className="h-8 w-auto object-contain rounded border bg-white p-0.5"
              />
            ) : null}
            <div>
              <p className="text-[12px] text-muted-foreground">公司印章</p>
              <p className="font-medium text-[13px]">{branding.companyChop.value.url ? '已設定' : '未設定'}</p>
            </div>
          </div>
        </BrandingRow>

        {showPaymentInfo ? (
          <BrandingRow
            visible={branding.paymentInfo.visible}
            onVisible={(v) => setVisible('paymentInfo', v)}
            source={slotSourceId(branding, 'paymentInfo', primaryId)}
            companies={companies}
            onSource={(id) => setSource('paymentInfo', id)}
          >
            <p className="text-[12px] text-muted-foreground">付款資料</p>
            <p className="text-[12px] text-foreground whitespace-pre-wrap line-clamp-3">
              {branding.paymentInfo.value.bankNotes || '未設定'}
            </p>
          </BrandingRow>
        ) : null}
      </div>
    </div>
  );
}

function BrandingRow({
  visible,
  onVisible,
  source,
  companies,
  onSource,
  children,
}: {
  visible: boolean;
  onVisible: (visible: boolean) => void;
  source: string;
  companies: CompanyBrandingSource[];
  onSource: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-start gap-2', !visible && 'opacity-50')}>
      <Checkbox
        checked={visible}
        onCheckedChange={(v) => onVisible(v === true)}
        className="mt-0.5 rounded-full"
      />
      <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
        <div className="min-w-0">{children}</div>
        <SourceSelect value={source} companies={companies} onChange={onSource} />
      </div>
    </div>
  );
}

export function CompanySelectField({
  companies,
  value,
  onChange,
  label = '公司 BU',
}: {
  companies: CompanyBrandingSource[];
  value: string | null;
  onChange: (companyId: string | null) => void;
  label?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select
        className="h-9 w-full rounded-md border-transparent bg-muted/40 px-3 text-[13px] focus:outline-none focus:ring-1 focus:ring-ring focus:bg-white"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">請選擇</option>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.code ? `${company.code} · ` : ''}
            {company.chineseDisplay || company.display || company.id}
          </option>
        ))}
      </select>
    </div>
  );
}
