import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { Ga4ChannelPoint } from '@/types/ga4';

const COLORS = [
  '#2563eb',
  '#0d9488',
  '#f59e0b',
  '#8b5cf6',
  '#e11d48',
  '#64748b',
  '#14b8a6',
  '#f97316',
];

export function Ga4DonutChart({ channels }: { channels: Ga4ChannelPoint[] }) {
  const data = channels
    .filter((c) => c.sessions > 0)
    .slice(0, 8)
    .map((c) => ({ name: c.channel, value: c.sessions }));
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card p-4 h-full">
      <div className="mb-3">
        <h3 className="text-[14px] font-semibold">Channel mix</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Session default channel group
        </p>
      </div>
      <div className="h-[220px] relative">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">
            此期間尚無渠道資料
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
                    Number(value).toLocaleString(),
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[18px] font-bold tabular-nums">{total.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">Sessions</div>
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
            <span className="font-medium tabular-nums">{entry.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
