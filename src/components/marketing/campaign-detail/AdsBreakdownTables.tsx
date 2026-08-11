import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type {
  GoogleAdsAdGroupRow,
  GoogleAdsKeywordRow,
  GoogleAdsSearchTermRow,
} from '@/types/googleAds';

function formatMoneyFromMicros(micros: number): string {
  return (micros / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function statusBadge(status?: string) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const s = status.toUpperCase();
  const color =
    s === 'ENABLED' || s === 'ACTIVE'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : s === 'PAUSED'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-medium ${color}`}>
      {status}
    </span>
  );
}

function PanelShell({
  title,
  subtitle,
  count,
  loading,
  emptyHint,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  loading: boolean;
  emptyHint: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card overflow-hidden flex flex-col min-h-[280px]">
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold">{title}</h3>
          <span className="text-[11px] text-muted-foreground tabular-nums">{count}</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className={cn('flex-1 overflow-auto max-h-[320px]', loading && 'opacity-60')}>
        {count === 0 ? (
          <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
            {loading ? '載入中…' : emptyHint}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function AdsAdGroupsTable({
  rows,
  loading,
}: {
  rows: GoogleAdsAdGroupRow[];
  loading: boolean;
}) {
  return (
    <PanelShell
      title="Ad Groups"
      subtitle="各廣告群組成效與狀態"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Ad Group 資料。請執行「Refresh recent」或歷史回填。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-3 py-2">Ad Group</th>
            <th className="text-left font-medium px-2 py-2">Status</th>
            <th className="text-right font-medium px-2 py-2">Clicks</th>
            <th className="text-right font-medium px-2 py-2">Cost</th>
            <th className="text-right font-medium px-3 py-2">Conv.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.adGroupId} className="border-t border-slate-100">
              <td className="px-3 py-1.5">
                <div className="font-medium text-foreground line-clamp-2">{r.adGroupName}</div>
                {r.adGroupType ? (
                  <div className="text-[10px] text-muted-foreground">{r.adGroupType}</div>
                ) : null}
              </td>
              <td className="px-2 py-1.5">{statusBadge(r.status)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.costMicros)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}

export function AdsKeywordsTable({
  rows,
  loading,
}: {
  rows: GoogleAdsKeywordRow[];
  loading: boolean;
}) {
  return (
    <PanelShell
      title="Keywords"
      subtitle="關鍵字曝光、點擊與品質分數"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Keyword 資料。請執行「Refresh recent」或歷史回填。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-3 py-2">Keyword</th>
            <th className="text-left font-medium px-2 py-2">Match</th>
            <th className="text-right font-medium px-2 py-2">QS</th>
            <th className="text-right font-medium px-2 py-2">Clicks</th>
            <th className="text-right font-medium px-3 py-2">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.adGroupId}:${r.criterionId}`} className="border-t border-slate-100">
              <td className="px-3 py-1.5">
                <div className="font-medium line-clamp-2">{r.keywordText}</div>
                <div className="text-[10px] text-muted-foreground">{statusBadge(r.status)}</div>
              </td>
              <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                {r.matchType || '—'}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {r.qualityScore != null ? r.qualityScore : '—'}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.costMicros)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}

export function AdsSearchTermsTable({
  rows,
  loading,
}: {
  rows: GoogleAdsSearchTermRow[];
  loading: boolean;
}) {
  return (
    <PanelShell
      title="Search Terms"
      subtitle="實際搜尋字詞與轉換（Top 100 by Cost）"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Search Term 資料。請執行「Refresh recent」或歷史回填。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-3 py-2">Search term</th>
            <th className="text-left font-medium px-2 py-2">Keyword</th>
            <th className="text-right font-medium px-2 py-2">Clicks</th>
            <th className="text-right font-medium px-2 py-2">Cost</th>
            <th className="text-right font-medium px-3 py-2">Conv.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={`${r.adGroupId}:${r.searchTerm}`}
              className="border-t border-slate-100"
            >
              <td className="px-3 py-1.5">
                <div className="font-medium line-clamp-2">{r.searchTerm}</div>
                {r.searchTermMatchType ? (
                  <div className="text-[10px] text-muted-foreground">
                    {r.searchTermMatchType}
                  </div>
                ) : null}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">
                <div className="line-clamp-2">{r.keywordText || '—'}</div>
                {r.matchType ? (
                  <div className="text-[10px]">{r.matchType}</div>
                ) : null}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.costMicros)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.conversions.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}
