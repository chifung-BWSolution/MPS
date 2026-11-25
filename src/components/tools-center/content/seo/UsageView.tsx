/**
 * 社媒自動化營運 · 用量看板（M2-15、PRD §9.2.4／§12）
 *
 * 內容：
 *   1. 指標卡：今日呼叫／今日篇數／近 7 天 token（in/out）／估算成本
 *   2. 上限與剩餘：讀 content_settings.daily_article_limit / daily_llm_call_limit，
 *      以今日用量畫進度條；超限轉 amber／rose 並說明順延規則
 *   3. 每日趨勢：recharts 7 天呼叫數（柱）+ token（線）
 *   4. 按模型與用途明細：model / use_case / calls / tokens / cost
 *
 * 成本一律用 contentFormat.estimateLlmCostUsd 的計價來源（LLM_PRICING）估算，
 * 實際費用以 Google 帳單為準。
 */

import { useMemo } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { LucideProps } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  DatabaseZap,
  Gauge,
  RefreshCw,
  Settings2,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useContentSettings } from '@/hooks/useContentSettings';
import { useContentUsage, useContentUsageToday } from '@/hooks/useContentUsage';
import type { ContentViewProps } from '@/lib/contentNavigation.ts';
import { formatNumber, formatUsd } from '@/lib/contentFormat.ts';
import { cn } from '@/lib/utils';
import { ContentEmptyState } from '../shell/ContentEmptyState';
import { ContentPageHeader } from '../shell/ContentPageHeader';

// ============================================================
// 版面小元件
// ============================================================

