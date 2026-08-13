import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchStaffNameMap } from '@/components/day-report/staffNameLookup';

export type RecentActivityItem = {
  id: string;
  user: string;
  action: string;
  time: string;             // human-formatted (e.g. "10 分鐘前")
  occurredAt: string;       // ISO timestamp
  navModule?: string;
  navSubModule?: string;
};

const ACTIVITY_LIMIT = 8;

const formatRelative = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60) return '剛剛';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  const diffHr = diffMin / 60;
  if (diffHr < 24) {
    const rounded = diffHr >= 2 ? Math.floor(diffHr) : Math.round(diffHr * 2) / 2;
    return `${rounded} 小時前`;
  }
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  return new Date(iso).toLocaleDateString('zh-Hant');
};

const safeName = (a: { name_zh?: string | null; name_en?: string | null }) =>
  a?.name_zh?.trim() || a?.name_en?.trim() || '藝人';

export function useRecentActivity() {
  const [items, setItems] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      const [dayReportsRes, confirmedRes, rejectedRes, eventsRes] = await Promise.all([
        supabase
          .from('day_reports')
          .select('id, staff_id, report_date, submitted_at, status')
          .order('submitted_at', { ascending: false })
          .limit(ACTIVITY_LIMIT),
        supabase
          .from('confirmed_artist')
          .select('id, name_zh, name_en, confirmed_at')
          .order('confirmed_at', { ascending: false })
          .limit(ACTIVITY_LIMIT),
        supabase
          .from('rejected_artist')
          .select('id, name_zh, name_en, rejected_at')
          .order('rejected_at', { ascending: false })
          .limit(ACTIVITY_LIMIT),
        supabase
          .from('upcoming_event')
          .select('id, title, type, brand, created_at')
          .order('created_at', { ascending: false })
          .limit(ACTIVITY_LIMIT),
      ]);

      // Resolve staff display names for any staff_id we encountered.
      const staffIds = Array.from(
        new Set((dayReportsRes.data ?? []).map(r => r.staff_id).filter(Boolean) as string[]),
      );
      const staffNameById = staffIds.length > 0
        ? await fetchStaffNameMap(staffIds)
        : {};

      const merged: RecentActivityItem[] = [];

      (dayReportsRes.data ?? []).forEach(r => {
        const ts = (r.submitted_at as string) || '';
        if (!ts) return;
        const user = staffNameById[r.staff_id as string] || (r.staff_id as string) || '同事';
        const action = r.status === 'approved' ? `提交的日報已核准（${r.report_date}）` : `提交了日報（${r.report_date}）`;
        merged.push({
          id: `dr-${r.id}`,
          user,
          action,
          time: formatRelative(ts),
          occurredAt: ts,
          navModule: 'day-report',
          navSubModule: 'team-view',
        });
      });

      (confirmedRes.data ?? []).forEach(a => {
        const ts = (a.confirmed_at as string) || '';
        if (!ts) return;
        merged.push({
          id: `ca-${a.id}`,
          user: '藝人組',
          action: `取錄了藝人 ${safeName(a as any)}`,
          time: formatRelative(ts),
          occurredAt: ts,
          navModule: 'talent',
          navSubModule: 'list',
        });
      });

      (rejectedRes.data ?? []).forEach(a => {
        const ts = (a.rejected_at as string) || '';
        if (!ts) return;
        merged.push({
          id: `ra-${a.id}`,
          user: '藝人組',
          action: `不錄用藝人 ${safeName(a as any)}`,
          time: formatRelative(ts),
          occurredAt: ts,
          navModule: 'talent',
          navSubModule: 'interviews',
        });
      });

      (eventsRes.data ?? []).forEach(e => {
        const ts = (e.created_at as string) || '';
        if (!ts) return;
        merged.push({
          id: `ev-${e.id}`,
          user: (e.brand as string) || '行銷組',
          action: `新增了活動「${e.title}」`,
          time: formatRelative(ts),
          occurredAt: ts,
          navModule: 'marketing',
          navSubModule: 'google-ads',
        });
      });

      merged.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

      if (!cancelled) {
        setItems(merged.slice(0, ACTIVITY_LIMIT));
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading };
}
