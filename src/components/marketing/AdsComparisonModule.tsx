import { AdsComparisonColumn } from './ads-comparison/AdsComparisonColumn';
import { useAdsCampaignCatalog } from '@/hooks/useAdsCampaignCatalog';

export function AdsComparisonModule() {
  const { catalog, loading, error } = useAdsCampaignCatalog();

  return (
    <div className="space-y-0">
      <div className="sticky top-[48px] z-30 -mx-6 px-6 pt-1 pb-3 mb-5 space-y-2 bg-[#f5f8fc]/95 backdrop-blur-sm border-b border-[rgba(13,26,45,0.06)]">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">廣告比較圖表</h1>
          <p className="text-[14px] text-muted-foreground mt-1">
            並排比較最多三個 Campaign 的每日成效（Google Ads / Facebook Ads）。
          </p>
        </div>
        <p className="text-[12px] text-muted-foreground">
          每欄可獨立選擇日期、平台與 Campaign。Conv. 與 Google Ads / Facebook Ads 列表同一欄位；點擊下方指標卡片可快速切換折線圖指標。
        </p>
        {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
        {!loading && !error ? (
          <p className="text-[11px] text-muted-foreground">
            Google {catalog.google.length.toLocaleString()} campaigns
            {catalog.googleMinDate && catalog.googleMaxDate
              ? ` · ${catalog.googleMinDate} ~ ${catalog.googleMaxDate}`
              : ''}
            {' · '}
            Facebook {catalog.facebook.length.toLocaleString()} campaigns
            {catalog.facebookMinDate && catalog.facebookMaxDate
              ? ` · ${catalog.facebookMinDate} ~ ${catalog.facebookMaxDate}`
              : ''}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {[0, 1, 2].map((index) => (
          <AdsComparisonColumn
            key={index}
            index={index}
            catalog={catalog}
            catalogLoading={loading}
          />
        ))}
      </div>
    </div>
  );
}
