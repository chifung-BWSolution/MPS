import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, Users, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { useProjects, relatedTypeLabels } from '@/hooks/useProjects';
import { fetchStaffNameMap } from '@/components/day-report/staffNameLookup';

type ActivityRow = {
  id: string;
  staffId: string;
  staffName: string;
  category: string;
  title: string;
  hours: number;
  reportDate: string;
};

type TeamMemberAgg = {
  staffId: string;
  name: string;
  hours: number;
  entryCount: number;
};

export function ProjectDetail({ projectId, onBack }: { projectId?: string; onBack?: () => void }) {
  const { getById, loading: projectsLoading } = useProjects();
  const project = getById(projectId);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setActivities([]);
      return;
    }
    let cancelled = false;
    setLoadingEntries(true);
    (async () => {
      const { data, error } = await supabase
        .from('day_report_entries')
        .select('id, staff_id, category, title, hours, day_reports!inner(report_date)')
        .eq('related_id', projectId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (cancelled) return;
      if (error || !data) {
        console.warn('[ProjectDetail] load entries failed:', error?.message);
        setActivities([]);
        setLoadingEntries(false);
        return;
      }

      const staffIds = Array.from(new Set(data.map((r: any) => r.staff_id).filter(Boolean)));
      const nameMap = await fetchStaffNameMap(staffIds);

      if (cancelled) return;
      setActivities(
        data.map((r: any) => ({
          id: r.id,
          staffId: r.staff_id || '',
          staffName: nameMap[r.staff_id] || r.staff_id || '—',
          category: r.category || '',
          title: r.title || '',
          hours: Number(r.hours) || 0,
          reportDate: r.day_reports?.report_date || '',
        })),
      );
      setLoadingEntries(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const totalHours = useMemo(
    () => activities.reduce((s, a) => s + a.hours, 0),
    [activities],
  );

  const team: TeamMemberAgg[] = useMemo(() => {
    const map = new Map<string, TeamMemberAgg>();
    for (const a of activities) {
      if (!a.staffId) continue;
      const cur = map.get(a.staffId) || {
        staffId: a.staffId,
        name: a.staffName,
        hours: 0,
        entryCount: 0,
      };
      cur.hours += a.hours;
      cur.entryCount += 1;
      cur.name = a.staffName;
      map.set(a.staffId, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.hours - a.hours);
  }, [activities]);

  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-[13px] text-muted-foreground gap-2">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full" />
        載入項目中…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft size={14} /> 返回列表
        </Button>
        <div className="text-center py-16 text-[13px] text-muted-foreground">
          找不到此項目（可能尚未同步或已刪除）
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2 mb-2">
            <ArrowLeft size={14} /> 返回列表
          </Button>
          <h1 className="text-[28px] font-bold tracking-tight">{project.name}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap text-[12px] text-muted-foreground">
            <span className={cn(
              'text-[11px] font-bold px-2 py-0.5 rounded',
              project.relatedType === 'quotation_client' ? 'bg-amber-100 text-amber-700'
                : project.relatedType === 'vchannel' ? 'bg-purple-100 text-purple-700'
                : 'bg-blue-100 text-blue-700',
            )}>
              {relatedTypeLabels[project.relatedType]}
            </span>
            <span>{[project.companyName, project.brandName].filter(Boolean).join(' · ') || '—'}</span>
            {project.clientName && <span>客戶：{project.clientName}</span>}
            <span className={cn(
              'px-2 py-0.5 rounded font-medium',
              project.isActive ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-600',
            )}>
              {project.status || (project.isActive ? 'active' : 'inactive')}
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] px-4 py-3 text-right">
            <span className="text-[11px] text-muted-foreground block">總工時</span>
            <span className="text-[20px] font-bold text-teal-600">{Math.round(totalHours)}h</span>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] px-4 py-3 text-right">
            <span className="text-[11px] text-muted-foreground block">團隊人數</span>
            <span className="text-[20px] font-bold">{team.length}</span>
          </div>
          <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] px-4 py-3 text-right">
            <span className="text-[11px] text-muted-foreground block">匯報筆數</span>
            <span className="text-[20px] font-bold">{activities.length}</span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity" className="gap-1.5"><FileText size={13} /> 工時活動</TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5"><Users size={13} /> 團隊成員</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-4">
          {loadingEntries ? (
            <div className="py-12 text-center text-[13px] text-muted-foreground">載入匯報中…</div>
          ) : activities.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-muted-foreground">尚無 day report 工時記錄</div>
          ) : (
            <div className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-muted/40 text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">日期</th>
                    <th className="px-3 py-2 font-medium">同事</th>
                    <th className="px-3 py-2 font-medium">類別</th>
                    <th className="px-3 py-2 font-medium">內容</th>
                    <th className="px-3 py-2 font-medium text-right">工時</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((a) => (
                    <tr key={a.id} className="border-t border-border/40">
                      <td className="px-3 py-2 text-[12px] whitespace-nowrap">
                        <span className="inline-flex items-center gap-1"><Clock size={11} />{a.reportDate || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-[12px]">{a.staffName}</td>
                      <td className="px-3 py-2 text-[12px] text-muted-foreground">{a.category}</td>
                      <td className="px-3 py-2 text-[13px]">{a.title || '—'}</td>
                      <td className="px-3 py-2 text-[13px] font-semibold text-right">{a.hours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          {team.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-muted-foreground">尚無團隊工時資料</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {team.map((m) => (
                <div key={m.staffId} className="bg-white rounded-md border border-[rgba(13,26,45,0.08)] p-4">
                  <div className="text-[14px] font-bold">{m.name}</div>
                  <div className="mt-2 flex items-center justify-between text-[12px] text-muted-foreground">
                    <span>{m.entryCount} 筆匯報</span>
                    <span className="text-[14px] font-bold text-teal-600">{Math.round(m.hours * 10) / 10}h</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
