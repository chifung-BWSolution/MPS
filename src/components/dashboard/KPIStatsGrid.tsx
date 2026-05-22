import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDataStore } from '@/context/DataStore';
import { useMemo } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  change: number;
  changeLabel: string;
}

function StatCard({ label, value, change, changeLabel }: StatCardProps) {
  const isPositive = change >= 0;
  return (
    <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-5 transition-all duration-200 hover:shadow-card-hover">
      <span className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">
        {label}
      </span>
      <div className="mt-2 flex items-end justify-between">
        <span className="text-[32px] font-bold leading-none text-foreground">{value}</span>
        <div className={cn(
          'flex items-center gap-1 text-[13px] font-medium',
          isPositive ? 'text-teal-600' : 'text-rose-500'
        )}>
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{isPositive ? '+' : ''}{change}%</span>
        </div>
      </div>
      <span className="text-[12px] text-muted-foreground mt-1 block">{changeLabel}</span>
    </div>
  );
}

export function KPIStatsGrid() {
  const { projects, websites, allVideosList, allSocialPostsList } = useDataStore();

  const stats: StatCardProps[] = useMemo(() => {
    const activeProjects = projects.filter(p => p.status === 'active').length;
    const totalBudget = projects.reduce((s, p) => s + (p.budgetTotal || 0), 0);
    const usedBudget = projects.reduce((s, p) => s + (p.budgetUsed || 0), 0);
    const budgetRate = totalBudget > 0 ? Math.round((usedBudget / totalBudget) * 100) : 0;
    return [
      { label: '進行中專案', value: String(activeProjects), change: 8.3, changeLabel: '較上月' },
      { label: '網站數', value: String(websites.length), change: 2.1, changeLabel: '較上月' },
      { label: '影片數', value: String(allVideosList.length), change: 12.5, changeLabel: '較上月' },
      { label: '預算使用率', value: `${budgetRate}%`, change: 5.1, changeLabel: '較上月' },
    ];
  }, [projects, websites, allVideosList, allSocialPostsList]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </div>
  );
}
