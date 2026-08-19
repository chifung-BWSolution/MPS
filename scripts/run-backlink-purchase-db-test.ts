import assert from 'node:assert/strict';
import {
  BACKLINK_PURCHASE_DB_COLUMNS,
  toBacklinkCostPatch,
  toBacklinkInsertRow,
} from '../src/lib/backlinkPurchaseDb';

const row = toBacklinkInsertRow({
  id: 'bl_test_1',
  websiteProfileId: 'ws_1',
  webSupplierId: 'wps_excel_import',
  costUsd: 100,
  costHkd: 780,
  purchaseDate: '2026-08-19',
  quantity: 100,
  notes: 'remarks',
  brand: 'BW',
});

assert.deepEqual(Object.keys(row).sort(), [...BACKLINK_PURCHASE_DB_COLUMNS].sort());
assert.equal(row.cost, 100);
assert.equal(row.currency, 'USD');
assert.equal(row.website_profile_id, 'ws_1');
assert.equal(row.web_supplier_id, 'wps_excel_import');
assert.equal(row.purchase_date, '2026-08-19');
assert.equal(row.quantity, 100);
assert.equal(row.notes, 'remarks');
assert.ok(!('brand' in row));
assert.ok(!('cost_usd' in row));
assert.ok(!('cost_hkd' in row));

const hkdOnly = toBacklinkInsertRow({
  id: 'bl_test_2',
  webSupplierId: 'wps_excel_import',
  costUsd: 0,
  costHkd: 78,
  purchaseDate: '2026-08-19',
  quantity: 1,
});
assert.equal(hkdOnly.cost, 10);
assert.equal(hkdOnly.currency, 'USD');

assert.deepEqual(toBacklinkCostPatch(49, 383), { cost: 49, currency: 'USD' });
assert.deepEqual(toBacklinkCostPatch(0, 78), { cost: 10, currency: 'USD' });

console.log('backlink purchase db row tests passed');
