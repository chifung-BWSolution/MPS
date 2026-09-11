import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assignShopifyBillingInstallments,
  isShopifyBillingDuplicate,
  isShopifyWebsitePlatform,
  matchShopifyBillingSupplier,
  parseShopifyBillingCsvText,
  shopifyBillingImportKey,
  shopifyBillingRemarks,
  shopifyChargeLabel,
  shopifyChargeMatchQueries,
  shopifyChargeToExpenseInput,
  scoreSupplierName,
} from '../src/lib/shopifyBillingCsv.ts';
import { toHkd } from '../src/lib/currency.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const SAMPLE_CSV = `Bill #,Store Name,Shop ID,.myshopify.com URL,Charge category,Description,Amount,Currency,Start of billing cycle,End of billing cycle,Date,Order,Rate,App,Original amount,Original currency,Exchange rate,Usage quantity,Charge date
538758169,6A Silk,63674712130,https://www.6a-silk.com,application_fee,GemPages Builder,29.0,USD,2026-05-20,2026-06-19,2026-06-02,"","",GemPages Builder,29.0,USD,1.0,"",2026-05-20
483073216,6A Silk,63674712130,https://www.6a-silk.com,subscription_fee,Subscription Fee,300.0,USD,2026-02-02,2027-02-02,2026-02-02,"","","",300.0,USD,1.0,"",2026-02-02
483073216,6A Silk,63674712130,https://www.6a-silk.com,application_fee,GemPages Builder,29.0,USD,2026-01-09,2026-02-08,2026-02-02,"","",GemPages Builder,29.0,USD,1.0,"",2026-01-09
451913648,6A Silk,63674712130,https://www.6a-silk.com,subscription_fee,Subscription Fee,0,USD,2025-11-28,2025-12-03,2025-11-28,"","","",0,USD,1.0,"",2025-11-28
`;

const suppliers = [
  {
    id: 'wps_shopify',
    supplierTypesId: 'type_builder',
    displayName: 'Shopify',
    companyName: '',
    isActive: true,
  },
  {
    id: 'wps_gempage',
    supplierTypesId: 'type_plugin',
    displayName: 'Gempage',
    companyName: '',
    isActive: true,
  },
  {
    id: 'wps_framer',
    supplierTypesId: 'type_builder',
    displayName: 'Framer',
    companyName: '',
    isActive: true,
  },
];

const parsed = parseShopifyBillingCsvText(SAMPLE_CSV);
assert.equal(parsed.error, undefined);
assert.equal(parsed.charges.length, 3);
assert.deepEqual(parsed.stores, ['6A Silk']);

const gempage = parsed.charges[0]!;
assert.equal(gempage.billNumber, '538758169');
assert.equal(gempage.chargeCategory, 'application_fee');
assert.equal(gempage.app, 'GemPages Builder');
assert.equal(gempage.amount, 29);
assert.equal(gempage.currency, 'USD');
assert.equal(gempage.chargeDate, '2026-05-20');
assert.equal(gempage.invoiceDate, '2026-06-02');
assert.equal(shopifyChargeLabel(gempage), 'GemPages Builder');
assert.equal(
  shopifyBillingRemarks(gempage),
  'Shopify #538758169 · GemPages Builder · 2026-05-20–2026-06-19',
);

const shopifyYearly = parsed.charges[1]!;
assert.equal(shopifyYearly.chargeCategory, 'subscription_fee');
assert.equal(shopifyYearly.app, '');
assert.equal(shopifyYearly.amount, 300);
assert.deepEqual(shopifyChargeMatchQueries(shopifyYearly), ['Subscription Fee', 'Shopify']);

const sameBillGempage = parsed.charges[2]!;
assert.equal(sameBillGempage.billNumber, shopifyYearly.billNumber);
assert.notEqual(sameBillGempage.importKey, shopifyYearly.importKey);

assert.equal(scoreSupplierName('GemPages Builder', 'Gempage'), 80);
assert.equal(scoreSupplierName('Shopify', 'Shopify'), 100);
assert.equal(matchShopifyBillingSupplier(gempage, suppliers)?.id, 'wps_gempage');
assert.equal(matchShopifyBillingSupplier(shopifyYearly, suppliers)?.id, 'wps_shopify');

const installments = assignShopifyBillingInstallments(
  parsed.charges.map((charge) => {
    const matched = matchShopifyBillingSupplier(charge, suppliers)!;
    return {
      importKey: charge.importKey,
      supplierTypesId: matched.supplierTypesId!,
      supplierId: matched.id,
      sortDate: charge.chargeDate || charge.invoiceDate || '',
    };
  }),
  [],
);
assert.equal(installments.get(sameBillGempage.importKey), 1);
assert.equal(installments.get(gempage.importKey), 2);
assert.equal(installments.get(shopifyYearly.importKey), 1);

const input = shopifyChargeToExpenseInput(
  gempage,
  { supplierTypesId: 'type_plugin', supplierId: 'wps_gempage' },
  { paymentMethod: 'Transfer', paymentStatus: 'Paid', creditCardId: '' },
  2,
);
assert.equal(input.currency, 'USD');
assert.equal(input.billedAmount, toHkd(29, 'USD'));
assert.equal(input.paymentAmount, toHkd(29, 'USD'));
assert.equal(input.dueDate, '2026-05-20');
assert.equal(input.paymentDate, '2026-06-02');
assert.equal(input.paymentMethod, 'Transfer');
assert.equal(input.paymentStatus, 'Paid');
assert.equal(input.installmentNumber, 2);
assert.match(input.remarks ?? '', /Shopify #538758169/);

assert.equal(
  isShopifyBillingDuplicate({ remarks: input.remarks, dueDate: input.dueDate ?? undefined }, gempage),
  true,
);
assert.equal(
  isShopifyBillingDuplicate({ remarks: input.remarks, dueDate: input.dueDate ?? undefined }, sameBillGempage),
  false,
);

assert.equal(
  shopifyBillingImportKey({
    billNumber: '1',
    chargeCategory: 'application_fee',
    chargeDate: '2026-01-01',
    amount: 29,
    app: 'GemPages Builder',
  }),
  '1|application_fee|2026-01-01|29|GemPages Builder',
);

const invalid = parseShopifyBillingCsvText('foo,bar\n1,2');
assert.match(invalid.error ?? '', /不是 Shopify 帳單匯出檔/);

const exportPath = 'C:/Users/user/Downloads/charges_export.csv';
if (existsSync(exportPath)) {
  const exported = parseShopifyBillingCsvText(readFileSync(exportPath, 'utf8'));
  assert.equal(exported.error, undefined);
  assert.equal(exported.charges.length, 16);
  assert.equal(exported.charges.filter((row) => row.app.includes('GemPages')).length, 9);
  assert.equal(exported.charges.filter((row) => row.chargeCategory === 'subscription_fee').length, 7);
  assert.equal(exported.charges[0]?.chargeDate, '2026-05-20');
  assert.equal(matchShopifyBillingSupplier(exported.charges[0]!, suppliers)?.id, 'wps_gempage');
}

assert.equal(isShopifyWebsitePlatform('Shopify'), true);
assert.equal(isShopifyWebsitePlatform('shopify'), true);
assert.equal(isShopifyWebsitePlatform(' SHOPIFY '), true);
assert.equal(isShopifyWebsitePlatform('wordpress'), false);
assert.equal(isShopifyWebsitePlatform(''), false);
assert.equal(isShopifyWebsitePlatform(null), false);

const tab = read('src/components/quotation/PitchingExpenseTab.tsx');
assert.match(tab, /匯入 Shopify 帳單/);
assert.match(tab, /ShopifyBillingImportDialog/);
assert.match(tab, /handleShopifyImport/);
assert.match(tab, /saveBulkExpenses/);
assert.match(tab, /canImportShopify/);
assert.match(tab, /isShopifyWebsitePlatform/);
assert.match(tab, /webandsystemListId/);
assert.match(tab, /relatedType === 'webandsystem'/);
assert.match(tab, /\{canImportShopify && \(/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /webandsystemListId=\{draft\.webandsystemListId\}/);

const dialog = read('src/components/quotation/ShopifyBillingImportDialog.tsx');
assert.match(dialog, /Shopify 帳單檔案/);
assert.match(dialog, /type="file"/);
assert.doesNotMatch(dialog, /sr-only/);
assert.doesNotMatch(dialog, /<button[\s\S]*w-full[\s\S]*拖放或選擇/);
assert.match(dialog, /parseShopifyBillingCsvBuffer/);
assert.match(dialog, /matchShopifyBillingSupplier/);
assert.match(dialog, /略過已匯入列/);
assert.match(dialog, /匯入付款方式/);
assert.match(dialog, /匯入支出/);

console.log('shopify billing import tests passed');
