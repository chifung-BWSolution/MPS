import { formatDurationSeconds } from '@/lib/ga4Traffic';
import type { Ga4DailyMetricPoint } from '@/types/ga4';

export function Ga4DailyMetricsTable({ series }: { series: Ga4DailyMetricPoint[] }) {
  const rows = [...series].reverse();

  return (
    <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-[14px] font-semibold">Daily metrics</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">由新到舊的每日指標</p>
      </div>
      <div className="overflow-auto max-h-[280px]">
        <table className="w-full text-[12px]">
          <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Date</th>
              <th className="text-right font-medium px-3 py-2">Users</th>
              <th className="text-right font-medium px-3 py-2">Sessions</th>
              <th className="text-right font-medium px-3 py-2">Views</th>
              <th className="text-right font-medium px-3 py-2">Bounce</th>
              <th className="text-right font-medium px-3 py-2">Eng.</th>
              <th className="text-right font-medium px-3 py-2">Duration</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  此期間尚無資料
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.date} className="border-t border-slate-100">
                <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">{r.date}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.users.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.sessions.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.pageviews.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {(r.bounceRate * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {(r.engagementRate * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatDurationSeconds(r.avgSessionDuration)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
