import { Link } from '../routerShim';
import PageLayout from '../feature/PageLayout';
import ScenarioGallery from '../feature/ScenarioGallery';

const SITE = 'https://bwevent-music.com';

const services = [
  {
    name: '樂手名單',
    occasions: '酒會、婚禮、精品活動、品牌晚宴',
    config: '鋼琴、小提琴、結他、色士風、爵士組合',
    path: '/services/musicians/',
  },
  {
    name: '歌手表演',
    occasions: '私人晚宴、餐廳、公司聚會、商場',
    config: '獨唱、男女合唱、歌手連樂隊',
    path: '/services/singer-performance/',
  },
  {
    name: '粵語之夜',
    occasions: '品牌答謝、長輩賓客晚宴、社區活動',
    config: '粵語金曲、現場點唱、樂隊伴奏',
    path: '/services/cantonese-music-night/',
  },
  {
    name: '經典英文歌曲',
    occasions: '酒會、國際企業活動、酒店晚宴',
    config: 'Jazz、Soul、Pop、Acoustic',
    path: '/services/classic-english-songs/',
  },
  {
    name: '流行曲派對',
    occasions: '周年晚宴、生日、商場活動、學校活動',
    config: 'Band、DJ、互動點唱',
    path: '/services/pop-party/',
  },
  {
    name: '跳舞之夜',
    occasions: '公司慶典、團建、私人派對',
    config: 'Dance Band、DJ、舞者及排舞',
    path: '/services/dance-night/',
  },
  {
    name: '酒會爵士與輕音樂',
    occasions: 'CEO dinner、品酒會、餐廳及藝廊活動',
    config: 'Piano Trio、Jazz Duo、Bossa Nova',
    path: '/services/cocktail-jazz/',
  },
];

