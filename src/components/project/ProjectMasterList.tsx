import { useMemo, useState } from 'react';
import { Clock, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjects, relatedTypeLabels, type ProjectRelatedType, type MasterProject } from '@/hooks/useProjects';
import { useProjectHours } from '@/hooks/useProjectHours';
import { Input } from '@/components/ui/input';

type Props = {
  relatedTypes: ProjectRelatedType[];
  onSelectProject?: (projectId: string) => void;
  showTypeFilter?: boolean;
};

export function ProjectMasterList({ relatedTypes, onSelectProject, showTypeFilter = false }: Props) {
  const { projects, loading } = useProjects({ relatedType: relatedTypes });
  const { data: hoursMap } = useProjectHours(30);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ProjectRelatedType>('all');
  const [activeOnly, setActiveOnly] = useState(true);

  const filtered = useMemo(() => {
    return projects
      .filter((p) => {
        if (activeOnly && !p.isActive) return false;
        if (typeFilter !== 'all' && p.relatedType !== typeFilter) return false;
        if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      })
      .map((p) => {
        const stat = hoursMap[p.id];
        return {
          ...p,
          totalHours: Math.round(stat?.totalHours ?? 0),
          growthHours: Math.round(stat?.growthHours ?? 0),
          lastUpdate: stat?.lastUpdate
            ? new Date(stat.lastUpdate).toLocaleDateString('zh-HK')
            : '—',
        };
      })
      .sort((a, b) => b.totalHours - a.totalHours || a.name.localeCompare(b.name, 'zh-HK'));
  }, [projects, hoursMap, searchQuery, typeFilter, activeOnly]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[13px] text-muted-foreground gap-2">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full" />
        從資料庫載入中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋項目名稱..."
            className="pl-8 h-9 text-[13px]"
          />
        </div>
        {showTypeFilter && (
          <div className="flex items-center gap-1.5">
            {(['all', ...relatedTypes] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={cn(
                  'px-3 py-1.5 rounded text-[12px] font-medium transition-colors',
                  typeFilter === t ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {t === 'all' ? '全部' : relatedTypeLabels[t]}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setActiveOnly((v) => !v)}
          className={cn(
            'px-3 py-1.5 rounded text-[12px] font-medium transition-colors',
            activeOnly ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80',
          )}
        >
          {activeOnly ? '僅啟用中' : '含停用'}
        </button>
        <span className="text-[12px] text-muted-foreground ml-auto">共 {filtered.length} 項</span>
      </div>

      <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-muted/40 text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">項目名稱</th>
              <th className="px-3 py-2 font-medium">類型</th>
              <th className="px-3 py-2 font-medium">公司/品牌</th>
              <th className="px-3 py-2 font-medium">狀態</th>
              <th className="px-3 py-2 font-medium text-right">總工時</th>
              <th className="px-3 py-2 font-medium text-right">30天增長</th>
              <th className="px-3 py-2 font-medium">最近匯報</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.id}
                className="border-t border-border/40 hover:bg-teal-50/40 cursor-pointer transition-colors"
                onClick={() => onSelectProject?.(p.id)}
              >
                <td className="px-3 py-2.5">
                  <div className="text-[13px] font-medium">{p.name}</div>
                  {p.clientName && (
                    <div className="text-[11px] text-muted-foreground">客戶：{p.clientName}</div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <TypeBadge type={p.relatedType} />
                </td>
                <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                  {[p.companyName, p.brandName].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn(
                    'text-[11px] px-2 py-0.5 rounded font-medium',
                    p.isActive ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-600',
                  )}>
                    {p.status || (p.isActive ? 'active' : 'inactive')}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-[13px] font-semibold">{p.totalHours}h</td>
                <td className="px-3 py-2.5 text-right text-[13px] font-semibold text-teal-600">+{p.growthHours}h</td>
                <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock size={11} />{p.lastUpdate}</span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-[13px] text-muted-foreground">
                  沒有符合條件的項目
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: ProjectRelatedType }) {
  const styles: Record<ProjectRelatedType, string> = {
    webandsystem: 'bg-blue-50 text-blue-700',
    quotation_client: 'bg-amber-50 text-amber-700',
    vchannel: 'bg-purple-50 text-purple-700',
    manual: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={cn('text-[11px] px-2 py-0.5 rounded font-medium', styles[type])}>
      {relatedTypeLabels[type]}
    </span>
  );
}

export type { MasterProject };
