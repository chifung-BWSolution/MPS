import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ADS_COMPARE_METRICS, formatMetricValue, metricValue } from '@/lib/adsDailySeries';
import type { AdsCompareMetric, AdsCompareSeriesPoint } from '@/types/adsComparison';

const METRIC_COLOR: Record<AdsCompareMetric, string> = {
  impressions: '#64748b',
  clicks: '#2563eb',
  cost: '#d97706',
  conversions: '#0d9488',
  ctr: '#7c3aed',
  cpc: '#e11d48',
};

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${m}/${d}`;
}

export function AdsComparisonMetricChart({
  series,
  metric,
  loading,
  emptyText,
}: {
  series: AdsCompareSeriesPoint[];
  metric: AdsCompareMetric;
  loading?: boolean;
  emptyText?: string;
}) {
  const meta = ADS_COMPARE_METRICS.find((m) => m.id === metric);
  const color = METRIC_COLOR[metric];
  const data = series.map((p) => ({
    date: formatShortDate(p.date),
    value: Number(metricValue(p, metric).toFixed(metric === 'impressions' || metric === 'clicks' ? 0 : 2)),
  }));

  return (
    <div className="bg-[#f8fafc] border border-[rgba(13,26,45,0.06)] rounded-md p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="text-[13px] font-semibold">{meta?.label ?? metric}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">每日趨勢</p>
        </div>
      </div>
      <div className="h-[220px]">
        {loading ? (
          <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">
            載入中…
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">
            {emptyText || '此期間尚無每日資料'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={20} />
              <YAxis
                tick={{ fontSize: 10 }}
                width={metric === 'cost' || metric === 'cpc' || metric === 'ctr' ? 52 : 44}
                tickFormatter={(v: number) =>
                  metric === 'ctr' ? `${v}` : metric === 'impressions' || metric === 'clicks'
                    ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
                    : Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 })
                }
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value: number) => [formatMetricValue(value, metric), meta?.shortLabel ?? metric]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                fill={color}
                fillOpacity={0.12}
                strokeWidth={0}
                isAnimationActive={false}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
