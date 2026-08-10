import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { AdsDailySeriesPoint } from './types';

const COLORS = ['#2563eb', '#94a3b8', '#0d9488'];

export function AdsDonutChart({ series }: { series: AdsDailySeriesPoint[] }) {
  const impressions = series.reduce((s, p) => s + p.impressions, 0);
  const clicks = series.reduce((s, p) => s + p.clicks, 0);
  const nonClicks = Math.max(0, impressions - clicks);

  const data = [
    { name: 'Clicks', value: clicks },
    { name: 'Impr. w/o click', value: nonClicks },
  ].filter((d) => d.value > 0);

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

  return (
    <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card p-4 h-full">
      <div className="mb-3">
        <h3 className="text-[14px] font-semibold">Traffic efficiency</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Clicks vs 未點擊曝光
        </p>
      </div>
      <div className="h-[220px] relative">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">
            此期間尚無資料
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={82}
                  paddingAngle={2}
                >
                  {data.map((entry, i) => (
                    <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: number, name: string) => [
                    value.toLocaleString(undefined, { maximumFractionDigits: 2 }),
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[18px] font-bold tabular-nums">{ctr.toFixed(2)}%</div>
              <div className="text-[10px] text-muted-foreground">CTR</div>
            </div>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-3 mt-1">
        {data.map((entry, i) => (
          <div key={entry.name} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="font-medium tabular-nums">
              {entry.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
