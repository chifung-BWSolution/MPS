import * as XLSX from 'xlsx';
import { matchDomainToGoogleAdsAccount, normalizeDomain, type DomainMatchTarget } from '@/lib/domainMatch';

export interface ParsedBacklinkRow {
  sheetName: string;
  brand: string;
  websiteLabel: string;
  sourceDomain: string;
  purchaseDate: string;
  year: number;
  month: number;
  actionText: string;
  cost: number;
  currency: 'USD' | 'HKD';
  quantity: number;
}

export interface BacklinkImportRecord extends ParsedBacklinkRow {
  googleAdsCustomerId?: string;
  googleAdsAccountName?: string;
  websiteProfileId?: string;
  matched: boolean;
}

export interface BacklinkImportResult {
  records: BacklinkImportRecord[];
  unmatchedDomains: { domain: string; sheetName: string; brand: string; websiteLabel: string }[];
  stats: {
    totalParsed: number;
    matched: number;
    unmatched: number;
    sheetsProcessed: string[];
  };
}

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

type MonthBlock = {
  year: number;
  month: number;
  dateCol: number;
  /** When set, cost is read from this column (HKD) instead of action text. */
  priceCol?: number;
  actionCol: number;
};

function cellStr(row: unknown[], col: number): string {
  const v = row[col];
  if (v == null) return '';
  return String(v).trim();
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const joined = (rows[i] ?? []).map((c) => String(c ?? '').toLowerCase()).join('|');
    if (joined.includes('domain')) return i;
  }
  return 0;
}

function findDomainCol(headerRow: unknown[]): number {
  for (let i = 0; i < headerRow.length; i++) {
    if (String(headerRow[i] ?? '').trim().toLowerCase() === 'domain') return i;
  }
  return 3;
}

function headerLabel(headerRow: unknown[], col: number): string {
  return cellStr(headerRow, col).toLowerCase();
}

function parseMonthBlocks(headerRow: unknown[]): MonthBlock[] {
  const blocks: MonthBlock[] = [];
  let currentYear: number | null = null;

  for (let col = 0; col < headerRow.length; col++) {
    const val = cellStr(headerRow, col);
    if (/^\d{4}$/.test(val)) {
      currentYear = parseInt(val, 10);
      continue;
    }
    const monthKey = val.slice(0, 3).toLowerCase();
    const month = MONTH_MAP[monthKey];
    if (!month || !currentYear) continue;

    const next1 = headerLabel(headerRow, col + 1);
    const next2 = headerLabel(headerRow, col + 2);
    const next3 = headerLabel(headerRow, col + 3);

    if (next1.includes('existing dr') && next2 === 'price' && next3 === 'action') {
      blocks.push({
        year: currentYear,
        month,
        dateCol: col,
        priceCol: col + 2,
        actionCol: col + 3,
      });
    } else if (next1 === 'price' && next2 === 'action') {
      blocks.push({
        year: currentYear,
        month,
        dateCol: col,
        priceCol: col + 1,
        actionCol: col + 2,
      });
    } else if (next1 === 'action') {
      blocks.push({
        year: currentYear,
        month,
        dateCol: col,
        actionCol: col + 1,
      });
    }
  }

  return blocks;
}

function parseDdMm(dateRaw: string, year: number, month: number): string | null {
  const s = dateRaw.trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;

  const day = parseInt(m[1], 10);
  const parsedMonth = parseInt(m[2], 10);
  const useMonth = parsedMonth <= 12 ? parsedMonth : month;
  const useDay = parsedMonth <= 12 ? day : parsedMonth;
  const useYear = year;

  if (useDay < 1 || useDay > 31 || useMonth < 1 || useMonth > 12) return null;
  return `${useYear}-${String(useMonth).padStart(2, '0')}-${String(useDay).padStart(2, '0')}`;
}

