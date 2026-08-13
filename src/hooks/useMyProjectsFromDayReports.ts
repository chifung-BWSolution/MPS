import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { resolveStaffUuid } from '@/services/reportLinkService';
import { relatedTypeLabels, type ProjectRelatedType } from '@/hooks/useProjects';

const CHUNK_SIZE = 200;
const RECENT_DAYS = 30;

export type MyProjectRow = {
  id: string;
  name: string;
  relatedType: ProjectRelatedType | 'unknown';
  relatedTypeLabel: string;
  clientName?: string;
  companyListId?: string;
  brandListId?: string;
  isActive: boolean;
  status: string;
  myHours: number;
  myEntryCount: number;
  myRecentHours: number;
  myLastReportDate?: string;
  teamHours: number;
  teamEntryCount: number;
  contributorCount: number;
  mySharePct: number;
};

export type MyProjectsSummary = {
  projectCount: number;
  myTotalHours: number;
  teamTotalHours: number;
  myRecentHours: number;
};

type EntryRow = {
  related_id: string | null;
  related_name: string | null;
  hours: number | null;
  staff_id: string | null;
  day_reports: { report_date: string } | { report_date: string }[] | null;
};

type ProjectDbRow = {
  id: string;
  related_type: string;
  name: string;
  status: string | null;
  is_active: boolean | null;
  company_list_id: string | null;
  brand_list_id: string | null;
  client_name: string | null;
};

