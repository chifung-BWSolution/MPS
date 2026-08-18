import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Ga4DailyMetricPoint } from '@/types/ga4';

const DOW_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

export function Ga4DayOfWeekChart({ series }: { series: Ga4DailyMetricPoint[] }) {
  const buckets = DOW_LABELS.map((label) => ({
    day: label,
    sessions: 0,
    users: 0,
  }));

  for (const point of series) {
    const [y, m, d] = point.date.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    buckets[dow].sessions += point.sessions;
    buckets[dow].users += point.users;
  }

  return (
    <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card p-4 h-full">
      <div className="mb-3">
        <h3 className="text-[14px] font-semibold">Day of week</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          期間內各星期幾的 Sessions / Users 合計
        </p>
      </div>
      <div className="h-[240px]">
        {series.every((p) => p.sessions === 0 && p.users === 0) ? (
          <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">
            此期間尚無資料
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={44} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value: number, name: string) => [
                  Number(value).toLocaleString(),
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="sessions" name="Sessions" fill="#2563eb" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="right" dataKey="users" name="Users" fill="#0d9488" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
