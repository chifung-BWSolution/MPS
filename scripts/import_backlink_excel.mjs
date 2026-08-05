/**
 * Import SEO backlink Excel → backlink_purchases SQL batches.
 *
 * Place workbook at:
 *   data/SEO backlink order record + keywords update schedule.xlsx
 *
 * Usage:
 *   node scripts/import_backlink_excel.mjs --stats
 *   node scripts/import_backlink_excel.mjs --sql
 *   node scripts/import_backlink_excel.mjs --unmatched
 *   node scripts/import_backlink_excel.mjs --push
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const xlsxPath = path.join(
  __dirname,
  '..',
  'data',
  'SEO backlink order record + keywords update schedule.xlsx',
);
const outSql = path.join(__dirname, '_backlink_import.sql');
const DEFAULT_SUPPLIER_ID = 'wps_excel_import';

const MONTH_MAP = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function normalizeDomain(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .split(/[/?#]/)[0];
}

function extractDomainsFromAccountName(name) {
  const domains = new Set();
  const matches = String(name).toLowerCase().match(/[a-z0-9][-a-z0-9]*\.(?:com|com\.hk|hk|net|org|co\.uk)(?:\.[a-z]{2})?/gi);
  if (matches) for (const m of matches) domains.add(normalizeDomain(m));
  return [...domains];
}

function matchDomain(excelDomain, accounts) {
  const needle = normalizeDomain(excelDomain);
  if (!needle) return null;
  for (const account of accounts) {
    const tokens = extractDomainsFromAccountName(account.descriptiveName);
    if (tokens.some((t) => t === needle || needle.endsWith(t) || t.endsWith(needle))) {
      return account;
    }
    if (account.descriptiveName.toLowerCase().includes(needle.replace(/^www\./, ''))) {
      return account;
    }
  }
  return null;
}

function cellStr(row, col) {
  const v = row[col];
  if (v == null) return '';
  return String(v).trim();
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const joined = (rows[i] ?? []).map((c) => String(c ?? '').toLowerCase()).join('|');
    if (joined.includes('domain')) return i;
  }
  return 0;
}

function findDomainCol(headerRow) {
  for (let i = 0; i < headerRow.length; i++) {
    if (String(headerRow[i] ?? '').trim().toLowerCase() === 'domain') return i;
  }
  return 3;
}

function parseMonthBlocks(headerRow) {
  const blocks = [];
  let currentYear = null;
  for (let col = 0; col < headerRow.length; col++) {
    const val = cellStr(headerRow, col);
    if (/^\d{4}$/.test(val)) currentYear = parseInt(val, 10);
    const month = MONTH_MAP[val.slice(0, 3).toLowerCase()];
    if (month && currentYear) {
      blocks.push({ year: currentYear, month, dateCol: col, actionCol: col + 1 });
    }
  }
  return blocks;
}

function parseDdMm(dateRaw, year, month) {
  const m = String(dateRaw).trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const parsedMonth = parseInt(m[2], 10);
  const useMonth = parsedMonth <= 12 ? parsedMonth : month;
  const useDay = parsedMonth <= 12 ? day : parsedMonth;
  return `${year}-${String(useMonth).padStart(2, '0')}-${String(useDay).padStart(2, '0')}`;
}

function splitActions(text) {
  const normalized = String(text).replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const items = [];
  for (const line of normalized.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const dashParts = line.split(/(?=\s*-)/).map((p) => p.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
    if (dashParts.length > 1) items.push(...dashParts);
    else if (dashParts.length === 1) items.push(dashParts[0]);
    else items.push(line);
  }
  return items.filter(Boolean);
}

function parseCostAndCurrency(action) {
  for (const re of [/US\$\s*([\d,]+(?:\.\d+)?)/i, /\$\s*([\d,]+(?:\.\d+)?)\s*(?:usd|USD)\b/i]) {
    const m = action.match(re);
    if (m) return { cost: parseFloat(m[1].replace(/,/g, '')) || 0, currency: 'USD' };
  }
  const hkd = action.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (hkd) return { cost: parseFloat(hkd[1].replace(/,/g, '')) || 0, currency: 'HKD' };
  return { cost: 0, currency: 'HKD' };
}

function parseQuantity(action) {
  const m = action.match(/([\d,]+)\s*backlinks?/i);
  if (m) return parseInt(m[1].replace(/,/g, ''), 10) || 1;
  const dr = action.match(/\bDR\s*(\d+)/i);
  if (dr) return parseInt(dr[1], 10) || 1;
  return 1;
}

function parseSheetRows(sheetName, rows) {
  if (!rows.length) return [];
  const headerIdx = findHeaderRow(rows);
  const headerRow = rows[headerIdx] ?? [];
  const domainCol = findDomainCol(headerRow);
  const blocks = parseMonthBlocks(headerRow);
  const parsed = [];

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const sourceDomain = cellStr(row, domainCol);
    if (!sourceDomain || !sourceDomain.includes('.')) continue;

    for (const block of blocks) {
      const dateRaw = cellStr(row, block.dateCol);
      const actionRaw = cellStr(row, block.actionCol);
      if (!actionRaw) continue;

      let purchaseDate = dateRaw ? parseDdMm(dateRaw, block.year, block.month) : null;
      const actions = splitActions(actionRaw.replace(/^\d{1,2}\/\d{1,2}\s*/, ''));

      for (const actionText of actions) {
        if (!purchaseDate) {
          const inline = actionText.match(/^(\d{1,2}\/\d{1,2})/);
          if (inline) purchaseDate = parseDdMm(inline[1], block.year, block.month);
        }
        const { cost, currency } = parseCostAndCurrency(actionText);
        parsed.push({
          sheetName,
          brand: cellStr(row, 0),
          websiteLabel: cellStr(row, 2),
          sourceDomain,
          purchaseDate: purchaseDate ?? `${block.year}-${String(block.month).padStart(2, '0')}-01`,
          year: block.year,
          actionText,
          cost,
          currency,
          quantity: parseQuantity(actionText),
        });
      }
    }
  }
  return parsed;
}