function reportDateOf(row: EntryRow): string | undefined {
  const dr = row.day_reports;
  if (!dr) return undefined;
  if (Array.isArray(dr)) return dr[0]?.report_date?.substring(0, 10);
  return dr.report_date?.substring(0, 10);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function chunkIds(ids: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

function relatedTypeOf(raw: string | null | undefined): ProjectRelatedType | 'unknown' {
  if (raw === 'quotation_client' || raw === 'webandsystem' || raw === 'vchannel' || raw === 'manual') return raw;
  return 'unknown';
}

export function useMyProjectsFromDayReports() {
  const { session, systemUser } = useAuth();
  const [projects, setProjects] = useState<MyProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recentCutoff = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (RECENT_DAYS - 1));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const staffId = await resolveStaffUuid(systemUser);
      if (cancelled) return;

      if (!staffId) {
        setProjects([]);
        setError(null);
        setLoading(false);
        return;
      }

      const { data: myRows, error: myErr } = await supabase
        .from('day_report_entries')
        .select('related_id, related_name, hours, staff_id, day_reports!inner(report_date)')
        .eq('staff_id', staffId)
        .not('related_id', 'is', null);

      if (cancelled) return;
      if (myErr) {
        setError(myErr.message);
        setProjects([]);
        setLoading(false);
        return;
      }

      type MyAgg = {
        relatedName: string;
        myHours: number;
        myEntryCount: number;
        myRecentHours: number;
        myLastReportDate?: string;
      };

      const myMap = new Map<string, MyAgg>();
      for (const raw of (myRows || []) as EntryRow[]) {
        const id = raw.related_id;
        if (!id) continue;
        const hours = Number(raw.hours) || 0;
        const reportDate = reportDateOf(raw);
        const cur = myMap.get(id) || {
          relatedName: '',
          myHours: 0,
          myEntryCount: 0,
          myRecentHours: 0,
          myLastReportDate: undefined,
        };
        cur.myHours += hours;
        cur.myEntryCount += 1;
        if (raw.related_name) cur.relatedName = raw.related_name;
        if (reportDate && reportDate >= recentCutoff) cur.myRecentHours += hours;
        if (reportDate && (!cur.myLastReportDate || reportDate > cur.myLastReportDate)) {
          cur.myLastReportDate = reportDate;
        }
        myMap.set(id, cur);
      }

      const relatedIds = [...myMap.keys()];
      if (relatedIds.length === 0) {
        setProjects([]);
        setError(null);
        setLoading(false);
        return;
      }

      type TeamAgg = {
        teamHours: number;
        teamEntryCount: number;
        staffIds: Set<string>;
      };
      const teamMap = new Map<string, TeamAgg>();

      for (const chunk of chunkIds(relatedIds)) {
        const { data: teamRows, error: teamErr } = await supabase
          .from('day_report_entries')
          .select('related_id, hours, staff_id, day_reports!inner(report_date)')
          .in('related_id', chunk);

        if (cancelled) return;
        if (teamErr) {
          setError(teamErr.message);
          setProjects([]);
          setLoading(false);
          return;
        }

        for (const raw of (teamRows || []) as EntryRow[]) {
          const id = raw.related_id;
          if (!id) continue;
          const hours = Number(raw.hours) || 0;
          const cur = teamMap.get(id) || {
            teamHours: 0,
            teamEntryCount: 0,
            staffIds: new Set<string>(),
          };
          cur.teamHours += hours;
          cur.teamEntryCount += 1;
          if (raw.staff_id) cur.staffIds.add(raw.staff_id);
          teamMap.set(id, cur);
        }
      }

      const projectById = new Map<string, ProjectDbRow>();
      for (const chunk of chunkIds(relatedIds)) {
        const { data: projectRows, error: projectErr } = await supabase
          .from('projects')
          .select(
            'id, related_type, name, status, is_active, company_list_id, brand_list_id, client_name',
          )
          .in('id', chunk);

        if (cancelled) return;
        if (projectErr) {
          // Master lookup failure should not blank the list — fall back to related_name.
          console.warn('[useMyProjectsFromDayReports] projects lookup failed:', projectErr.message);
          break;
        }
        for (const row of (projectRows || []) as ProjectDbRow[]) {
          projectById.set(row.id, row);
        }
      }

      if (cancelled) return;

      const rows: MyProjectRow[] = relatedIds.map((id) => {
        const mine = myMap.get(id)!;
        const team = teamMap.get(id);
        const master = projectById.get(id);
        const teamHours = round1(team?.teamHours ?? mine.myHours);
        const myHours = round1(mine.myHours);
        const relatedType = relatedTypeOf(master?.related_type);
        return {
          id,
          name: master?.name || mine.relatedName || '未命名項目',
          relatedType,
          relatedTypeLabel:
            relatedType === 'unknown'
              ? '其他'
              : relatedTypeLabels[relatedType as ProjectRelatedType],
          clientName: master?.client_name ?? undefined,
          companyListId: master?.company_list_id ?? undefined,
          brandListId: master?.brand_list_id ?? undefined,
          isActive: master ? !!master.is_active : true,
          status: master?.status || '',
          myHours,
          myEntryCount: mine.myEntryCount,
          myRecentHours: round1(mine.myRecentHours),
          myLastReportDate: mine.myLastReportDate,
          teamHours,
          teamEntryCount: team?.teamEntryCount ?? mine.myEntryCount,
          contributorCount: team?.staffIds.size ?? 1,
          mySharePct: teamHours > 0 ? Math.round((myHours / teamHours) * 100) : 0,
        };
      });

      rows.sort((a, b) => {
        const da = a.myLastReportDate || '';
        const db = b.myLastReportDate || '';
        if (da !== db) return db.localeCompare(da);
        return b.myHours - a.myHours;
      });

      setProjects(rows);
      setError(null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [session, systemUser, recentCutoff]);

  const stats: MyProjectsSummary = useMemo(() => {
    return {
      projectCount: projects.length,
      myTotalHours: round1(projects.reduce((s, p) => s + p.myHours, 0)),
      teamTotalHours: round1(projects.reduce((s, p) => s + p.teamHours, 0)),
      myRecentHours: round1(projects.reduce((s, p) => s + p.myRecentHours, 0)),
    };
  }, [projects]);

  return { projects, loading, error, stats };
}
