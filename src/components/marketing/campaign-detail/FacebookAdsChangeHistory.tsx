import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { fetchUserStaffIds } from '@/components/day-report/userStaffLookup';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useActiveStaffOptions } from '@/hooks/useActiveStaffOptions';
import { useFacebookAdsChangeHistoryStaff } from '@/hooks/useFacebookAdsChangeHistoryStaff';
import { cn } from '@/lib/utils';
import type {
  FacebookAdsChangeHistoryCategory,
  FacebookAdsChangeHistorySession,
} from '@/types/facebookAds';

const CLEAR_STAFF = '__none__';

const FILTERS: { id: 'all' | FacebookAdsChangeHistoryCategory; label: string }[] = [
  { id: 'all', label: '所有變更' },
  { id: 'budget', label: '廣告預算' },
  { id: 'bidding', label: '競價' },
  { id: 'audience', label: '目標對象' },
  { id: 'location', label: '位置' },
  { id: 'language', label: '語言' },
  { id: 'conversions', label: '轉換次數' },
  { id: 'ads', label: '廣告元素' },
  { id: 'status', label: '狀態' },
  { id: 'feeds', label: '資訊提供' },
  { id: 'other', label: '其他' },
];

function toolLabel(clientType: string) {
  if (!clientType) return '—';
  return clientType;
}

function formatWhen(value: string) {
  if (!value) return '—';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value.replace('T', ' ').slice(0, 19);
  return d.toLocaleString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function FacebookAdsChangeHistory({
  sessions,
  campaignName,
  loading,
  error,
  queriedFrom,
  queriedTo,
  clamped,
}: {
  sessions: FacebookAdsChangeHistorySession[];
  campaignName: string;
  loading: boolean;
  error: string | null;
  queriedFrom: string | null;
  queriedTo: string | null;
  clamped: boolean;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const activityKeys = useMemo(() => sessions.map((session) => session.id), [sessions]);
  const staffAssignments = useFacebookAdsChangeHistoryStaff(activityKeys);
  const assignedIds = useMemo(() => Object.values(staffAssignments.byKey), [staffAssignments.byKey]);
  const { options: activeStaff } = useActiveStaffOptions(assignedIds);
  const [systemStaffIds, setSystemStaffIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchUserStaffIds().then((ids) => {
      if (!cancelled) setSystemStaffIds(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const staffOptions = useMemo(() => {
    const assigned = new Set(assignedIds);
    return [...activeStaff]
      .filter((row) => systemStaffIds?.has(row.value) || assigned.has(row.value))
      .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }))
      .map(({ value, label, keywords }) => ({ value, label, keywords }));
  }, [activeStaff, assignedIds, systemStaffIds]);
  const staffSelectOptions = useMemo(
    () => [{ value: CLEAR_STAFF, label: '—' }, ...staffOptions],
    [staffOptions],
  );
  const visible = useMemo(
    () =>
      filter === 'all'
        ? sessions
        : sessions.filter((session) => session.lines.some((line) => line.category === filter)),
    [sessions, filter],
  );

  return (
    <div className="space-y-3">
      <div className="text-[12px] text-muted-foreground">
        變更記錄來自 Meta 廣告帳戶活動，每一列是一次操作。
        {queriedFrom && queriedTo ? (
          <span className="ml-1 tabular-nums">
            查詢區間 {queriedFrom} → {queriedTo}
            {clamped ? '（已縮到近 90 日）' : ''}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
            className={cn(
              'px-2.5 py-1 rounded-full border text-[12px]',
              filter === chip.id
                ? 'border-teal-600 bg-teal-50 text-teal-800'
                : 'border-slate-200 bg-white text-muted-foreground hover:text-foreground',
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
      {error ? <div className="text-[12px] text-red-600">{error}</div> : null}
      {staffAssignments.error ? (
        <div className="text-[12px] text-red-600">{staffAssignments.error}</div>
      ) : null}
      <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[rgba(13,26,45,0.08)] bg-slate-50/80 text-left text-[12px] text-muted-foreground">
                <th className="px-3 py-2 font-medium whitespace-nowrap">用戶 / 日期和時間</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">負責同事</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">工具</th>
                <th className="px-3 py-2 font-medium min-w-[240px]">變更</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">廣告系列</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">廣告群組</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">廣告元素群組</th>
              </tr>
            </thead>
            <tbody>
              {loading && !sessions.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                    載入變更記錄…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                    此區間沒有變更記錄
                  </td>
                </tr>
              ) : (
                visible.map((session) => (
                  <tr key={session.id} className="border-b border-[rgba(13,26,45,0.06)] align-top last:border-0">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div>{session.userEmail || '—'}</div>
                      <div className="mt-0.5 text-[12px] text-muted-foreground tabular-nums">
                        {formatWhen(session.changeDateTime)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 min-w-[160px]">
                      <SearchableSelect
                        value={staffAssignments.byKey[session.id] || ''}
                        onValueChange={(value) => {
                          void staffAssignments.setStaff(session.id, value === CLEAR_STAFF ? '' : value);
                        }}
                        options={staffSelectOptions}
                        placeholder="選擇同事"
                        searchPlaceholder="搜尋同事"
                        emptyText="沒有在職員工"
                        disabled={staffAssignments.savingKey === session.id}
                        className="h-8 min-w-[148px] text-[12px]"
                      />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{toolLabel(session.clientType)}</td>
                    <td className="px-3 py-2.5">
                      <ul className="space-y-1">
                        {(filter === 'all'
                          ? session.lines
                          : session.lines.filter((line) => line.category === filter)
                        ).map((line, index) => (
                          <li key={`${session.id}:${index}`} className="flex items-start gap-1.5 leading-snug">
                            <Check size={14} className="mt-0.5 shrink-0 text-slate-500" />
                            <span>{line.text}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-3 py-2.5 text-teal-700">{campaignName || '—'}</td>
                    <td className="px-3 py-2.5">{session.adGroupName || '—'}</td>
                    <td className="px-3 py-2.5">{session.assetGroupName || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