function splitActions(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: string[] = [];

  for (const line of lines) {
    if (line.includes('\n')) {
      items.push(...splitActions(line));
      continue;
    }
    const dashParts = line.split(/(?=\s*-)/).map((p) => p.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
    if (dashParts.length > 1) {
      items.push(...dashParts);
    } else if (dashParts.length === 1) {
      items.push(dashParts[0]!);
    } else {
      items.push(line);
    }
  }

  return items.filter(Boolean);
}

function parseExcelSerialDate(raw: string): string | null {
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const ms = (n - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parsePurchaseDate(dateRaw: string, year: number, month: number): string | null {
  if (!dateRaw.trim()) return null;
  return parseDdMm(dateRaw, year, month) ?? parseExcelSerialDate(dateRaw);
}

function parsePriceCell(raw: string): { cost: number; currency: 'USD' | 'HKD' } {
  const s = raw.trim();
  if (!s) return { cost: 0, currency: 'HKD' };

  if (/usd/i.test(s)) {
    const m = s.match(/([\d,]+(?:\.\d+)?)/);
    return { cost: m ? parseFloat(m[1]!.replace(/,/g, '')) : 0, currency: 'USD' };
  }
  if (/hkd/i.test(s)) {
    const m = s.match(/([\d,]+(?:\.\d+)?)/);
    return { cost: m ? parseFloat(m[1]!.replace(/,/g, '')) : 0, currency: 'HKD' };
  }

  const n = parseFloat(s.replace(/,/g, ''));
  return { cost: Number.isFinite(n) ? n : 0, currency: 'HKD' };
}

function parseCostAndCurrency(action: string): { cost: number; currency: 'USD' | 'HKD' } {
  const usdPatterns = [
    /US\$\s*([\d,]+(?:\.\d+)?)/i,
    /\$\s*([\d,]+(?:\.\d+)?)\s*(?:usd|USD)\b/i,
    /\b([\d,]+(?:\.\d+)?)\s*(?:usd|USD)\b/i,
  ];
  for (const re of usdPatterns) {
    const m = action.match(re);
    if (m) {
      return { cost: parseFloat(m[1]!.replace(/,/g, '')) || 0, currency: 'USD' };
    }
  }

  const hkdSuffix = action.match(/([\d,]+(?:\.\d+)?)\s*hkd\b/i);
  if (hkdSuffix) {
    return { cost: parseFloat(hkdSuffix[1]!.replace(/,/g, '')) || 0, currency: 'HKD' };
  }

  const hkdMatch = action.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (hkdMatch) {
    return { cost: parseFloat(hkdMatch[1]!.replace(/,/g, '')) || 0, currency: 'HKD' };
  }

  const plainNumber = action.trim().match(/^([\d,]+(?:\.\d+)?)$/);
  if (plainNumber) {
    return { cost: parseFloat(plainNumber[1]!.replace(/,/g, '')) || 0, currency: 'HKD' };
  }

  return { cost: 0, currency: 'HKD' };
}

function parseQuantity(action: string): number {
  const m = action.match(/([\d,]+)\s*backlinks?/i);
  if (m) return parseInt(m[1]!.replace(/,/g, ''), 10) || 1;
  const drMatch = action.match(/\bDR\s*(\d+)/i);
  if (drMatch) return parseInt(drMatch[1]!, 10) || 1;
  return 1;
}

function stripLeadingDateFromAction(action: string): string {
  return action.replace(/^\d{1,2}\/\d{1,2}\s*/, '').trim();
}

function parseSheetRows(sheetName: string, rows: unknown[][]): ParsedBacklinkRow[] {
  if (!rows.length) return [];

  const headerIdx = findHeaderRow(rows);
  const headerRow = rows[headerIdx] ?? [];
  const domainCol = findDomainCol(headerRow);
  const brandCol = 0;
  const websiteCol = 2;
  const blocks = parseMonthBlocks(headerRow);
  const parsed: ParsedBacklinkRow[] = [];

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const sourceDomain = cellStr(row, domainCol);
    if (!sourceDomain || !sourceDomain.includes('.')) continue;

    const brand = cellStr(row, brandCol);
    const websiteLabel = cellStr(row, websiteCol);

    for (const block of blocks) {
      const dateRaw = cellStr(row, block.dateCol);
      const actionRaw = cellStr(row, block.actionCol);
      const priceRaw = block.priceCol != null ? cellStr(row, block.priceCol) : '';
      const hasStructuredPrice = block.priceCol != null;

      if (!actionRaw && !priceRaw && !dateRaw) continue;
      if (hasStructuredPrice && !priceRaw && !actionRaw) continue;

      let purchaseDate = dateRaw ? parsePurchaseDate(dateRaw, block.year, block.month) : null;

      if (hasStructuredPrice) {
        const actionText = stripLeadingDateFromAction(actionRaw);
        if (!purchaseDate && actionText) {
          const inlineDate = actionText.match(/^(\d{1,2}\/\d{1,2})/);
          if (inlineDate) {
            purchaseDate = parseDdMm(inlineDate[1]!, block.year, block.month);
          }
        }

        const { cost, currency } = parsePriceCell(priceRaw);
        parsed.push({
          sheetName,
          brand,
          websiteLabel,
          sourceDomain,
          purchaseDate: purchaseDate ?? `${block.year}-${String(block.month).padStart(2, '0')}-01`,
          year: block.year,
          month: block.month,
          actionText: actionText || priceRaw,
          cost,
          currency,
          quantity: parseQuantity(actionText),
        });
        continue;
      }

      if (!actionRaw) continue;

      const actions = splitActions(stripLeadingDateFromAction(actionRaw));

      for (const actionText of actions) {
        if (!actionText) continue;

        if (!purchaseDate) {
          const inlineDate = actionText.match(/^(\d{1,2}\/\d{1,2})/);
          if (inlineDate) {
            purchaseDate = parseDdMm(inlineDate[1]!, block.year, block.month);
          }
        }

        const { cost, currency } = parseCostAndCurrency(actionText);
        const quantity = parseQuantity(actionText);

        parsed.push({
          sheetName,
          brand,
          websiteLabel,
          sourceDomain,
          purchaseDate: purchaseDate ?? `${block.year}-${String(block.month).padStart(2, '0')}-01`,
          year: block.year,
          month: block.month,
          actionText,
          cost,
          currency,
          quantity,
        });
      }
    }
  }

  return parsed;
}

export function parseBacklinkWorkbook(workbook: XLSX.WorkBook): ParsedBacklinkRow[] {
  const all: ParsedBacklinkRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    all.push(...parseSheetRows(sheetName, rows));
  }
  return all.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.month !== b.month) return b.month - a.month;
    return b.purchaseDate.localeCompare(a.purchaseDate);
  });
}

