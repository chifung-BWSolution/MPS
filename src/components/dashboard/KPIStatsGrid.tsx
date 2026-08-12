import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardOverviewStats } from '@/hooks/useDashboardOverviewStats';

interface StatCardProps {
  label: string;
  value: string;
  change: number | null;
  changeLabel: string;
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${Number(text).toLocaleString('en-US')}h`;
}

function StatCard({ label, value, change, changeLabel }: StatCardProps) {
  const showChange = change != null;
  const isPositive = (change ?? 0) >= 0;
  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5 transition-all duration-200 hover:shadow-card-hover">
      <span className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">
        {label}
      </span>
      <div className="mt-2 flex items-end justify-between">
        <span className="text-[32px] font-bold leading-none text-foreground">{value}</span>
        {showChange && (
          <div className={cn(
            'flex items-center gap-1 text-[13px] font-medium',
            isPositive ? 'text-teal-600' : 'text-rose-500'
          )}>
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{isPositive ? '+' : ''}{change}%</span>
          </div>
        )}
      </div>
      <span className="text-[12px] text-muted-foreground mt-1 block">{changeLabel}</span>
    </div>
  );
}

export function KPIStatsGrid() {
  const {
    liveWebsiteCount,
    publishedVideoCount,
    thisMonthHours,
    hoursMomPct,
    videosMomPct,
    loading,
  } = useDashboardOverviewStats();

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5 h-[120px] animate-pulse"
          />
        ))}
      </div>
    );
  }

  const stats: StatCardProps[] = [
    {
      label: '網站總數',
      value: String(liveWebsiteCount),
      change: null,
      changeLabel: '目前上線',
    },
    {
      label: '影片總數',
      value: String(publishedVideoCount),
      change: videosMomPct,
      changeLabel: videosMomPct == null ? '已發佈' : '本月新發佈較上月',
    },
    {
      label: '總投入工時',
      value: formatHours(thisMonthHours),
      change: hoursMomPct,
      changeLabel: hoursMomPct == null ? '本月累計' : '較上月',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </div>
  );
}
