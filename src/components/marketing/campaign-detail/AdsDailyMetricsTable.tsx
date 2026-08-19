import { formatMoneyAmount } from '@/lib/formatMoney';
import { FacebookAdsConversionHover } from '@/components/marketing/FacebookAdsConversionHover';
import type { AdsDailySeriesPoint } from './types';

function formatMoney(n: number): string {
  return formatMoneyAmount(n);
}

export function AdsDailyMetricsTable({ series }: { series: AdsDailySeriesPoint[] }) {
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
              <th className="text-right font-medium px-3 py-2">Impr.</th>
              <th className="text-right font-medium px-3 py-2">Clicks</th>
              <th className="text-right font-medium px-3 py-2">CTR</th>
              <th className="text-right font-medium px-3 py-2">Cost</th>
              <th className="text-right font-medium px-3 py-2">CPC</th>
              <th className="text-right font-medium px-3 py-2">Conv.</th>
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
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {r.impressions.toLocaleString()}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {r.clicks.toLocaleString()}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {(r.ctr * 100).toFixed(2)}%
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(r.cost)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(r.cpc)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {r.conversionBreakdown ? (
                    <FacebookAdsConversionHover breakdown={r.conversionBreakdown} dateLabel={r.date}>
                      {r.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </FacebookAdsConversionHover>
                  ) : (
                    r.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
