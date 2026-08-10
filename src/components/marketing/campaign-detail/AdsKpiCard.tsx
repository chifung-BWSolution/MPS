import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import type { AdsKpiItem } from './types';

function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null || !Number.isFinite(deltaPct)) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }
  const positive = deltaPct > 0;
  const negative = deltaPct < 0;
  const label = `${positive ? '+' : ''}${deltaPct.toFixed(1)}%`;
  return (
    <span
      className={cn(
        'text-[11px] font-medium tabular-nums',
        positive && 'text-emerald-600',
        negative && 'text-rose-600',
        !positive && !negative && 'text-muted-foreground',
      )}
    >
      {label}
    </span>
  );
}

export function AdsKpiCard({ item }: { item: AdsKpiItem }) {
  const chartData = item.sparkline.map((v, i) => ({ i, v }));
  const stroke =
    item.deltaPct !== null && item.deltaPct < 0 ? '#e11d48' : '#0d9488';

  return (
    <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md px-3 py-2.5 shadow-card min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground truncate" title={item.hint || item.label}>
            {item.label}
          </div>
          <div className="text-[18px] font-bold tabular-nums leading-tight mt-0.5 truncate">
            {item.value}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <DeltaBadge deltaPct={item.deltaPct} />
            <span className="text-[10px] text-muted-foreground">vs 前一期間</span>
          </div>
        </div>
        <div className="w-[72px] h-[36px] shrink-0">
          {chartData.some((d) => d.v > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={stroke}
                  fill={stroke}
                  fillOpacity={0.12}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full rounded bg-slate-50" />
          )}
        </div>
      </div>
    </div>
  );
}
