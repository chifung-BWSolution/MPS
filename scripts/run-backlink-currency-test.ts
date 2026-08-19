import assert from 'node:assert/strict';
import {
  costsFromHkdInput,
  costsFromUsdInput,
  usdToHkd,
  hkdToUsd,
} from '../src/lib/backlinkCurrency';

// Typing "4" then "49" must keep converting HKD (old bug: stopped after first digit).
const after4 = costsFromUsdInput('4');
assert.deepEqual(after4, { costUsd: 4, costHkd: usdToHkd(4) });
assert.equal(after4.costHkd, 32);

const after49 = costsFromUsdInput('49');
assert.deepEqual(after49, { costUsd: 49, costHkd: usdToHkd(49) });
assert.equal(after49.costHkd, 383);
assert.notEqual(after49.costHkd, after4.costHkd);

const after490 = costsFromUsdInput('490');
assert.equal(after490.costUsd, 490);
assert.equal(after490.costHkd, usdToHkd(490));
assert.notEqual(after490.costHkd, after49.costHkd);

assert.deepEqual(costsFromUsdInput(''), { costUsd: 0, costHkd: 0 });
assert.deepEqual(costsFromUsdInput('0'), { costUsd: 0, costHkd: 0 });

const hkdAfter78 = costsFromHkdInput('78');
assert.deepEqual(hkdAfter78, { costHkd: 78, costUsd: hkdToUsd(78) });
assert.equal(hkdAfter78.costUsd, 10);

const hkdAfter780 = costsFromHkdInput('780');
assert.equal(hkdAfter780.costUsd, hkdToUsd(780));
assert.notEqual(hkdAfter780.costUsd, hkdAfter78.costUsd);

console.log('backlink currency input tests passed');
