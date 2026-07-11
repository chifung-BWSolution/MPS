import { SocialPostsModule } from './SocialPostsModule';
import { EdmManagementModule } from './EdmManagementModule';
import { PaidAdsModule } from './PaidAdsModule';
import { SeoKeywordsModule } from './SeoKeywordsModule';
import { SeoUpgradeModule } from './SeoUpgradeModule';
import { GraphicDesignModule } from './GraphicDesignModule';
import { MarketingCalendar } from './MarketingCalendar';
import { VolunteerRecruitmentModule } from './VolunteerRecruitmentModule';

export function MarketingModule({ subModule }: { subModule?: string }) {
  const activeTab = subModule || 'calendar';

  const getTitle = () => {
    switch (activeTab) {
      case 'calendar': return { title: '行銷日曆', subtitle: '綜覽各渠道行銷活動排期與進度。' };
      case 'social': return { title: '社交媒體', subtitle: '管理各平台社交媒體帖文及排期。' };
      case 'edm': return { title: 'EDM 管理', subtitle: '電郵及短訊營銷活動管理。' };
      case 'paid-ads': return { title: '付費廣告', subtitle: '管理付費廣告投放及成效數據。' };
      case 'seo': return { title: 'SEO 關鍵字', subtitle: '三級關鍵字管理及排名追蹤。' };
      case 'seo-upgrade': return { title: 'SEO 升級', subtitle: '記錄 SEO 升級動作及費用。' };
      case 'graphic-design': return { title: '平面設計', subtitle: '管理各平台平面設計製作及成果追蹤。' };
      case 'volunteer': return { title: '志願招募', subtitle: '管理 KOL / 志願者招募活動、公開報名與篩選。' };
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
      {activeTab === 'paid-ads' && <PaidAdsModule />}
      {activeTab === 'seo' && <SeoKeywordsModule />}
      {activeTab === 'seo-upgrade' && <SeoUpgradeModule />}
      {activeTab === 'graphic-design' && <GraphicDesignModule />}
      {activeTab === 'volunteer' && <VolunteerRecruitmentModule />}
    </div>
  );
}
