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

const SERIES_COLORS = ['#0d9488', '#2563eb', '#1877F2', '#d97706', '#7c3aed', '#e11d48', '#64748b'];

export function AdsCostTrendChart({
  data,
  seriesKeys,
  description,
  loading,
}: {
  data: { label: string; [key: string]: string | number }[];
  seriesKeys: { key: string; label: string }[];
  description: string;
  loading?: boolean;
}) {
  const totalSeries = seriesKeys.filter((series) => series.key === 'total');
  const lineSeries = seriesKeys.filter((series) => series.key !== 'total');

  return (
    <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-[14px] font-semibold">廣告成本趨勢</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
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
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
              {totalSeries.map((series) => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={series.label}
                  fill={SERIES_COLORS[0]}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={36}
                />
              ))}
              {lineSeries.map((series, index) => (
                <Line
                  key={series.key}
                  type="monotone"
                  dataKey={series.key}
                  name={series.label}
                  stroke={SERIES_COLORS[(index + 1) % SERIES_COLORS.length]}
                  strokeWidth={1.75}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
