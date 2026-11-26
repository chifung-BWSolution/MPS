import {
  ZONE_DESCRIPTION,
  ZONE_LABEL,
} from '@/lib/contentNavigation.ts';
import type { ContentZone } from '@/lib/contentTypes.ts';
import { FeatureTabs, type FeatureTabItem } from '../../FeatureTabs';

export interface ContentZoneTabsProps {
  zone: ContentZone;
  onChange: (zone: ContentZone) => void;
  /** 待處理數量（可選，顯示在 tab 上） */
  counts?: Partial<Record<ContentZone, number>>;
  className?: string;
}

/**
 * 兩區切換（PRD §5.1）：社媒營運 / 網站內容自動化。
 * 樣式對映 MPS：白卡 + 深藍選中態；寬度由 FeatureTabs 統一貼合文字。
 */
export function ContentZoneTabs({ zone, onChange, counts, className }: ContentZoneTabsProps) {
  const zones: ContentZone[] = ['social', 'seo'];
  const items: FeatureTabItem<ContentZone>[] = zones.map((item) => ({
    id: item,
    label: ZONE_LABEL[item],
    dot: true,
    badge: counts?.[item],
    title: ZONE_DESCRIPTION[item],
  }));

  return (
    <FeatureTabs
      items={items}
      value={zone}
      onChange={onChange}
      ariaLabel="內容自動化分區"
      className={className}
    />
  );
}
