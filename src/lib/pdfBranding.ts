export const PDF_BRANDING_VERSION = 1 as const;

export type PdfBrandingSlotKey =
  | 'companyName'
  | 'companyLogo'
  | 'companyChop'
  | 'paymentInfo';

export type CompanyNameValue = {
  display: string | null;
  chineseDisplay: string | null;
};

export type LogoValue = { url: string | null };
export type ChopValue = { url: string | null };
export type PaymentInfoValue = { bankNotes: string | null };

export type BrandingSlot<T> = {
  visible: boolean;
  sourceId: string | null;
  value: T;
};

export type PdfBranding = {
  version: typeof PDF_BRANDING_VERSION;
  companyName: BrandingSlot<CompanyNameValue>;
  companyLogo: BrandingSlot<LogoValue>;
  companyChop: BrandingSlot<ChopValue>;
  paymentInfo: BrandingSlot<PaymentInfoValue>;
};

export type CompanyBrandingSource = {
  id: string;
  code?: string | null;
  display: string | null;
  chineseDisplay: string | null;
  logoUrl: string | null;
  chopUrl: string | null;
  bankNotes: string | null;
  address?: string | null;
  phone?: string | null;
};

function companyNameValue(company: CompanyBrandingSource | null): CompanyNameValue {
  return {
    display: company?.display ?? null,
    chineseDisplay: company?.chineseDisplay ?? null,
  };
}

function slotFromCompany<K extends PdfBrandingSlotKey>(
  key: K,
  company: CompanyBrandingSource | null,
): PdfBranding[K] {
  const sourceId = company?.id ?? null;
  if (key === 'companyName') {
    return { visible: true, sourceId, value: companyNameValue(company) } as PdfBranding[K];
  }
  if (key === 'companyLogo') {
    return { visible: true, sourceId, value: { url: company?.logoUrl ?? null } } as PdfBranding[K];
  }
  if (key === 'companyChop') {
    return { visible: true, sourceId, value: { url: company?.chopUrl ?? null } } as PdfBranding[K];
  }
  return { visible: true, sourceId, value: { bankNotes: company?.bankNotes ?? null } } as PdfBranding[K];
}

export function emptyPdfBranding(primaryId: string | null = null): PdfBranding {
  return {
    version: PDF_BRANDING_VERSION,
    companyName: { visible: true, sourceId: primaryId, value: { display: null, chineseDisplay: null } },
    companyLogo: { visible: true, sourceId: primaryId, value: { url: null } },
    companyChop: { visible: true, sourceId: primaryId, value: { url: null } },
    paymentInfo: { visible: true, sourceId: primaryId, value: { bankNotes: null } },
  };
}

export function brandingFromCompany(company: CompanyBrandingSource | null): PdfBranding {
  return {
    version: PDF_BRANDING_VERSION,
    companyName: slotFromCompany('companyName', company),
    companyLogo: slotFromCompany('companyLogo', company),
    companyChop: slotFromCompany('companyChop', company),
    paymentInfo: slotFromCompany('paymentInfo', company),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown, fallback: string | null): string | null {
  if (typeof value === 'string') return value;
  if (value === null) return null;
  return fallback;
}

function parseSlot<T>(
  raw: unknown,
  fallback: BrandingSlot<T>,
  parseValue: (value: unknown) => T,
): BrandingSlot<T> {
  if (!isRecord(raw)) return fallback;
  return {
    visible: raw.visible !== false,
    sourceId:
      typeof raw.sourceId === 'string'
        ? raw.sourceId
        : raw.sourceId === null
          ? null
          : fallback.sourceId,
    value: parseValue(raw.value),
  };
}

export function parsePdfBranding(raw: unknown): PdfBranding | null {
  if (!isRecord(raw) || raw.version !== PDF_BRANDING_VERSION) return null;
  const empty = emptyPdfBranding();
  return {
    version: PDF_BRANDING_VERSION,
    companyName: parseSlot(raw.companyName, empty.companyName, (value) => {
      if (!isRecord(value)) return empty.companyName.value;
      return {
        display: nullableString(value.display, empty.companyName.value.display),
        chineseDisplay: nullableString(value.chineseDisplay, empty.companyName.value.chineseDisplay),
      };
    }),
    companyLogo: parseSlot(raw.companyLogo, empty.companyLogo, (value) => {
      if (!isRecord(value)) return empty.companyLogo.value;
      return { url: nullableString(value.url, empty.companyLogo.value.url) };
    }),
    companyChop: parseSlot(raw.companyChop, empty.companyChop, (value) => {
      if (!isRecord(value)) return empty.companyChop.value;
      return { url: nullableString(value.url, empty.companyChop.value.url) };
    }),
    paymentInfo: parseSlot(raw.paymentInfo, empty.paymentInfo, (value) => {
      if (!isRecord(value)) return empty.paymentInfo.value;
      return { bankNotes: nullableString(value.bankNotes, empty.paymentInfo.value.bankNotes) };
    }),
  };
}

export function isSlotInherited(slot: BrandingSlot<unknown>, primaryId: string | null): boolean {
  return slot.sourceId == null || slot.sourceId === primaryId;
}

function keepOrResetSlot<K extends PdfBrandingSlotKey>(
  prev: PdfBranding,
  next: PdfBranding,
  key: K,
  oldPrimaryId: string | null,
): PdfBranding[K] {
  if (isSlotInherited(prev[key], oldPrimaryId)) {
    return { ...next[key], visible: prev[key].visible };
  }
  return prev[key];
}

export function applyPrimaryCompanyChange(
  prev: PdfBranding | null | undefined,
  oldPrimaryId: string | null,
  nextCompany: CompanyBrandingSource | null,
): PdfBranding {
  const next = brandingFromCompany(nextCompany);
  if (!prev) return next;
  return {
    version: PDF_BRANDING_VERSION,
    companyName: keepOrResetSlot(prev, next, 'companyName', oldPrimaryId),
    companyLogo: keepOrResetSlot(prev, next, 'companyLogo', oldPrimaryId),
    companyChop: keepOrResetSlot(prev, next, 'companyChop', oldPrimaryId),
    paymentInfo: keepOrResetSlot(prev, next, 'paymentInfo', oldPrimaryId),
  };
}

export function applySlotSourceChange(
  prev: PdfBranding,
  key: PdfBrandingSlotKey,
  sourceId: string | null,
  all: CompanyBrandingSource[],
): PdfBranding {
  const company = sourceId ? all.find((item) => item.id === sourceId) ?? null : null;
  const fromSource = slotFromCompany(key, company);
  return {
    ...prev,
    [key]: {
      ...fromSource,
      sourceId,
      visible: prev[key].visible,
    },
  };
}

export function applySlotVisibility(
  prev: PdfBranding,
  key: PdfBrandingSlotKey,
  visible: boolean,
): PdfBranding {
  return {
    ...prev,
    [key]: { ...prev[key], visible },
  };
}

export function resolvePdfBranding(
  primary: CompanyBrandingSource | null,
  stored: PdfBranding | null | undefined,
): PdfBranding {
  return stored ?? brandingFromCompany(primary);
}

export function slotSourceId(
  branding: PdfBranding,
  key: PdfBrandingSlotKey,
  primaryId: string | null,
): string {
  return branding[key].sourceId || primaryId || '';
}
