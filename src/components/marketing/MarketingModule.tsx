import { SocialPostsModule } from './SocialPostsModule';
import { EdmManagementModule } from './EdmManagementModule';
import { GoogleAdsModule } from './GoogleAdsModule';
import { GoogleAdsSyncModule } from './GoogleAdsSyncModule';
import { FacebookAdsModule } from './FacebookAdsModule';
import { FacebookAdsSyncModule } from './FacebookAdsSyncModule';
import { SeoKeywordsModule } from './SeoKeywordsModule';
import { SeoUpgradeModule } from './SeoUpgradeModule';
import { GraphicDesignModule } from './GraphicDesignModule';
import { BacklinkModule } from './BacklinkModule';
import { GoogleBusinessModule } from './GoogleBusinessModule';
import { MarketingCalendar } from './MarketingCalendar';

export function MarketingModule({ subModule }: { subModule?: string }) {
  const activeTab = subModule || 'calendar';

  const getTitle = () => {
    switch (activeTab) {
      case 'calendar': return { title: '行銷日曆', subtitle: '綜覽各渠道行銷活動排期與進度。' };
      case 'social': return { title: '社交媒體', subtitle: '管理各平台社交媒體帖文及排期。' };
      case 'edm': return { title: 'EDM 管理', subtitle: '電郵及短訊營銷活動管理。' };
      case 'google-ads': return { title: 'Google Ads', subtitle: '依日期區間檢視 MCC Campaign 成效（每日指標彙總）。' };
      case 'google-ads-sync': return { title: 'Google Ads 同步', subtitle: '觸發並監控完整歷史回填，以及日常增量同步狀態。' };
      case 'facebook-ads': return { title: 'Facebook Ads', subtitle: '依日期區間檢視 Meta Campaign 成效（多 Business · 每日指標彙總）。' };
      case 'facebook-ads-sync': return { title: 'Facebook Ads 同步', subtitle: '觸發並監控完整歷史回填（約 37 個月），以及日常增量同步狀態。' };
      case 'seo': return { title: 'SEO 關鍵字', subtitle: 'GSC 平均排名追蹤 · 可同步 Search Console · 之後會合併 Google Ads 關鍵字。' };
      case 'seo-upgrade': return { title: 'SEO 升級', subtitle: '記錄 SEO 升級動作及費用，排名對比來自 GSC 歷史。' };
      case 'graphic-design': return { title: '平面設計', subtitle: '管理各平台平面設計製作及成果追蹤。' };
      case 'backlink': return { title: '反向連結 Backlinks', subtitle: '記錄各平台反向連結購買及費用。' };
      case 'google-business': return { title: 'Google Business', subtitle: '登記已建立的 Google Business 檔案。' };
      default: return { title: '行銷日曆', subtitle: '綜覽各渠道行銷活動排期與進度。' };
    }
  };

  const { title, subtitle } = getTitle();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
        <p className="text-[14px] text-muted-foreground mt-1">{subtitle}</p>
      </div>

      {/* Content */}
      {activeTab === 'calendar' && <MarketingCalendar />}
      {activeTab === 'social' && <SocialPostsModule />}
      {activeTab === 'edm' && <EdmManagementModule />}
      {activeTab === 'google-ads' && <GoogleAdsModule />}
      {activeTab === 'google-ads-sync' && <GoogleAdsSyncModule />}
      {activeTab === 'facebook-ads' && <FacebookAdsModule />}
      {activeTab === 'facebook-ads-sync' && <FacebookAdsSyncModule />}
      {activeTab === 'seo' && <SeoKeywordsModule />}
      {activeTab === 'seo-upgrade' && <SeoUpgradeModule />}
      {activeTab === 'graphic-design' && <GraphicDesignModule />}
      {activeTab === 'backlink' && <BacklinkModule />}
      {activeTab === 'google-business' && <GoogleBusinessModule />}
    </div>
  );
}
