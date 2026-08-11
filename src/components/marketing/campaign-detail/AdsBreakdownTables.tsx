import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type {
  GoogleAdsAdGroupRow,
  GoogleAdsAdRow,
  GoogleAdsAssetGroupRow,
  GoogleAdsAssetRow,
  GoogleAdsBreakdownChannel,
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
    s === 'ENABLED' || s === 'ACTIVE' || s === 'ELIGIBLE'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : s === 'PAUSED' || s === 'PENDING' || s === 'LEARNING'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : s === 'BEST' || s === 'GOOD' || s === 'EXCELLENT'
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : s === 'LOW'
            ? 'bg-rose-50 text-rose-700 border-rose-200'
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
      subtitle="即時從 Google Ads 拉取 · 各廣告群組成效"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Ad Group 成效資料。"
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
      subtitle="即時從 Google Ads 拉取 · 關鍵字與品質分數"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Keyword 成效資料。"
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
  variant = 'search',
}: {
  rows: GoogleAdsSearchTermRow[];
  loading: boolean;
  variant?: 'search' | 'pmax';
}) {
  return (
    <PanelShell
      title="Search Terms"
      subtitle={
        variant === 'pmax'
          ? '即時從 Google Ads 拉取 · Performance Max 搜尋字詞 Top 100 by Cost'
          : '即時從 Google Ads 拉取 · Top 100 by Cost'
      }
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Search Term 成效資料。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-3 py-2">Search term</th>
            {variant === 'search' ? (
              <th className="text-left font-medium px-2 py-2">Keyword</th>
            ) : null}
            <th className="text-right font-medium px-2 py-2">Clicks</th>
            <th className="text-right font-medium px-2 py-2">Cost</th>
            <th className="text-right font-medium px-3 py-2">Conv.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr
              key={`${r.adGroupId || 'pmax'}:${r.searchTerm}:${idx}`}
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
              {variant === 'search' ? (
                <td className="px-2 py-1.5 text-muted-foreground">
                  <div className="line-clamp-2">{r.keywordText || '—'}</div>
                  {r.matchType ? (
                    <div className="text-[10px]">{r.matchType}</div>
                  ) : null}
                </td>
              ) : null}
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

export function AdsAssetGroupsTable({
  rows,
  loading,
}: {
  rows: GoogleAdsAssetGroupRow[];
  loading: boolean;
}) {
  return (
    <PanelShell
      title="Asset Groups"
      subtitle="即時從 Google Ads 拉取 · Performance Max 資產群組"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Asset Group 成效資料。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-3 py-2">Asset Group</th>
            <th className="text-left font-medium px-2 py-2">Strength</th>
            <th className="text-right font-medium px-2 py-2">Clicks</th>
            <th className="text-right font-medium px-2 py-2">Cost</th>
            <th className="text-right font-medium px-3 py-2">Conv.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.assetGroupId} className="border-t border-slate-100">
              <td className="px-3 py-1.5">
                <div className="font-medium line-clamp-2">{r.assetGroupName}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {statusBadge(r.primaryStatus || r.status)}
                </div>
              </td>
              <td className="px-2 py-1.5">{statusBadge(r.adStrength)}</td>
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

export function AdsAdsTable({
  rows,
  loading,
}: {
  rows: GoogleAdsAdRow[];
  loading: boolean;
}) {
  return (
    <PanelShell
      title="Ads"
      subtitle="即時從 Google Ads 拉取 · Demand Gen 廣告"
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Ad 成效資料。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-3 py-2">Ad</th>
            <th className="text-left font-medium px-2 py-2">Status</th>
            <th className="text-right font-medium px-2 py-2">Clicks</th>
            <th className="text-right font-medium px-2 py-2">Cost</th>
            <th className="text-right font-medium px-3 py-2">Conv.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.adGroupId}:${r.adId}`} className="border-t border-slate-100">
              <td className="px-3 py-1.5">
                <div className="font-medium line-clamp-2">
                  {r.adName || r.adType || r.adId}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {[r.adType, r.adGroupName].filter(Boolean).join(' · ') || r.adId}
                </div>
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

export function AdsAssetsTable({
  rows,
  loading,
  variant = 'pmax',
}: {
  rows: GoogleAdsAssetRow[];
  loading: boolean;
  variant?: 'pmax' | 'demand_gen';
}) {
  return (
    <PanelShell
      title="Assets"
      subtitle={
        variant === 'demand_gen'
          ? '即時從 Google Ads 拉取 · Demand Gen 素材成效'
          : '即時從 Google Ads 拉取 · Performance Max 素材成效'
      }
      count={rows.length}
      loading={loading}
      emptyHint="此期間尚無 Asset 成效資料。"
    >
      <table className="w-full text-[11px]">
        <thead className="bg-slate-50 sticky top-0 z-10 text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-3 py-2">Asset</th>
            <th className="text-left font-medium px-2 py-2">Label</th>
            <th className="text-right font-medium px-2 py-2">Clicks</th>
            <th className="text-right font-medium px-2 py-2">Cost</th>
            <th className="text-right font-medium px-3 py-2">Imp.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr
              key={`${r.assetId}:${r.fieldType || ''}:${r.assetGroupId || r.adId || ''}:${idx}`}
              className="border-t border-slate-100"
            >
              <td className="px-3 py-1.5">
                <div className="font-medium line-clamp-2">
                  {r.assetName || r.fieldType || r.assetId}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {[r.fieldType || r.assetType, r.assetGroupName]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </td>
              <td className="px-2 py-1.5">
                {statusBadge(r.performanceLabel || r.status)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.clicks.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatMoneyFromMicros(r.costMicros)}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.impressions.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PanelShell>
  );
}

export function AdsChannelBreakdownGrid({
  channel,
  loading,
  adGroups,
  keywords,
  searchTerms,
  assetGroups,
  ads,
  assets,
}: {
  channel: GoogleAdsBreakdownChannel;
  loading: boolean;
  adGroups: GoogleAdsAdGroupRow[];
  keywords: GoogleAdsKeywordRow[];
  searchTerms: GoogleAdsSearchTermRow[];
  assetGroups: GoogleAdsAssetGroupRow[];
  ads: GoogleAdsAdRow[];
  assets: GoogleAdsAssetRow[];
}) {
  if (channel === 'SEARCH') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AdsAdGroupsTable rows={adGroups} loading={loading} />
        <AdsKeywordsTable rows={keywords} loading={loading} />
        <AdsSearchTermsTable rows={searchTerms} loading={loading} variant="search" />
      </div>
    );
  }

  if (channel === 'DEMAND_GEN') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AdsAdGroupsTable rows={adGroups} loading={loading} />
        <AdsAdsTable rows={ads} loading={loading} />
        <AdsAssetsTable rows={assets} loading={loading} variant="demand_gen" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <AdsAssetGroupsTable rows={assetGroups} loading={loading} />
      <AdsAssetsTable rows={assets} loading={loading} variant="pmax" />
      <AdsSearchTermsTable rows={searchTerms} loading={loading} variant="pmax" />
    </div>
  );
}
