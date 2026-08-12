import { useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
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

export function ProjectProgress({ onSelectProject }: { onSelectProject?: (projectId: string) => void }) {
  const { projects, loading } = useProjects({ activeOnly: true });
  const { data: hoursMap, loading: hoursLoading } = useProjectHours(30);
  const [typeFilter, setTypeFilter] = useState<'all' | ProjectRelatedType>('all');

  const rows = useMemo(() => {
    return projects
      .filter((p) => typeFilter === 'all' || p.relatedType === typeFilter)
      .map((p) => {
        const stat = hoursMap[p.id];
        const teamHours = Math.round((stat?.totalHours ?? 0) * 10) / 10;
        const myHours = Math.round((stat?.myHours ?? 0) * 10) / 10;
        return {
          ...p,
          teamHours,
          myHours,
          growthHours: Math.round(stat?.growthHours ?? 0),
          mySharePct: teamHours > 0 ? Math.round((myHours / teamHours) * 100) : 0,
          lastUpdate: stat?.lastUpdate
            ? new Date(stat.lastUpdate).toLocaleDateString('zh-HK')
            : '—',
        };
      })
      .filter((p) => p.teamHours > 0)
      .sort((a, b) => b.teamHours - a.teamHours);
  }, [projects, hoursMap, typeFilter]);

  if (loading || hoursLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-[13px] text-muted-foreground gap-2">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full" />
        載入工時進度中…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'webandsystem', 'quotation_client', 'vchannel'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setTypeFilter(cat)}
              className={cn(
                'px-3 py-1.5 rounded text-[12px] font-medium transition-colors',
                typeFilter === cat ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {cat === 'all' ? '全部' : relatedTypeLabels[cat]}
            </button>
          ))}
        </div>
        <Select value="30" onValueChange={() => {}}>
          <SelectTrigger className="h-8 text-[12px] w-[130px]">
            <SelectValue placeholder="過去 30 天" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">過去 30 天對比</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {rows.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectProject?.(p.id)}
            className="w-full text-left bg-white rounded-md border border-[rgba(13,26,45,0.08)] p-4 hover:border-teal-200 transition-colors"
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="min-w-0">
                <div className="text-[13px] font-bold truncate">{p.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {relatedTypeLabels[p.relatedType]} · {[p.companyName, p.brandName].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[14px] font-bold tabular-nums">{p.mySharePct}%</div>
                <div className="text-[11px] text-teal-600 tabular-nums">
                  {p.myHours}h / {p.teamHours}h
                </div>
              </div>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-600 rounded-full transition-all"
                style={{ width: `${p.mySharePct}%` }}
              />
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground flex items-center justify-between gap-2">
              <span className="flex items-center gap-1">
                <Clock size={11} /> 最近匯報：{p.lastUpdate}
              </span>
              {p.growthHours > 0 && (
                <span className="text-teal-600 tabular-nums">+{p.growthHours}h / 30天</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="text-center py-12 text-[13px] text-muted-foreground">
          尚無工時進度資料
        </div>
      )}
    </div>
  );
}
