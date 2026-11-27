import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

interface UsageRow {
  feature: string;
  operation: string;
  provider: string;
  model: string;
  calls: number;
  errors: number;
  records_with_tokens: number;
  records_with_cost: number;
  legacy_records: number;
  records_without_call_count: number;
  tokens_in: number;
  tokens_out: number;
  estimated_cost_usd: number;
}

const periods = [
  { days: 1, label: '今日' },
  { days: 7, label: '近 7 天' },
  { days: 30, label: '近 30 天' },
];

const featureLabels: Record<string, string> = {
  'ads-campaign-advisor': '廣告顧問',
  'ad-creative-writer': '廣告文案',
  'crosspost-writer': '跨平台文案',
  'alt-pilot': 'ALT Pilot',
  'content-automation': '內容自動化',
  'readdy-framer': 'Readdy → Framer',
};

const operationLabels: Record<string, string> = {
  advise: '分析與對話',
  generate_copy: '生成文案',
  rewrite_copy: '改寫文案',
  alt_generate: '生成圖片 ALT',
  generate_article: '生成 SEO 文章',
  social: '生成社媒文案',
  social_dedupe: '社媒內容去重',
  social_dedupe_review: '覆核社媒去重',
  github_interpret: '解讀頁面原始碼',
  parse_roles: '識別頁面區塊',
  parse_ir: '解析頁面結構',
};

const providerLabels: Record<string, string> = { gemini: 'Gemini', grok: 'Grok', deepseek: 'DeepSeek' };
const count = new Intl.NumberFormat('zh-HK');
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 8 });

export function AiUsageSettings() {
  const [days, setDays] = useState(7);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ days: number; revision: number; rows: UsageRow[] | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await supabase.rpc('ai_usage_summary', { p_days: days }).abortSignal(controller.signal);
        if (!controller.signal.aborted) {
          setResult({ days, revision, rows: !error && Array.isArray(data) ? data as UsageRow[] : null });
        }
      } catch {
        if (!controller.signal.aborted) setResult({ days, revision, rows: null });
      }
    }
    void load();
    return () => controller.abort();
  }, [days, revision]);

  const current = result?.days === days && result.revision === revision ? result : null;
  const rows = current?.rows ?? [];
  const totals = rows.reduce((total, row) => ({
    calls: total.calls + row.calls,
    errors: total.errors + row.errors,
    tokens: total.tokens + row.tokens_in + row.tokens_out,
    tokenRecords: total.tokenRecords + row.records_with_tokens,
    cost: total.cost + row.estimated_cost_usd,
    pricedRecords: total.pricedRecords + row.records_with_cost,
    historical: total.historical + row.legacy_records,
    unknownCounts: total.unknownCounts + row.records_without_call_count,
  }), { calls: 0, errors: 0, tokens: 0, tokenRecords: 0, cost: 0, pricedRecords: 0, historical: 0, unknownCounts: 0 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {periods.map(period => (
          <Button
            key={period.days}
            type="button"
            size="sm"
            variant={days === period.days ? 'default' : 'outline'}
            aria-pressed={days === period.days}
            onClick={() => setDays(period.days)}
          >
            {period.label}
          </Button>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => setRevision(value => value + 1)}>
          重新載入
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        以香港時間計算。每次供應商請求獨立計入，包括重試、備援及多輪調用。成本僅涵蓋可估算的請求。
      </p>
      {!current && <p role="status" className="text-sm text-muted-foreground">載入 AI 用量…</p>}
      {current?.rows === null && <p role="alert" className="text-sm text-destructive">無法載入 AI 用量。請重新載入。</p>}
      {current?.rows && rows.length === 0 && (
        <p role="status" className="rounded-md border bg-white p-4 text-sm text-muted-foreground">此時段沒有 AI 調用紀錄。</p>
      )}
      {rows.length > 0 && (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['已記錄調用', count.format(totals.calls)],
              ['已記錄請求錯誤', count.format(totals.errors)],
              ['已回報 Token', totals.tokenRecords ? count.format(totals.tokens) : '—'],
              ['估算成本（USD）', totals.pricedRecords ? usd.format(totals.cost) : '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border bg-white p-4 shadow-card">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            {count.format(totals.tokenRecords)} 筆有 Token 資料，{count.format(totals.pricedRecords)} 筆有成本資料。
            {totals.historical > 0 && ` 其中包含 ${count.format(totals.historical)} 筆歷史紀錄，歷史請求錯誤資料不完整。`}
            {totals.unknownCounts > 0 && ` ${count.format(totals.unknownCounts)} 筆歷史工作只保留用量合計，實際調用次數未納入。`}
          </p>
          <div className="overflow-x-auto rounded-md border bg-white shadow-card">
            <table className="w-full whitespace-nowrap text-sm">
              <caption className="sr-only">AI 用量明細</caption>
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  {['功能', '用途', '供應商', '模型'].map(label => <th key={label} scope="col" className="px-4 py-3 text-left font-medium">{label}</th>)}
                  {['調用', '錯誤', '輸入 Token', '輸出 Token', '估算 USD'].map(label => <th key={label} scope="col" className="px-4 py-3 text-right font-medium">{label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(row => (
                  <tr key={JSON.stringify([row.feature, row.operation, row.provider, row.model])}>
                    <th scope="row" className="px-4 py-2 text-left font-medium">{featureLabels[row.feature] ?? row.feature}</th>
                    <td className="px-4 py-2">{operationLabels[row.operation] ?? row.operation}</td>
                    <td className="px-4 py-2">{providerLabels[row.provider] ?? row.provider}</td>
                    <td className="px-4 py-2">{row.model}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{count.format(row.calls)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{count.format(row.errors)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.records_with_tokens ? count.format(row.tokens_in) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.records_with_tokens ? count.format(row.tokens_out) : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.records_with_cost ? usd.format(row.estimated_cost_usd) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