function parseWorkbook(workbook) {
  const all = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    all.push(...parseSheetRows(sheetName, rows));
  }
  return all.sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
}

function sqlStr(v) {
  if (v == null || v === '') return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function matchWebsite(sourceDomain, websites) {
  const needle = normalizeDomain(sourceDomain);
  if (!needle) return null;
  for (const site of websites) {
    const d = normalizeDomain(site.domain_url);
    if (!d) continue;
    if (d === needle || d.endsWith(needle) || needle.endsWith(d)) return site;
  }
  return null;
}

function buildEnrichedRows(rows, accounts, websites) {
  const unmatched = new Map();
  const enriched = rows.map((row, i) => {
    const ads = matchDomain(row.sourceDomain, accounts);
    const site = matchWebsite(row.sourceDomain, websites);
    if (!ads) {
      const key = `${row.sheetName}::${normalizeDomain(row.sourceDomain)}`;
      if (!unmatched.has(key)) {
        unmatched.set(key, {
          domain: row.sourceDomain,
          sheet: row.sheetName,
          brand: row.brand,
          websiteLabel: row.websiteLabel,
        });
      }
    }
    return {
      id: `bl_xlsx_${String(i + 1).padStart(4, '0')}`,
      web_supplier_id: DEFAULT_SUPPLIER_ID,
      website_profile_id: site?.id ?? null,
      cost: row.cost,
      currency: row.currency,
      purchase_date: row.purchaseDate,
      quantity: row.quantity,
      notes: row.actionText,
      source_domain: row.sourceDomain,
      excel_sheet: row.sheetName,
      google_ads_customer_id: ads?.customerId ?? null,
      google_ads_account_name: ads?.descriptiveName ?? null,
    };
  });
  return { enriched, unmatched };
}

async function loadSupabaseContext() {
  const url = process.env.MPS_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.MPS_SERVICE || process.env.MPS_ANON || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing MPS_URL / MPS_SERVICE environment variables');

  const sb = createClient(url, key);
  const [accRes, siteRes] = await Promise.all([
    sb.from('google_ads_accounts').select('customer_id, descriptive_name, is_manager').eq('is_manager', false),
    sb.from('webandsystem_list').select('id, domain_url').not('domain_url', 'is', null),
  ]);
  if (accRes.error) throw accRes.error;
  if (siteRes.error) throw siteRes.error;

  const accounts = (accRes.data ?? []).map((a) => ({
    customerId: a.customer_id,
    descriptiveName: a.descriptive_name,
  }));
  return { sb, accounts, websites: siteRes.data ?? [] };
}

async function pushToSupabase(sb, enriched) {

  await sb.from('web_page_suppliers').upsert({
    id: DEFAULT_SUPPLIER_ID,
    name: 'Excel 匯入（未指定供應商）',
    platform: 'import',
    url: 'https://import.local/backlink',
    cost: 0,
    currency: 'HKD',
    rating: 3,
  }, { onConflict: 'id' });

  const { error: delErr } = await sb.from('backlink_purchases').delete().like('id', 'bl_xlsx_%');
  if (delErr) throw delErr;

  const batchSize = 50;
  for (let i = 0; i < enriched.length; i += batchSize) {
    const batch = enriched.slice(i, i + batchSize);
    const { error } = await sb.from('backlink_purchases').insert(batch);
    if (error) throw error;
  }
}

async function main() {
  if (!fs.existsSync(xlsxPath)) {
    console.error(`Missing workbook: ${xlsxPath}`);
    console.error('Place "SEO backlink order record + keywords update schedule.xlsx" in the data/ folder.');
    process.exit(1);
  }

  const buf = fs.readFileSync(xlsxPath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
  const rows = parseWorkbook(wb);

  const { sb, accounts, websites } = await loadSupabaseContext();
  const { enriched, unmatched } = buildEnrichedRows(rows, accounts, websites);

  const stats = {
    sheets: wb.SheetNames,
    totalRecords: rows.length,
    matchedAccounts: enriched.filter((r) => r.google_ads_customer_id).length,
    matchedWebsites: enriched.filter((r) => r.website_profile_id).length,
    unmatchedDomains: unmatched.size,
  };

  if (process.argv.includes('--stats')) {
    console.log(JSON.stringify(stats, null, 2));
    console.log(`Parsed ${rows.length} purchase records from ${wb.SheetNames.length} sheet(s).`);
    return;
  }

  if (process.argv.includes('--unmatched')) {
    console.log(JSON.stringify([...unmatched.values()], null, 2));
    return;
  }

  if (process.argv.includes('--push')) {
    await pushToSupabase(sb, enriched);
    fs.writeFileSync(
      path.join(__dirname, '_backlink_unmatched.json'),
      JSON.stringify([...unmatched.values()], null, 2),
    );
    console.log(JSON.stringify(stats, null, 2));
    console.log(`Pushed ${enriched.length} records to backlink_purchases.`);
    console.log(`Unmatched domains written to scripts/_backlink_unmatched.json (${unmatched.size}).`);
    return;
  }

  const lines = [
    '-- Generated by scripts/import_backlink_excel.mjs',
    `-- Records: ${rows.length}`,
    '',
    "INSERT INTO public.web_page_suppliers (id, name, platform, url, cost, currency, rating)",
    `VALUES ('${DEFAULT_SUPPLIER_ID}', 'Excel 匯入（未指定供應商）', 'import', 'https://import.local/backlink', 0, 'HKD', 3)`,
    'ON CONFLICT (id) DO NOTHING;',
    '',
  ];

  for (let i = 0; i < enriched.length; i++) {
    const r = enriched[i];
    lines.push(
      `INSERT INTO public.backlink_purchases (id, web_supplier_id, website_profile_id, cost, currency, purchase_date, quantity, notes, source_domain, excel_sheet, google_ads_customer_id, google_ads_account_name) VALUES (` +
        `${sqlStr(r.id)}, '${DEFAULT_SUPPLIER_ID}', ${r.website_profile_id ? sqlStr(r.website_profile_id) : 'NULL'}, ${r.cost}, '${r.currency}', ${sqlStr(r.purchase_date)}, ${r.quantity}, ${sqlStr(r.notes)}, ${sqlStr(r.source_domain)}, ${sqlStr(r.excel_sheet)}, ${r.google_ads_customer_id ? sqlStr(r.google_ads_customer_id) : 'NULL'}, ${r.google_ads_account_name ? sqlStr(r.google_ads_account_name) : 'NULL'}` +
        ') ON CONFLICT (id) DO NOTHING;',
    );
  }

  fs.writeFileSync(outSql, lines.join('\n'));
  console.log(`Wrote ${outSql} (${enriched.length} INSERTs)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
