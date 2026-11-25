/**
 * 極簡自測 harness（給 content-selftest.mjs 用）
 * 不引入任何測試框架，確保 `node scripts/content-selftest.mjs` 在任何環境可跑。
 */

const results = [];
let currentGroup = '';

export function group(name) {
  currentGroup = name;
}

export function test(name, fn) {
  const startedAt = performance.now();
  try {
    fn();
    results.push({ name, ok: true, ms: performance.now() - startedAt, group: currentGroup });
  } catch (error) {
    results.push({
      name,
      ok: false,
      ms: performance.now() - startedAt,
      group: currentGroup,
      error: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

export function report() {
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  const lines = [];

  lines.push('');
  lines.push('內容自動化純函式自測');
  lines.push('====================');
  for (const result of results) {
    lines.push(`  ${result.ok ? '✓' : '✗'} ${result.name}  (${result.ms.toFixed(1)}ms)`);
    if (!result.ok) {
      lines.push(`      ${result.error.message.split('\n').join('\n      ')}`);
    }
  }
  lines.push('');
  lines.push(`合計 ${results.length} 項：${passed} 通過，${failed} 失敗`);
  lines.push('');

  console.log(lines.join('\n'));
  if (failed > 0) {
    process.exitCode = 1;
  }
}
