import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchStaffNameMap } from '@/components/day-report/staffNameLookup';

export type RecentDayReportEntry = {
  id: string;
  dayReportId: string;
  staffId: string;
  staffName: string;
  reportDate: string;
  category: string;
  relatedName: string;
  title: string;
  hours: number;
};

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, delta: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d;
}

/** Company-wide day report entries for the last N days (inclusive of today). */
export function useRecentDayReports(days = 7) {
  
  const [entries, setEntries] = useState<RecentDayReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = addDays(end, -(days - 1));
    return { start: toLocalDateStr(start), end: toLocalDateStr(end) };
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: reports, error: reportErr } = await supabase
        .from('day_reports')
        .select('id, staff_id, report_date')
        .gte('report_date', range.start)
        .lte('report_date', range.end)
        .order('report_date', { ascending: false });

      if (cancelled) return;
      if (reportErr) {
        setError(reportErr.message);
        setEntries([]);
        setLoading(false);
        return;
      }

      const reportRows = reports || [];
      if (reportRows.length === 0) {
        setEntries([]);
        setError(null);
        setLoading(false);
        return;
      }

      const reportIds = reportRows.map(r => r.id);
      const reportById = new Map(
        reportRows.map(r => [
          r.id,
          {
            staffId: String(r.staff_id),
            reportDate: String(r.report_date).substring(0, 10),
          },
        ]),
      );

      const { data: entryRows, error: entryErr } = await supabase
        .from('day_report_entries')
        .select('id, day_report_id, staff_id, category, related_name, title, hours')
        .in('day_report_id', reportIds)
        .order('sort_order', { ascending: true });

      if (cancelled) return;
      if (entryErr) {
        setError(entryErr.message);
        setEntries([]);
        setLoading(false);
        return;
      }

      const staffIds = [
        ...new Set(
          (entryRows || []).map(e => String(e.staff_id || reportById.get(e.day_report_id)?.staffId || '')).filter(Boolean),
        ),
      ];
      const nameMap = await fetchStaffNameMap(staffIds);
      if (cancelled) return;

      const mapped: RecentDayReportEntry[] = (entryRows || []).map(e => {
        const report = reportById.get(e.day_report_id);
        const staffId = String(e.staff_id || report?.staffId || '');
        return {
          id: String(e.id),
          dayReportId: String(e.day_report_id),
          staffId,
          staffName: nameMap[staffId] || staffId || '—',
          reportDate: report?.reportDate || '',
          category: String(e.category || ''),
          relatedName: String(e.related_name || ''),
          title: String(e.title || ''),
          hours: Number(e.hours) || 0,
        };
      });

      mapped.sort((a, b) => {
        const byDate = b.reportDate.localeCompare(a.reportDate);
        if (byDate !== 0) return byDate;
        return a.staffName.localeCompare(b.staffName, 'zh-Hant');
      });

      setEntries(mapped);
      setError(null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [range.start, range.end]);

  return { entries, loading, error, range };
}
