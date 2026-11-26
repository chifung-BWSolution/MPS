/**
 * ALT Pilot · production smoke test
 *
 * 需要（不要寫進 repo）：
 *   SUPABASE_URL=https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY=<anon key>
 *   ALT_USER_JWT=<登入後的 access token>
 *   ALT_TEST_URL=https://www.bwteam.com/office-design
 *   ALT_GENERATE=1   # 選填；預設只 analyze，不呼叫 LLM
 *
 * 執行：
 *   node scripts/alt-pilot-production-smoke.mjs
 *
 * 注意：analyze 會寫一筆 alt_runs；ALT_GENERATE=1 會再寫 alt_suggestions
 * 並呼叫 1 次 Grok。腳本不會列印 token。
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const USER_JWT = process.env.ALT_USER_JWT || '';
const TEST_URL = process.env.ALT_TEST_URL || 'https://www.bwteam.com/office-design';
const GENERATE = process.env.ALT_GENERATE === '1';

if (!SUPABASE_URL || !ANON_KEY || !USER_JWT) {
  console.error('缺少 SUPABASE_URL／SUPABASE_ANON_KEY／ALT_USER_JWT。');
  process.exit(1);
}

const endpoint = `${SUPABASE_URL}/functions/v1/alt-pilot`;

async function call(action, payload = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${USER_JWT}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok === false) {
    const code = body?.code || `http_${response.status}`;
    const message = body?.error || body?.message || `${response.status} ${response.statusText}`;
    if (code === 'disabled') {
      throw new Error(
        'ALT Pilot 目前 enabled=false。先執行：update public.alt_settings set enabled=true, daily_call_limit=50 where id=\'default\';',
      );
    }
    if (code === 'unauthorized') {
      throw new Error('JWT 無效／過期；請重新登入並更新 ALT_USER_JWT。');
    }
    throw new Error(`${code}: ${message}`);
  }
  return body?.data ?? body;
}

function logResult(label, value) {
  console.log(`\n${label}`);
  console.log(JSON.stringify(value, null, 2));
}

try {
  const analyzed = await call('analyze', { url: TEST_URL });
  const firstImage = (analyzed.images || []).find((image) => !image.decorative) || analyzed.images?.[0];

  logResult('analyze ok', {
    run_id: analyzed.run?.id,
    page_title: analyzed.page?.title,
    page_url: analyzed.page?.url,
    image_count: analyzed.images?.length ?? 0,
    skipped_image_count: analyzed.page?.skippedImageCount ?? 0,
    keyword: analyzed.run?.keyword,
    first_image: firstImage ? { filename: firstImage.filename, url: firstImage.url } : null,
    usage: analyzed.usage,
  });

  if (!firstImage) {
    console.log('\n沒有可處理圖片；analyze 已成功，停止。');
    process.exit(0);
  }

  if (!GENERATE) {
    console.log('\n只做 analyze。要測 1 張 Grok，請加 ALT_GENERATE=1。');
    process.exit(0);
  }

  const generated = await call('generate', {
    run_id: analyzed.run.id,
    images: [firstImage],
    keyword: analyzed.run.keyword,
  });

  logResult('generate ok', {
    errors: generated.errors,
    suggestions: (generated.suggestions || []).map((suggestion) => ({
      id: suggestion.id,
      filename: suggestion.filename,
      suggested_alt: suggestion.suggested_alt,
      provider: suggestion.provider,
      status: suggestion.status,
      confidence: suggestion.confidence,
      risk: suggestion.risk,
      issues: suggestion.issues,
    })),
    usage: generated.usage,
  });
} catch (error) {
  console.error(`\nSMOKE FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
