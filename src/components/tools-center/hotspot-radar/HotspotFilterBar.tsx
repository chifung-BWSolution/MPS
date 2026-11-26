import { Flame } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { HotspotSortKey } from '@/types/hotspotRadar';
import { cn } from '@/lib/utils';

export type HotspotSourceTab = 'all' | 'account' | 'hashtag' | 'ad_keyword' | 'library';

export interface HotspotFilters {
  source: HotspotSourceTab;
  platform: 'all' | 'instagram' | 'facebook';
  /** 以 posted_at 為準的回看天數 */
  days: 7 | 30 | 90;
  media: 'all' | 'reel' | 'video' | 'image' | 'carousel' | 'ad';
  onlyHot: boolean;
  onlyUnfavorited: boolean;
  sort: HotspotSortKey;
}

export const DEFAULT_FILTERS: HotspotFilters = {
  source: 'all',
  platform: 'all',
  days: 30,
  media: 'all',
  onlyHot: false,
  onlyUnfavorited: false,
  sort: 'composite',
};

const SOURCE_TABS: { id: HotspotSourceTab; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'account', label: '對標帳號' },
  { id: 'hashtag', label: 'Hashtag' },
  { id: 'ad_keyword', label: '廣告' },
  { id: 'library', label: '⭐ 靈感庫' },
];

const SORT_LABEL: Record<HotspotSortKey, string> = {
  composite: '綜合',
  engagement: '絕對互動',
  relative: '相對熱度',
  newest: '最新',
  ad_days: '廣告投放天數',
};

export function HotspotFilterBar({
  filters,
  counts,
  onChange,
}: {
  filters: HotspotFilters;
  counts: Record<HotspotSourceTab, number>;
  onChange: (patch: Partial<HotspotFilters>) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange({ source: tab.id })}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[12px] transition-colors',
              filters.source === tab.id
                ? 'border-teal-600 bg-teal-600 text-white'
                : 'border-border bg-white text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            <span className="ml-1 tabular-nums opacity-70">{counts[tab.id] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.platform}
          onValueChange={(value) =>
            onChange({ platform: value as HotspotFilters['platform'] })
          }
        >
          <SelectTrigger className="h-8 w-[118px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部平台</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={String(filters.days)}
          onValueChange={(value) => onChange({ days: Number(value) as HotspotFilters['days'] })}
        >
          <SelectTrigger className="h-8 w-[104px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">近 7 天</SelectItem>
            <SelectItem value="30">近 30 天</SelectItem>
            <SelectItem value="90">近 90 天</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.media}
          onValueChange={(value) => onChange({ media: value as HotspotFilters['media'] })}
        >
          <SelectTrigger className="h-8 w-[104px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部媒體</SelectItem>
            <SelectItem value="reel">Reel</SelectItem>
            <SelectItem value="video">影片</SelectItem>
            <SelectItem value="image">圖文</SelectItem>
            <SelectItem value="carousel">輪播</SelectItem>
            <SelectItem value="ad">廣告</SelectItem>
          </SelectContent>
        </Select>

        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-[rgba(13,26,45,0.08)] bg-white px-2 py-1 text-[12px] text-slate-600">
          <input
            type="checkbox"
            checked={filters.onlyHot}
            onChange={(event) => onChange({ onlyHot: event.target.checked })}
            className="h-3.5 w-3.5 accent-teal-600"
          />
          <Flame size={12} className="text-rose-500" />
          只看爆款
        </label>

        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-[rgba(13,26,45,0.08)] bg-white px-2 py-1 text-[12px] text-slate-600">
          <input
            type="checkbox"
            checked={filters.onlyUnfavorited}
            onChange={(event) => onChange({ onlyUnfavorited: event.target.checked })}
            className="h-3.5 w-3.5 accent-teal-600"
          />
          只看未收藏
        </label>

        <Select
          value={filters.sort}
          onValueChange={(value) => onChange({ sort: value as HotspotSortKey })}
        >
          <SelectTrigger className="ml-auto h-8 w-[150px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL) as HotspotSortKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                排序：{SORT_LABEL[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
