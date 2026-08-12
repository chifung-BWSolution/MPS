import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { deriveVideoOutputStatus } from '@/lib/videoOutputUtils';
import type { PlatformPublishMap } from '@/types/videoOutput';

export type DashboardOverviewStats = {
  liveWebsiteCount: number;
  publishedVideoCount: number;
  thisMonthHours: number;
  lastMonthHours: number;
  hoursMomPct: number | null;
  videosMomPct: number | null;
  loading: boolean;
  error: string | null;
};

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthBounds(ref: Date): { start: string; end: string } {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { start: toDateStr(start), end: toDateStr(end) };
}

function momPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function inRange(dateStr: string | null | undefined, start: string, end: string): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= start && d <= end;
}

export function useDashboardOverviewStats(): DashboardOverviewStats {
  const { session } = useAuth();
  const { selectedCompanyId, selectedBrandId } = useApp();
  const [liveWebsiteCount, setLiveWebsiteCount] = useState(0);
  const [publishedVideoCount, setPublishedVideoCount] = useState(0);
  const [thisMonthHours, setThisMonthHours] = useState(0);
  const [lastMonthHours, setLastMonthHours] = useState(0);
  const [videosMomPct, setVideosMomPct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthRanges = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const thisMonth = monthBounds(now);
    const prevRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = monthBounds(prevRef);
    return { thisMonth, lastMonth };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const { thisMonth, lastMonth } = monthRanges;
      const hoursStart = lastMonth.start;
      const hoursEnd = thisMonth.end;

      try {
        // --- Websites (live count; company/brand filtered client-side) ---
        const websiteQuery = supabase
          .from('webandsystem_list')
          .select('id, status, company_list_id, brand_list_id, company_id, brand_id')
          .eq('status', 'live');

        // --- Videos (published + MoM via published_date) ---
        const videosQuery = supabase
          .from('video_output')
          .select(`
            id,
            published_date,
            platform_publish,
            workflow_stage,
            shoot_sz,
            shoot_hk,
            raw_footage_done,
            needs_editing,
            demo_done,
            vchannels ( brand_list_id )
          `);

        const needsProjectFilter = !!(selectedCompanyId || selectedBrandId);

        const [websitesRes, videosRes, reportsRes, projectsRes] = await Promise.all([
          websiteQuery,
          videosQuery,
          supabase
            .from('day_reports')
            .select('id, report_date')
            .gte('report_date', hoursStart)
            .lte('report_date', hoursEnd),
          needsProjectFilter
            ? supabase
                .from('projects')
                .select('id, company_list_id, brand_list_id')
                .eq('is_active', true)
            : Promise.resolve({ data: null as { id: string; company_list_id: string | null; brand_list_id: string | null }[] | null, error: null }),
        ]);

        if (cancelled) return;

        if (websitesRes.error) throw new Error(websitesRes.error.message);
        if (videosRes.error) throw new Error(videosRes.error.message);
        if (reportsRes.error) throw new Error(reportsRes.error.message);
        if (projectsRes.error) throw new Error(projectsRes.error.message);

        const websiteRows = (websitesRes.data ?? []).filter((row) => {
          const companyId = row.company_list_id ?? row.company_id;
          const brandId = row.brand_list_id ?? row.brand_id;
          if (selectedCompanyId && companyId !== selectedCompanyId) return false;
          if (selectedBrandId && brandId !== selectedBrandId) return false;
          return true;
        });
        setLiveWebsiteCount(websiteRows.length);

        type VideoRow = {
          id: string;
          published_date: string | null;
          platform_publish: PlatformPublishMap | null;
          workflow_stage?: string | null;
          shoot_sz: boolean;
          shoot_hk: boolean;
          raw_footage_done: boolean;
          needs_editing: boolean | null;
          demo_done: boolean;
          vchannels?: { brand_list_id?: string | null } | { brand_list_id?: string | null }[] | null;
        };

        let videoRows = (videosRes.data ?? []) as VideoRow[];
        if (selectedBrandId) {
          videoRows = videoRows.filter((row) => {
            const ch = Array.isArray(row.vchannels) ? row.vchannels[0] : row.vchannels;
            return ch?.brand_list_id === selectedBrandId;
          });
        }

        const published = videoRows.filter((row) =>
          deriveVideoOutputStatus({
            workflowStage: (row.workflow_stage as any) ?? undefined,
            shootSz: !!row.shoot_sz,
            shootHk: !!row.shoot_hk,
            rawFootageDone: !!row.raw_footage_done,
            needsEditing: row.needs_editing,
            demoDone: !!row.demo_done,
            publishedDate: row.published_date ?? undefined,
            platformPublish: row.platform_publish ?? {},
          }) === 'published',
        );

        setPublishedVideoCount(published.length);

        const thisMonthPublished = published.filter((v) =>
          inRange(v.published_date, thisMonth.start, thisMonth.end),
        ).length;
        const lastMonthPublished = published.filter((v) =>
          inRange(v.published_date, lastMonth.start, lastMonth.end),
        ).length;
        setVideosMomPct(momPct(thisMonthPublished, lastMonthPublished));

        let allowedProjectIds: Set<string> | null = null;
        if (needsProjectFilter) {
          allowedProjectIds = new Set(
            (projectsRes.data ?? [])
              .filter((p) => {
                if (selectedCompanyId && p.company_list_id !== selectedCompanyId) return false;
                if (selectedBrandId && p.brand_list_id !== selectedBrandId) return false;
                return true;
              })
              .map((p) => p.id),
          );
        }

        const reportRows = reportsRes.data ?? [];
        const reportDateById = new Map(
          reportRows.map((r) => [r.id as string, String(r.report_date).slice(0, 10)]),
        );
        const reportIds = reportRows.map((r) => r.id as string);

        let thisHours = 0;
        let lastHours = 0;

        if (reportIds.length > 0) {
          // Chunk .in() to avoid URL length limits on large months
          const chunkSize = 200;
          for (let i = 0; i < reportIds.length; i += chunkSize) {
            const chunk = reportIds.slice(i, i + chunkSize);
            const { data: entryRows, error: entryErr } = await supabase
              .from('day_report_entries')
              .select('hours, related_id, day_report_id')
              .in('day_report_id', chunk);
            if (cancelled) return;
            if (entryErr) throw new Error(entryErr.message);

            for (const row of entryRows ?? []) {
              if (allowedProjectIds) {
                if (!row.related_id || !allowedProjectIds.has(row.related_id as string)) continue;
              }
              const reportDate = reportDateById.get(row.day_report_id as string);
              if (!reportDate) continue;
              const hours = Number(row.hours) || 0;
              if (reportDate >= thisMonth.start && reportDate <= thisMonth.end) {
                thisHours += hours;
              } else if (reportDate >= lastMonth.start && reportDate <= lastMonth.end) {
                lastHours += hours;
              }
            }
          }
        }

        setThisMonthHours(Math.round(thisHours * 10) / 10);
        setLastMonthHours(Math.round(lastHours * 10) / 10);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load overview stats');
        setLiveWebsiteCount(0);
        setPublishedVideoCount(0);
        setThisMonthHours(0);
        setLastMonthHours(0);
        setVideosMomPct(null);
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [session, selectedCompanyId, selectedBrandId, monthRanges]);

  return {
    liveWebsiteCount,
    publishedVideoCount,
    thisMonthHours,
    lastMonthHours,
    hoursMomPct: momPct(thisMonthHours, lastMonthHours),
    videosMomPct,
    loading,
    error,
  };
}
