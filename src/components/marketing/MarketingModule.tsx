import { useEffect, useState } from 'react';
import { GoogleAdsModule } from './GoogleAdsModule';
import { GoogleAdsSyncModule } from './GoogleAdsSyncModule';
import { FacebookAdsModule } from './FacebookAdsModule';
import { FacebookAdsSyncModule } from './FacebookAdsSyncModule';
import { AdsComparisonModule } from './AdsComparisonModule';
import { GraphicDesignModule } from './GraphicDesignModule';
import { BacklinkModule } from './BacklinkModule';
import { AdsTagsSettingsModule } from './AdsTagsSettingsModule';
import { parseAdsCampaignHashQuery } from '@/lib/adsCampaignNavigation';

export function MarketingModule({ subModule }: { subModule?: string }) {
  const activeTab = subModule || 'google-ads';
  const [adsDetailOpen, setAdsDetailOpen] = useState(
    () =>
      (activeTab === 'google-ads' || activeTab === 'facebook-ads') &&
      !!parseAdsCampaignHashQuery().campaign,
  );

  useEffect(() => {
    const sync = () => {
      setAdsDetailOpen(
        (activeTab === 'google-ads' || activeTab === 'facebook-ads') &&
          !!parseAdsCampaignHashQuery().campaign,
      );
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [activeTab]);

  const getTitle = () => {
    switch (activeTab) {
      case 'google-ads': return { title: 'Google Ads', subtitle: '依日期區間檢視 MCC Campaign 成效（每日指標彙總）。' };
      case 'google-ads-sync': return { title: 'Google Ads 同步', subtitle: '觸發並監控完整歷史回填，以及日常增量同步狀態。' };
      case 'facebook-ads': return { title: 'Facebook Ads', subtitle: '依日期區間檢視 Meta Campaign 成效（多 Business · 每日指標彙總）。' };
      case 'facebook-ads-sync': return { title: 'Facebook Ads 同步', subtitle: '觸發並監控完整歷史回填（約 37 個月），以及日常增量同步狀態。' };
      case 'ads-comparison': return { title: '廣告比較圖表', subtitle: '並排比較最多三個 Campaign 的每日成效（Google Ads / Facebook Ads）。' };
      case 'graphic-design': return { title: '平面設計', subtitle: '管理各平台平面設計製作及成果追蹤。' };
      case 'backlink': return { title: '反向連結 Backlinks', subtitle: '記錄各平台反向連結購買及費用。' };
      case 'ads-tags': return { title: '廣告標籤', subtitle: '管理 Google Ads / Facebook Ads Campaign 共用標籤，並以啟用狀態控制是否可套用。' };
      default: return { title: 'Google Ads', subtitle: '依日期區間檢視 MCC Campaign 成效（每日指標彙總）。' };
    }
  };

  const { title, subtitle } = getTitle();
  const hidePageHeader = adsDetailOpen || activeTab === 'ads-comparison';

  return (
    <div className="space-y-6">
      {!hidePageHeader && (
        <div>
          <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
          <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
        </div>
      )}

      {activeTab === 'google-ads' && <GoogleAdsModule />}
      {activeTab === 'google-ads-sync' && <GoogleAdsSyncModule />}
      {activeTab === 'facebook-ads' && <FacebookAdsModule />}
      {activeTab === 'facebook-ads-sync' && <FacebookAdsSyncModule />}
      {activeTab === 'ads-comparison' && <AdsComparisonModule />}
      {activeTab === 'graphic-design' && <GraphicDesignModule />}
      {activeTab === 'backlink' && <BacklinkModule />}
      {activeTab === 'ads-tags' && <AdsTagsSettingsModule />}
    </div>
  );
}
