import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { EmptyDash } from '@/components/ui/nullable-badge';
import { formatUsersWithChange, type Ga4WebsiteTrafficSummary } from '@/lib/ga4WebsiteListTraffic';

const TREND_COLOR = {
  up: '#16a34a',
  down: '#e11d48',
  flat: '#94a3b8',
} as const;

function changeClass(changePct: number | null): string {
  if (changePct == null || !Number.isFinite(changePct) || changePct === 0) {
    return 'text-muted-foreground';
  }
  return changePct > 0 ? 'text-green-600' : 'text-red-600';
}

export function Ga4RecentTrafficCell({
  summary,
  loading,
}: {
  summary?: Ga4WebsiteTrafficSummary;
  loading?: boolean;
}) {
  if (loading && !summary) {
    return <span className="text-[12px] text-muted-foreground">…</span>;
  }
  if (!summary) return <EmptyDash />;

  const label = formatUsersWithChange(summary.currentUsers, summary.changePct);
  const split = label.match(/^(.*)\s(\(.*\))$/);
  const usersLabel = split?.[1] ?? label;
  const pctLabel = split?.[2] ?? '';

  return (
    <span
      className="text-[13px] font-medium tabular-nums whitespace-nowrap"
      title="GA4 Users：最近 14 天 vs 前 14 天"
    >
      {usersLabel}
      {pctLabel ? (
        <span className={cn('ml-1 font-medium', changeClass(summary.changePct))}>{pctLabel}</span>
      ) : null}
    </span>
  );
}

export function Ga4TrafficTrendCell({
  summary,
  loading,
}: {
  summary?: Ga4WebsiteTrafficSummary;
  loading?: boolean;
}) {
  if (loading && !summary) {
    return <span className="text-[12px] text-muted-foreground">…</span>;
  }
  if (!summary || !summary.dailyUsers.some((value) => value > 0)) {
    return <EmptyDash />;
  }

  const data = summary.dailyUsers.map((v, i) => ({ i, v }));
  const stroke = TREND_COLOR[summary.trend];

  return (
    <div
      className="w-[88px] h-[32px] pointer-events-none"
      title={summary.trend === 'up' ? '上升趨勢' : summary.trend === 'down' ? '下降趨勢' : '持平'}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
