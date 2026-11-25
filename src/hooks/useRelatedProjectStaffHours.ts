import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { resolveRelatedDayReportIds } from '@/lib/resolveProjectHub';
import type { QuotationBvHourEntry, QuotationBvHourStat } from '@/lib/quotationBv';

type ReportJoin = { report_date: string | null } | Array<{ report_date: string | null }> | null;

type EntryRow = {
  staff_id: string | null;
  hours: number | string | null;
  title: string | null;
  day_reports: ReportJoin;
};

function reportDate(row: EntryRow): string {
  const joined = Array.isArray(row.day_reports) ? row.day_reports[0] : row.day_reports;
  return joined?.report_date?.slice(0, 10) || '';
}

type StaffRow = {
  id: string;
  display_name: string | null;
  position: string | null;
};

export function useRelatedProjectStaffHours(relatedType: string | undefined, relatedId: string | undefined) {
  const [rows, setRows] = useState<QuotationBvHourStat[]>([]);
  const [loading, setLoading] = useState(Boolean(relatedType && relatedId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!relatedType || !relatedId?.trim()) {
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const related = await resolveRelatedDayReportIds(relatedType, relatedId);
    if (!related.data.length) {
      setRows([]);
      setError(related.error?.message ?? null);
      setLoading(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from('day_report_entries')
      .select('staff_id, hours, title, day_reports!inner(report_date)')
      .in('related_id', related.data);

    if (queryError) {
      setError(queryError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const totals = new Map<string, { hours: number; entryCount: number; entries: QuotationBvHourEntry[] }>();
    for (const row of (data as EntryRow[] | null) ?? []) {
      const staffId = row.staff_id?.trim();
      if (!staffId) continue;
      const current = totals.get(staffId) || { hours: 0, entryCount: 0, entries: [] };
      const hours = Number(row.hours) || 0;
      current.hours += hours;
      current.entryCount += 1;
      current.entries.push({
        date: reportDate(row),
        title: row.title?.trim() || '未填工作',
        hours,
      });
      totals.set(staffId, current);
    }

    const staffIds = [...totals.keys()];
    const nameMap = new Map<string, { name: string; position: string }>();
    if (staffIds.length) {
      const { data: staffRows, error: staffError } = await supabase
        .from('staffs')
        .select('id, display_name, position')
        .in('id', staffIds);
      if (staffError) {
        setError(staffError.message);
        setRows([]);
        setLoading(false);
        return;
      }
      for (const staff of (staffRows as StaffRow[] | null) ?? []) {
        nameMap.set(staff.id, {
          name: staff.display_name?.trim() || '—',
          position: staff.position?.trim() || '',
        });
      }
    }

    setError(related.error?.message ?? null);
    setRows(
      staffIds
        .map((staffId) => {
          const stat = totals.get(staffId);
          const staff = nameMap.get(staffId);
          const entries = [...(stat?.entries ?? [])].sort(
            (a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'zh-Hant'),
          );
          return {
            staffId,
            staffName: staff?.name || '—',
            position: staff?.position || '',
            hours: stat?.hours || 0,
            entryCount: stat?.entryCount || 0,
            entries,
          };
        })
        .sort((a, b) => b.hours - a.hours || a.staffName.localeCompare(b.staffName, 'zh-Hant')),
    );
    setLoading(false);
  }, [relatedType, relatedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}
