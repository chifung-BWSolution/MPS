import assert from 'node:assert/strict';
import { formatMetricValue } from '../src/lib/adsDailySeries';
import { formatMoneyAmount, formatMoneyFromMicros } from '../src/lib/formatMoney';

assert.equal(formatMoneyAmount(249.6), '$249.60');
assert.equal(formatMoneyAmount(1234.5), '$1,234.50');
assert.match(formatMoneyFromMicros(1_234_560_000), /^\$/);
assert.match(formatMetricValue(12.3, 'cost'), /^\$/);
assert.match(formatMetricValue(0.8, 'cpc'), /^\$/);
assert.doesNotMatch(formatMetricValue(1200, 'clicks'), /^\$/);
assert.match(formatMetricValue(2.5, 'ctr'), /%$/);

console.log('format money: ok');
