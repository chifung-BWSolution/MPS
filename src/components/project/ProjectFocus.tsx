import { useMemo, useState } from 'react';
import { TrendingUp, Clock, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjects, relatedTypeLabels, type ProjectRelatedType } from '@/hooks/useProjects';
import { useProjectHours } from '@/hooks/useProjectHours';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ProjectFocus({ onSelectProject }: { onSelectProject?: (projectId: string) => void }) {
  const { projects, loading } = useProjects({ activeOnly: true });
  const [timeRange, setTimeRange] = useState<string>('14');
  const [typeFilter, setTypeFilter] = useState<'all' | ProjectRelatedType>('all');
  const { data: hoursMap } = useProjectHours(parseInt(timeRange, 10));

  const projectsWithGrowth = useMemo(() => {
    return projects
      .filter((p) => typeFilter === 'all' || p.relatedType === typeFilter)
      .map((p) => {
        const stat = hoursMap[p.id];
        const growth = Math.round(stat?.growthHours ?? 0);
        const totalHours = Math.round(stat?.totalHours ?? 0);
        const lastUpdate = stat?.lastUpdate
          ? new Date(stat.lastUpdate).toLocaleDateString('zh-HK')
          : '—';
        return {
          ...p,
          growth,
          totalHours,
          isHighActivity: growth >= 20,
          lastUpdate,
        };
      })
      .filter((p) => p.totalHours > 0 || p.growth > 0)
      .sort((a, b) => b.growth - a.growth || b.totalHours - a.totalHours);
  }, [projects, hoursMap, typeFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[13px] text-muted-foreground gap-2">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full" />
        從資料庫載入中…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {(['all', 'webandsystem', 'quotation_client', 'vchannel'] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setTypeFilter(cat)}
            className={cn(
              'px-3 py-1.5 rounded text-[12px] font-medium transition-colors duration-200',
              typeFilter === cat ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            {cat === 'all' ? '全部' : relatedTypeLabels[cat]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">有工時項目</span>
            <p className="text-[18px] font-bold">{projectsWithGrowth.length}</p>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">{timeRange}天總工時增長</span>
            <p className="text-[18px] font-bold text-teal-600">
              +{projectsWithGrowth.reduce((s, p) => s + p.growth, 0)}h
            </p>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card px-4 py-3">
            <span className="text-[11px] text-muted-foreground">高活躍</span>
            <p className="text-[18px] font-bold text-orange-600">
              {projectsWithGrowth.filter((p) => p.isHighActivity).length}
            </p>
          </div>
        </div>

        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="h-8 text-[12px] w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">過去 7 天</SelectItem>
            <SelectItem value="14">過去 14 天</SelectItem>
            <SelectItem value="30">過去 30 天</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {projectsWithGrowth.map((project) => (
          <div
            key={project.id}
            className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] shadow-card p-4 hover:shadow-card-hover transition-all duration-200 cursor-pointer"
            onClick={() => onSelectProject?.(project.id)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h4 className="text-[14px] font-bold truncate">{project.name}</h4>
                  <span className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded',
                    project.relatedType === 'quotation_client' ? 'bg-amber-100 text-amber-700'
                      : project.relatedType === 'vchannel' ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700',
                  )}>
                    {relatedTypeLabels[project.relatedType]}
                  </span>
                  {project.isHighActivity && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-700 flex items-center gap-0.5">
                      <Flame size={10} /> 高活躍
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[12px] text-muted-foreground flex-wrap">
                  <span>{[project.companyName, project.brandName].filter(Boolean).join(' · ') || '—'}</span>
                  {project.clientName && <span>客戶: {project.clientName}</span>}
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    最近更新: {project.lastUpdate}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <div className="flex items-center gap-1 text-teal-600 justify-end">
                    <TrendingUp size={12} />
                    <span className="text-[14px] font-bold">+{project.growth}h</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{timeRange}天增長</span>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <Clock size={12} className="text-muted-foreground" />
                    <span className="text-[14px] font-bold">{project.totalHours}h</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">總工時</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {projectsWithGrowth.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-[13px]">
          此期間沒有工時匯報的項目
        </div>
      )}
    </div>
  );
}