export default function ServicesPage() {
  return (
    <PageLayout
      title="按您的活動氣氛，配對最合適的表演服務"
      subtitle="同一隊樂隊，在婚禮、公司晚宴和商場活動中需要扮演完全不同的角色。有人需要在酒會中讓交流更自然；有人需要在頒獎後把全場氣氛推高；也有人只希望餐廳晚餐多一點溫度。我們按活動目標、賓客輪廓、場地與預算，為您配對合適的歌手、樂手、樂隊或互動節目。"
      heroImage={`${SITE}/ai/img_res/13b6e249ee10202679b087e0d632a2d0.webp`}
      heroAlt="香港活動表演服務"
      showBreadcrumb
      breadcrumbItems={[
        { label: '主頁', path: '/' },
        { label: '服務一覽', path: '/services/' },
      ]}
      ctaText="告訴我們活動日期、場地及期望氣氛"
      ctaLink="/online-quotation/"
      ctaSecondaryText="與活動顧問商量"
      ctaSecondaryLink="/contact/"
    >
      <div className="mb-12 md:mb-16">
        <div className="hidden lg:block overflow-hidden rounded-lg border border-background-200/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-background-100 border-b border-background-200/70">
                <th className="text-left px-5 py-3.5 font-heading font-semibold text-foreground-950">服務</th>
                <th className="text-left px-5 py-3.5 font-heading font-semibold text-foreground-950">適合場合</th>
                <th className="text-left px-5 py-3.5 font-heading font-semibold text-foreground-950">常見配置</th>
                <th className="text-left px-5 py-3.5 font-heading font-semibold text-foreground-950">行動連結</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service, index) => (
                <tr
                  key={service.path}
                  className={`border-b border-background-200/70 hover:bg-background-50 transition-colors ${
                    index % 2 === 0 ? 'bg-background-50' : 'bg-background-50/50'
                  }`}
                >
                  <td className="px-5 py-4 font-medium text-foreground-950">{service.name}</td>
                  <td className="px-5 py-4 text-foreground-600">{service.occasions}</td>
                  <td className="px-5 py-4 text-foreground-600">{service.config}</td>
                  <td className="px-5 py-4">
                    <Link
                      to={service.path}
                      className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium transition-colors"
                    >
                      查看{service.name}
                      <i className="ri-arrow-right-s-line" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden space-y-3">
          {services.map((service) => (
            <div key={service.path} className="bg-background-50 border border-background-200/70 rounded-lg p-4">
              <h3 className="font-heading font-semibold text-foreground-950 mb-2">{service.name}</h3>
              <div className="space-y-1.5 text-sm mb-3">
                <p className="text-foreground-600">
                  <span className="text-foreground-500">適合場合：</span>
                  {service.occasions}
                </p>
                <p className="text-foreground-600">
                  <span className="text-foreground-500">常見配置：</span>
                  {service.config}
                </p>
              </div>
              <Link
                to={service.path}
                className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
              >
                查看{service.name}
                <i className="ri-arrow-right-s-line" />
              </Link>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-background-100 border border-background-200/70 rounded-lg p-6 md:p-8">
        <h2 className="font-heading text-xl md:text-2xl font-bold text-foreground-950 mb-4">如何選擇？</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-5">
          <div className="h-48 md:h-60 rounded-lg overflow-hidden">
            <img
              src={`${SITE}/ai/img_res/d44d19fdc5e73b1043a72089c00017fd.webp`}
              alt="香港活動表演服務 - 樂手與歌手"
              title="香港活動表演服務 - 樂手與歌手"
              className="w-full h-full object-cover object-top"
            />
          </div>
          <p className="text-sm md:text-base text-foreground-600 leading-relaxed">
            如活動以交流和餐飲為主，建議從爵士、Bossa Nova、Acoustic
            或純音樂組合開始，讓音樂提升空間質感而不妨礙談話。如活動需要製造高潮，可選擇主唱加樂隊、互動點唱或配合舞者的節目。若演出同時承擔品牌推廣、人流吸引或團隊參與目標，則應及早把表演時段、舞台位置、音響及主持口播一併規劃。
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-background-50 rounded-md p-4 border border-background-200/70">
            <div className="w-8 h-8 rounded-full bg-secondary-100 flex items-center justify-center mb-2">
              <i className="ri-chat-3-line text-secondary-600" />
            </div>
            <h4 className="font-heading text-sm font-semibold text-foreground-950 mb-1">以交流為主</h4>
            <p className="text-sm text-foreground-600">爵士、Bossa Nova、Acoustic、純音樂</p>
          </div>
          <div className="bg-background-50 rounded-md p-4 border border-background-200/70">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center mb-2">
              <i className="ri-fire-line text-primary-600" />
            </div>
            <h4 className="font-heading text-sm font-semibold text-foreground-950 mb-1">需要製造高潮</h4>
            <p className="text-sm text-foreground-600">主唱加樂隊、互動點唱、舞者配合</p>
          </div>
          <div className="bg-background-50 rounded-md p-4 border border-background-200/70">
            <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center mb-2">
              <i className="ri-store-3-line text-accent-600" />
            </div>
            <h4 className="font-heading text-sm font-semibold text-foreground-950 mb-1">品牌推廣目標</h4>
            <p className="text-sm text-foreground-600">表演時段、舞台位置、音響及主持口播一併規劃</p>
          </div>
        </div>
      </div>

      <div className="mt-12 md:mt-16">
        <ScenarioGallery
          heading="各類活動常見情景"
          subheading="從樂手、歌手到樂隊與舞者，我們按活動目標配對最合適的表演，讓每一場都恰到好處。"
          items={[
            {
              image: `${SITE}/ai/img_res/243796b0ffbd623e664f1ed314364b51.webp`,
              alt: '活動 樂手演出',
              title: '樂手演出',
              description: '鋼琴、小提琴、色士風等樂手為酒會與晚宴注入精緻情緒。',
            },
            {
              image: `${SITE}/ai/img_res/7485bbc7d885c8569e9e130a0f8ed829.webp`,
              alt: '活動 歌手表演',
              title: '歌手表演',
              description: '廣東歌、國語歌、英文歌及 Jazz 歌手，讓聲音成為核心記憶。',
            },
            {
              image: `${SITE}/ai/img_res/4a1f890c2fad6d1e4420ee9a64a51c0c.webp`,
              alt: '活動 跳舞之夜',
              title: '跳舞之夜',
              description: 'Dance Band、DJ 與舞者結合，把活動氣氛推向高潮。',
            },
            {
              image: `${SITE}/ai/img_res/0e01fadcb029281026f25fb8a7877a2b.webp`,
              alt: '活動 酒會爵士',
              title: '酒會爵士',
              description: '爵士與輕音樂為 CEO dinner 與品酒會營造質感而不搶焦點。',
            },
          ]}
        />
      </div>
    </PageLayout>
  );
}