export function parseBacklinkExcelBuffer(buffer: ArrayBuffer): ParsedBacklinkRow[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  return parseBacklinkWorkbook(workbook);
}

export function enrichBacklinkImports(
  rows: ParsedBacklinkRow[],
  googleAdsAccounts: DomainMatchTarget[],
  websiteProfiles: { id: string; domainUrl?: string }[],
): BacklinkImportResult {
  const records: BacklinkImportRecord[] = [];
  const unmatchedSet = new Map<string, { domain: string; sheetName: string; brand: string; websiteLabel: string }>();

  for (const row of rows) {
    const adsMatch = matchDomainToGoogleAdsAccount(row.sourceDomain, googleAdsAccounts);
    const normalized = normalizeDomain(row.sourceDomain);
    const website = websiteProfiles.find((w) => {
      const d = normalizeDomain(w.domainUrl);
      return d && (d === normalized || d.endsWith(normalized) || normalized.endsWith(d));
    });

    const record: BacklinkImportRecord = {
      ...row,
      matched: !!adsMatch,
      googleAdsCustomerId: adsMatch?.customerId,
      googleAdsAccountName: adsMatch?.descriptiveName,
      websiteProfileId: website?.id,
    };
    records.push(record);

    if (!adsMatch) {
      const key = `${row.sheetName}::${normalized}`;
      if (!unmatchedSet.has(key)) {
        unmatchedSet.set(key, {
          domain: row.sourceDomain,
          sheetName: row.sheetName,
          brand: row.brand,
          websiteLabel: row.websiteLabel,
        });
      }
    }
  }

  const sheetsProcessed = [...new Set(rows.map((r) => r.sheetName))];

  return {
    records,
    unmatchedDomains: [...unmatchedSet.values()].sort((a, b) => a.domain.localeCompare(b.domain)),
    stats: {
      totalParsed: records.length,
      matched: records.filter((r) => r.matched).length,
      unmatched: unmatchedSet.size,
      sheetsProcessed,
    },
  };
}
