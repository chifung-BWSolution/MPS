import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ProjectHoursStat = {
  totalHours: number;       // all-time hours from day_report_entries
  growthHours: number;      // hours within the trailing window
  lastUpdate?: string;      // ISO date of latest entry's report_date
};

export type ProjectHoursMap = Record<string, ProjectHoursStat>;

export function useProjectHours(windowDays: number) {
  const [data, setData] = useState<ProjectHoursMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    (async () => {
      // Pull all entries that reference a project. Join day_reports for report_date.
      const { data: rows, error } = await supabase
        .from('day_report_entries')
        .select('related_id, hours, day_reports!inner(report_date)')
        .not('related_id', 'is', null);

      if (cancelled) return;
      if (error || !rows) {
        setData({});
        setLoading(false);
        return;
      }

      const map: ProjectHoursMap = {};
      for (const r of rows as any[]) {
        const id: string | null = r.related_id;
        if (!id) continue;
        const hours = Number(r.hours) || 0;
        const reportDate: string | undefined = r.day_reports?.report_date;
        const stat = map[id] || { totalHours: 0, growthHours: 0, lastUpdate: undefined };
        stat.totalHours += hours;
        if (reportDate && reportDate >= cutoffIso) stat.growthHours += hours;
        if (reportDate && (!stat.lastUpdate || reportDate > stat.lastUpdate)) {
          stat.lastUpdate = reportDate;
        }
        map[id] = stat;
      }

      setData(map);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  return { data, loading };
}
