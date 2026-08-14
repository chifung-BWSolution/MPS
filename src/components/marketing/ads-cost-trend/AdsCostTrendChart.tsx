import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ADS_COST_TREND_BUCKETS } from '@/lib/adsCostTrend';

const LINE_COLORS = ['#0d9488', '#2563eb', '#1877F2', '#d97706', '#7c3aed', '#e11d48', '#64748b'];

export function AdsCostTrendChart({
  data,
  seriesKeys,
  loading,
}: {
  data: { label: string; [key: string]: string | number }[];
  seriesKeys: { key: string; label: string }[];
  loading?: boolean;
}) {
  return (
    <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-[14px] font-semibold">廣告成本趨勢</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            依目前篩選，顯示近 180 日每 30 日區間的成本（{ADS_COST_TREND_BUCKETS.map((b) => b.label).join(' / ')}）
          </p>
        </div>
      </div>
      <div className="h-[280px]">
        {loading ? (
          <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">
            載入中…
          </div>
        ) : data.length === 0 || seriesKeys.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">
            此篩選尚無成本資料
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                width={64}
                tickFormatter={(value: number) =>
                  `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                }
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value: number, name: string) => [
                  `$${Number(value).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`,
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              {seriesKeys.map((series, index) => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke={LINE_COLORS[index % LINE_COLORS.length]}
                  strokeWidth={series.key === 'total' ? 2.5 : 1.75}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
