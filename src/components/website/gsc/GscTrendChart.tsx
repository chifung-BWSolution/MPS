import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { GscDailyPoint } from '@/lib/gscReport';

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${m}/${d}`;
}

export function GscTrendChart({ series }: { series: GscDailyPoint[] }) {
  const data = series.map((p) => ({
    date: formatShortDate(p.date),
    clicks: p.clicks,
    impressions: p.impressions,
    position: p.position,
  }));

  return (
    <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card p-4 h-full">
      <div className="mb-3">
        <h3 className="text-[14px] font-semibold">搜尋成效趨勢</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Clicks 與 Impressions 每日趨勢（來自 Search Console）
        </p>
      </div>
      <div className="h-[280px]">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">
            此期間尚無每日資料
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="impressions" name="Impressions" stroke="#94a3b8" dot={false} strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="clicks" name="Clicks" stroke="#0d9488" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