function SectionCard({
  icon: Icon,
  title,
  description,
  actions,
  children,
}: {
  icon: ComponentType<LucideProps>;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-[rgba(13,26,45,0.06)] px-4 py-3">
        <div className="flex min-w-0 items-start gap-2">
          <Icon size={14} strokeWidth={1.9} className="mt-0.5 shrink-0 text-teal-600" />
          <div className="min-w-0">
            <h2 className="text-[13.5px] font-bold text-[#0d1a2d]">{title}</h2>
            {description && (
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions}
      </header>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ComponentType<LucideProps>;
  tone?: 'default' | 'ok' | 'warn' | 'danger';
}) {
  return (
    <div className="rounded-lg border border-[rgba(13,26,45,0.08)] bg-white px-4 py-3 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <Icon size={14} strokeWidth={1.9} className="shrink-0 text-teal-600" />
      </div>
      <div
        className={cn(
          'mt-1.5 text-[22px] font-bold leading-tight tabular-nums text-[#0d1a2d]',
          tone === 'ok' && 'text-teal-700',
          tone === 'warn' && 'text-amber-600',
          tone === 'danger' && 'text-rose-600',
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** 今日用量 vs 上限進度條（超限 amber／rose，0 = 未設定／未啟用） */
function CapMeter({
  title,
  used,
  limit,
  loading,
  zeroHint,
}: {
  title: string;
  used: number;
  limit: number;
  loading: boolean;
  zeroHint: string;
}) {
  const hasLimit = limit > 0;
  const over = hasLimit && used > limit;
  const near = hasLimit && !over && used / limit >= 0.8;
  const percent = hasLimit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const remaining = Math.max(0, limit - used);

  return (
    <div className="rounded-md border border-[rgba(13,26,45,0.08)] bg-[#fbfdff] px-3.5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">{title}</span>
        <span
          className={cn(
            'text-[13px] font-bold tabular-nums',
            over ? 'text-rose-600' : near ? 'text-amber-600' : 'text-[#0d1a2d]',
          )}
        >
          {loading ? '讀取中…' : `${formatNumber(used)} / ${hasLimit ? formatNumber(limit) : '未設定'}`}
        </span>
      </div>

      {hasLimit ? (
        <>
          <Progress
            value={percent}
            className={cn(
              'mt-2 h-2',
              over
                ? '[&>div]:bg-rose-500'
                : near
                  ? '[&>div]:bg-amber-500'
                  : '[&>div]:bg-teal-600',
            )}
          />
          <p
            className={cn(
              'mt-1.5 text-[11.5px] leading-relaxed',
              over ? 'text-rose-700' : 'text-muted-foreground',
            )}
          >
            {over
              ? `已超出 ${formatNumber(used - limit)}（${percent}%）；剩餘 job 會順延至次日 00:05，slot 轉 held。`
              : `剩餘 ${formatNumber(remaining)}（已用 ${percent}%）`}
          </p>
        </>
      ) : loading ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">讀取上限…</p>
      ) : (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-amber-700">{zeroHint}</p>
      )}
    </div>
  );
}

// ============================================================
// 頁面
// ============================================================

export function UsageView({ navigate }: ContentViewProps) {
  const { summary, daily, byModel, loading, error, missingSchema, refresh } = useContentUsage(7);
  const today = useContentUsageToday();
  const { settings, loading: settingsLoading, error: settingsError } = useContentSettings();

  const callLimit = settings?.daily_llm_call_limit ?? 0;
  const articleLimit = settings?.daily_article_limit ?? 0;
  const callOver = callLimit > 0 && today.calls > callLimit;
  const articleOver = articleLimit > 0 && today.articles > articleLimit;

  const chartData = useMemo(
    () =>
      daily.map((day) => ({
        date: day.date.slice(5).replace('-', '/'),
        calls: day.calls,
        tokens: day.tokensIn + day.tokensOut,
      })),
    [daily],
  );
  const hasChartData = chartData.some((point) => point.calls > 0 || point.tokens > 0);
  const tokensTotal = summary.tokensIn + summary.tokensOut;

  return (
    <div className="space-y-5">
      <ContentPageHeader
        eyebrow={
          <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700">
            SEO · 成本與額度
          </span>
        }
        title="內容自動化 · 用量"
        subtitle="今日呼叫、今日生成篇數、近 7 天 token 與估算成本；上限與剩餘同步自全域設定。成本為依 LLM_PRICING 的估算，實際以 Google 帳單為準。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-muted-foreground"
              onClick={() => {
                void refresh();
                void today.refresh();
              }}
              disabled={loading || today.loading}
              title="重新整理用量"
            >
              <RefreshCw
                size={13}
                className={loading || today.loading ? 'animate-spin' : undefined}
              />
              重新整理
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate('seo', 'settings')}
            >
              <Settings2 size={13} />
              調整每日上限
            </Button>
          </div>
        }
      />

      {missingSchema ? (
        <ContentEmptyState
          icon={DatabaseZap}
          tone="warning"
          title="功能尚未啟用"
          description="content_llm_usage／content_articles 資料表還沒建立（Postgres 42P01）。請先執行本次 migration，再回到本頁重新載入。"
          action={
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              <RefreshCw size={13} />
              重新檢查
            </Button>
          }
        />
      ) : loading && daily.length === 0 ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <div
                key={key}
                className="h-[92px] animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card"
              />
            ))}
          </div>
          <div className="h-[320px] animate-pulse rounded-lg border border-[rgba(13,26,45,0.08)] bg-white shadow-card" />
        </div>
      ) : error ? (
        <ContentEmptyState
          icon={AlertTriangle}
          tone="error"
          title="讀取用量失敗"
          description={error}
          action={
            <Button size="sm" onClick={() => void refresh()}>
              <RefreshCw size={13} />
              再試一次
            </Button>
          }
        />
      ) : (
        <>
          {/* 1. 指標卡 */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={Activity}
              label="今日 LLM 呼叫"
              value={formatNumber(today.calls)}
              sub={callLimit > 0 ? `上限 ${formatNumber(callLimit)} 次` : '上限未設定／為 0'}
              tone={callOver ? 'danger' : callLimit > 0 && today.calls / callLimit >= 0.8 ? 'warn' : 'default'}
            />
            <MetricCard
              icon={Gauge}
              label="今日生成篇數"
              value={formatNumber(today.articles)}
              sub={
                articleLimit > 0
                  ? `上限 ${formatNumber(articleLimit)} 篇`
                  : '0 = 不自動生成（目前關閉）'
              }
              tone={
                articleOver
                  ? 'danger'
                  : articleLimit === 0
                    ? 'default'
                    : today.articles / articleLimit >= 0.8
                      ? 'warn'
                      : 'default'
              }
            />
            <MetricCard
              icon={Activity}
              label="近 7 天 token"
              value={formatNumber(tokensTotal)}
              sub={`輸入 ${formatNumber(summary.tokensIn)} · 輸出 ${formatNumber(summary.tokensOut)}`}
            />
            <MetricCard
              icon={Wallet}
              label="近 7 天估算成本"
              value={formatUsd(summary.costUsd)}
              sub={`${formatNumber(summary.calls)} 次呼叫，依牌價估算`}
            />
          </div>

          {!loading && summary.calls === 0 && (
            <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate-700">
              <Activity size={15} className="mt-0.5 shrink-0 text-slate-400" />
              <p>
                近 7 天還沒有 LLM 用量紀錄。worker 生成文章並寫入 content_llm_usage 後，這裡會出現每日趨勢與模型明細。
              </p>
            </div>
          )}

          {/* 2. 上限與剩餘 */}
          <SectionCard
            icon={Gauge}
            title="每日上限與剩餘"
            description="上限讀自 content_settings；今日用量以香港時間 00:00 起算。超限時剩餘 job 順延至次日 00:05（PRD §12）。"
            actions={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11.5px] text-teal-700"
                onClick={() => navigate('seo', 'settings')}
              >
                <Settings2 size={13} />
                修改
              </Button>
            }
          >
            {settingsError ? (
              <p className="mb-2 text-[12px] text-rose-600">
                讀取上限失敗：{settingsError}（目前以 0 顯示）
              </p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <CapMeter
                title="今日 LLM 呼叫"
                used={today.calls}
                limit={callLimit}
                loading={settingsLoading || today.loading}
                zeroHint="上限 0 = 不呼叫 LLM；自動生成不會執行。到設定頁輸入大於 0 的值才會開始消耗額度。"
              />
              <CapMeter
                title="今日生成篇數"
                used={today.articles}
                limit={articleLimit}
                loading={settingsLoading || today.loading}
                zeroHint="0 = 不自動生成（出廠預設）。到設定頁套用建議免費層上限或自行輸入篇數。"
              />
            </div>
            {today.error && (
              <p className="mt-2 text-[11.5px] text-rose-600">今日用量讀取失敗：{today.error}</p>
            )}
          </SectionCard>

          {/* 3. 每日趨勢 */}
          <SectionCard
            icon={Activity}
            title="近 7 天趨勢"
            description="每日 LLM 呼叫次數（柱）與 token 總量（線）；以香港時間分日。"
          >
            <div className="h-[280px]">
              {!hasChartData ? (
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
                  <Activity size={22} className="text-slate-300" />
                  <p className="text-[12.5px] font-medium text-[#0d1a2d]">此期間尚無用量資料</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    開始自動生成後，這裡會每天累積一筆。
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11 }}
                      width={40}
                      allowDecimals={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      width={52}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      formatter={(value: number, name: string) => [
                        formatNumber(Number(value)),
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar
                      yAxisId="left"
                      dataKey="calls"
                      name="呼叫次數"
                      fill="#0d9488"
                      radius={[3, 3, 0, 0]}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="tokens"
                      name="Tokens（in+out）"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </SectionCard>

          {/* 4. 按模型與用途 */}
          <SectionCard
            icon={Wallet}
            title="按模型與用途"
            description="彙總近 7 天 content_llm_usage；成本為估算值。"
            actions={
              <span className="text-[11px] text-muted-foreground">
                合計 {formatNumber(summary.calls)} 次呼叫 · {formatUsd(summary.costUsd)}
              </span>
            }
          >
            {byModel.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-muted-foreground">
                此期間尚無模型用量明細。
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="text-[12.5px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">模型</TableHead>
                      <TableHead className="h-8">用途</TableHead>
                      <TableHead className="h-8 text-right">呼叫</TableHead>
                      <TableHead className="h-8 text-right">Tokens（in / out）</TableHead>
                      <TableHead className="h-8 text-right">估算成本</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byModel.map((row) => (
                      <TableRow key={`${row.model}:${row.useCase}`}>
                        <TableCell className="py-2 font-medium text-[#0d1a2d]">
                          {row.model}
                        </TableCell>
                        <TableCell className="py-2 text-muted-foreground">
                          {row.useCase}
                        </TableCell>
                        <TableCell className="py-2 text-right tabular-nums">
                          {formatNumber(row.calls)}
                        </TableCell>
                        <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                          {formatNumber(row.tokensIn)} / {formatNumber(row.tokensOut)}
                        </TableCell>
                        <TableCell className="py-2 text-right tabular-nums">
                          {formatUsd(row.costUsd)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              成本依 LLM_PRICING 牌價估算（每 100 萬 tokens），實際費用以 Google 帳單為準；免費層不計費。
            </p>
          </SectionCard>
        </>
      )}
    </div>
  );
}
