import assert from 'node:assert/strict';
import { formatMetricValue } from '../src/lib/adsDailySeries';
import { formatMoneyAmount, formatMoneyFromMicros } from '../src/lib/formatMoney';

assert.match(formatMoneyAmount(1234.5), /^\$/);
assert.match(formatMoneyFromMicros(1_234_560_000), /^\$/);
assert.match(formatMetricValue(12.3, 'cost'), /^\$/);
assert.match(formatMetricValue(0.8, 'cpc'), /^\$/);
assert.doesNotMatch(formatMetricValue(1200, 'clicks'), /^\$/);
assert.match(formatMetricValue(2.5, 'ctr'), /%$/);

console.log('format money: ok');
