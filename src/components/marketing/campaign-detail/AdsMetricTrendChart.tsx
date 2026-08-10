import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AdsDailySeriesPoint } from './types';

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${m}/${d}`;
}

export function AdsMetricTrendChart({ series }: { series: AdsDailySeriesPoint[] }) {
  const data = series.map((p) => ({
    date: formatShortDate(p.date),
    clicks: p.clicks,
    conversions: Number(p.conversions.toFixed(2)),
    cost: Number(p.cost.toFixed(2)),
  }));

  return (
    <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card p-4 h-full">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-[14px] font-semibold">Performance over time</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Clicks、Conversions 與 Cost 每日趨勢
          </p>
        </div>
      </div>
      <div className="h-[280px]">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">
            此期間尚無每日資料
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                width={44}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                width={48}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value: number, name: string) => {
                  if (name === 'cost') {
                    return [value.toLocaleString(undefined, { maximumFractionDigits: 2 }), 'Cost'];
                  }
                  if (name === 'conversions') {
                    return [value.toLocaleString(undefined, { maximumFractionDigits: 2 }), 'Conv.'];
                  }
                  return [value.toLocaleString(), 'Clicks'];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value) =>
                  value === 'clicks' ? 'Clicks' : value === 'conversions' ? 'Conv.' : 'Cost'
                }
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="clicks"
                stroke="#2563eb"
                fill="#2563eb"
                fillOpacity={0.12}
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="conversions"
                stroke="#0d9488"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cost"
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
