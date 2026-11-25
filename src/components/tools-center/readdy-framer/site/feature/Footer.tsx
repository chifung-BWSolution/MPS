import { Link, useLocation } from '../routerShim';
import { getLangFromPath, toLangPath, type Lang } from '../lang';

type FooterLink = { label: string; path: string; external?: boolean; date?: string };
type FooterGroup = { heading: string; links: FooterLink[] };

const QUOTE_URL = 'https://www.emailmeform.com/builder/form/69aam00sCW063';

const groups: Record<'zh' | 'en', FooterGroup[]> = {
  zh: [
    {
      heading: '服務分類',
      links: [
        { label: '服務一覽', path: '/services/' },
        { label: '婚禮演出', path: '/wedding-performance/' },
        { label: '周年晚宴', path: '/annual-dinner/' },
        { label: '駐場歌手', path: '/resident-singer/' },
        { label: 'VIP 接待', path: '/vip-reception/' },
        { label: '商場表演', path: '/mall-performance/' },
        { label: '節日活動', path: '/festival-events/' },
        { label: '餐廳 Live', path: '/restaurant-live/' },
        { label: '學校培訓', path: '/school-training/' },
        { label: '保險行業', path: '/insurance-industry/' },
        { label: '表演排舞', path: '/performance-choreography/' },
        { label: '音響工程', path: '/sound-engineering/' },
      ],
    },
    {
      heading: '婚宴及晚宴方案',
      links: [
        { label: '婚禮現場音樂', path: '/wedding-performance/wedding-live-music/' },
        { label: '證婚迎賓音樂', path: '/wedding-performance/ceremony-cocktail-music/' },
        { label: '婚宴樂隊歌手', path: '/wedding-performance/banquet-band-singer/' },
        { label: '婚禮流程音樂', path: '/wedding-performance/wedding-music-rundown/' },
        { label: '婚禮音響方案', path: '/wedding-performance/wedding-sound-system/' },
        { label: '求婚現場', path: '/wedding-performance/proposal-live/' },
        { label: '公司晚宴', path: '/annual-dinner/corporate-dinner/' },
        { label: '慈善晚宴', path: '/annual-dinner/charity-gala/' },
        { label: '頒獎與周年慶典', path: '/annual-dinner/awards-celebration/' },
      ],
    },
    {
      heading: '服務詳情',
      links: [
        { label: '樂手名單', path: '/services/musicians/' },
        { label: '歌手表演', path: '/services/singer-performance/' },
        { label: '粵語之夜', path: '/services/cantonese-music-night/' },
        { label: '經典英文歌曲', path: '/services/classic-english-songs/' },
        { label: '流行曲派對', path: '/services/pop-party/' },
        { label: '跳舞之夜', path: '/services/dance-night/' },
        { label: '酒會爵士', path: '/services/cocktail-jazz/' },
      ],
    },
    {
      heading: '駐場及主題活動',
      links: [
        { label: '餐廳駐場歌手', path: '/resident-singer/restaurant-resident-singer/' },
        { label: '酒店會所駐場', path: '/resident-singer/hotel-club-resident-singer/' },
        { label: '駐場試音排期', path: '/resident-singer/audition-scheduling/' },
        { label: 'CEO Dinner', path: '/vip-reception/ceo-dinner/' },
        { label: 'VVIP 款待晚宴', path: '/vip-reception/vvip-dinner/' },
        { label: '音樂遊船河', path: '/vip-reception/music-cruise/' },
        { label: 'Wine & Music Tasting', path: '/vip-reception/wine-music-tasting/' },
        { label: '品牌快閃', path: '/mall-performance/brand-pop-up/' },
        { label: '人寵音樂會', path: '/mall-performance/pet-friendly-concert/' },
        { label: '節日助慶', path: '/mall-performance/festival-celebration/' },
      ],
    },
    {
      heading: '音樂資訊',
      links: [
        { label: '音樂資訊總覽', path: '/music-insights/' },
        { label: '婚禮現場音樂完整指南', path: '/music-insights/wedding-live-music-guide/', date: '2026-09-30' },
        { label: '企業晚宴娛樂指南', path: '/music-insights/corporate-dinner-entertainment-guide/', date: '2026-09-28' },
        { label: '餐廳現場音樂指南', path: '/music-insights/restaurant-live-music-guide/', date: '2026-09-25' },
        { label: '學校音樂培訓', path: '/school-training/' },
        { label: '聯絡我們', path: '/contact/' },
      ],
    },
  ],
  en: [
    {
      heading: 'Services',
      links: [
        { label: 'All Services', path: '/en/services/' },
        { label: 'Wedding Performance', path: '/en/wedding-performance/' },
        { label: 'Annual Dinner', path: '/en/annual-dinner/' },
        { label: 'Resident Singer', path: '/en/resident-singer/' },
        { label: 'VIP Reception', path: '/en/vip-reception/' },
        { label: 'Mall Performance', path: '/en/mall-performance/' },
        { label: 'Festival Events', path: '/en/festival-events/' },
        { label: 'Restaurant Live', path: '/en/restaurant-live/' },
        { label: 'School Training', path: '/en/school-training/' },
        { label: 'Insurance Industry', path: '/en/insurance-industry/' },
        { label: 'Performance Choreography', path: '/en/performance-choreography/' },
        { label: 'Sound Engineering', path: '/en/sound-engineering/' },
      ],
    },
    {
      heading: 'Wedding & Dinner',
      links: [
        { label: 'Wedding Live Music', path: '/en/wedding-performance/wedding-live-music/' },
        { label: 'Ceremony & Cocktail Music', path: '/en/wedding-performance/ceremony-cocktail-music/' },
        { label: 'Banquet Band & Singer', path: '/en/wedding-performance/banquet-band-singer/' },
        { label: 'Wedding Music Rundown', path: '/en/wedding-performance/wedding-music-rundown/' },
        { label: 'Wedding Sound System', path: '/en/wedding-performance/wedding-sound-system/' },
        { label: 'Proposal Live', path: '/en/wedding-performance/proposal-live/' },
        { label: 'Corporate Dinner', path: '/en/annual-dinner/corporate-dinner/' },
        { label: 'Charity Gala', path: '/en/annual-dinner/charity-gala/' },
        { label: 'Awards & Celebration', path: '/en/annual-dinner/awards-celebration/' },
      ],
    },
    {
      heading: 'Service Details',
      links: [
        { label: 'Musicians', path: '/en/services/musicians/' },
        { label: 'Singer Performance', path: '/en/services/singer-performance/' },
        { label: 'Cantonese Music Night', path: '/en/services/cantonese-music-night/' },
        { label: 'Classic English Songs', path: '/en/services/classic-english-songs/' },
        { label: 'Pop Party', path: '/en/services/pop-party/' },
        { label: 'Dance Night', path: '/en/services/dance-night/' },
        { label: 'Cocktail Jazz', path: '/en/services/cocktail-jazz/' },
      ],
    },
    {
      heading: 'Residencies & Themes',
      links: [
        { label: 'Restaurant Resident Singer', path: '/en/resident-singer/restaurant-resident-singer/' },
        { label: 'Hotel & Club Resident', path: '/en/resident-singer/hotel-club-resident-singer/' },
        { label: 'Audition & Scheduling', path: '/en/resident-singer/audition-scheduling/' },
        { label: 'CEO Dinner', path: '/en/vip-reception/ceo-dinner/' },
        { label: 'VVIP Dinner', path: '/en/vip-reception/vvip-dinner/' },
        { label: 'Music Cruise', path: '/en/vip-reception/music-cruise/' },
        { label: 'Wine & Music Tasting', path: '/en/vip-reception/wine-music-tasting/' },
        { label: 'Brand Pop-up', path: '/en/mall-performance/brand-pop-up/' },
        { label: 'Pet-Friendly Concert', path: '/en/mall-performance/pet-friendly-concert/' },
        { label: 'Festival Celebration', path: '/en/mall-performance/festival-celebration/' },
      ],
    },
    {
      heading: 'Insights',
      links: [
        { label: 'Music Insights', path: '/en/music-insights/' },
        { label: 'Wedding Live Music Guide', path: '/en/music-insights/wedding-live-music-guide/', date: '2026-09-30' },
        { label: 'Corporate Dinner Guide', path: '/en/music-insights/corporate-dinner-entertainment-guide/', date: '2026-09-28' },
        { label: 'Restaurant Live Music Guide', path: '/en/music-insights/restaurant-live-music-guide/', date: '2026-09-25' },
        { label: 'Contact Us', path: '/en/contact/' },
      ],
    },
  ],
};

const quickLinks: Record<'zh' | 'en', FooterLink[]> = {
  zh: [
    { label: '服務一覽', path: '/services/' },
    { label: '音樂資訊', path: '/music-insights/' },
    { label: '聯絡我們', path: '/contact/' },
    { label: '網上報價', path: QUOTE_URL, external: true },
  ],
  en: [
    { label: 'All Services', path: '/en/services/' },
    { label: 'Music Insights', path: '/en/music-insights/' },
    { label: 'Contact Us', path: '/en/contact/' },
    { label: 'Get a Quote', path: QUOTE_URL, external: true },
  ],
};

const copy: Record<'zh' | 'en', {
  tagline: string;
  quoteCta: string;
  contactCta: string;
  quickHeading: string;
  contactHeading: string;
  address: string;
  rights: string;
}> = {
  zh: {
    tagline: '香港音樂娛樂活動統籌中心 — 一站式現場音樂娛樂統籌，服務香港及大灣區',
    quoteCta: '立即網上報價',
    contactCta: '聯絡我們',
    quickHeading: '快速連結',
    contactHeading: '聯絡我們',
    address: '荃灣青山公路459-469號華力工業中心5字樓D-G室',
    rights: '保留所有權利.',
  },
  en: {
    tagline: 'Hong Kong music and entertainment coordination — one-stop live music production for Hong Kong and the Greater Bay Area',
    quoteCta: 'Get a Quote',
    contactCta: 'Contact Us',
    quickHeading: 'Quick Links',
    contactHeading: 'Contact Us',
    address: 'Units D-G, 5/F, Wah Lik Industrial Centre, 459-469 Castle Peak Road, Tsuen Wan, Hong Kong',
    rights: 'All rights reserved.',
  },
};

function FooterNavLink({ link, lang }: { link: FooterLink; lang: Lang }) {
  const className = 'text-sm text-foreground-600 hover:text-primary-600 transition-colors leading-relaxed';
  const content = (
    <>
      <span>{link.label}</span>
      {link.date && (
        <span className="block text-xs text-foreground-400 mt-0.5">{link.date}</span>
      )}
    </>
  );
  if (link.external) {
    return (
      <a href={link.path} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link to={toLangPath(link.path, lang)} className={className}>
      {content}
    </Link>
  );
}

export default function Footer() {
  const { pathname } = useLocation();
  const lang: Lang = getLangFromPath(pathname);
  const uiLang: 'zh' | 'en' = lang === 'en' ? 'en' : 'zh';
  const t = copy[uiLang];
  const langGroups = groups[uiLang];

  return (
    <footer className="bg-background-100 border-t border-background-200/70">
      {/* Brand + contact + quick links */}
      <div className="px-4 md:px-6 pt-10 md:pt-14 pb-8 md:pb-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
          {/* Brand */}
          <div className="lg:col-span-6">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center">
                <i className="ri-music-2-line text-background-50 text-sm" />
              </div>
              <span className="font-heading font-bold text-foreground-950 text-base">
                BW Event Music
              </span>
            </div>
            <p className="text-sm text-foreground-500 leading-relaxed mb-4 max-w-md">
              {t.tagline}
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <a
                href={QUOTE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 bg-primary-500 text-background-50 text-sm font-medium rounded-md hover:bg-primary-600 transition-colors whitespace-nowrap cursor-pointer"
              >
                {t.quoteCta}
              </a>
              <Link
                to={toLangPath('/contact/', lang)}
                className="px-5 py-2.5 border border-primary-500 text-primary-600 text-sm font-medium rounded-md hover:bg-primary-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                {t.contactCta}
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <a href="https://wa.me/85259335827?text=I%20would%20like%20to%20enquire%20about%20BW%20Event%20Music%20services" target="_blank" rel="noreferrer" aria-label="WhatsApp" className="w-8 h-8 rounded-full bg-background-200/70 flex items-center justify-center text-foreground-500 hover:bg-primary-500 hover:text-background-50 transition-colors cursor-pointer">
                <i className="ri-whatsapp-line text-base" />
              </a>
              <a href="mailto:sales@bwevent-music.com" aria-label="Email" className="w-8 h-8 rounded-full bg-background-200/70 flex items-center justify-center text-foreground-500 hover:bg-primary-500 hover:text-background-50 transition-colors cursor-pointer">
                <i className="ri-mail-line text-base" />
              </a>
              <a href="tel:+85221857377" aria-label="Phone" className="w-8 h-8 rounded-full bg-background-200/70 flex items-center justify-center text-foreground-500 hover:bg-primary-500 hover:text-background-50 transition-colors cursor-pointer">
                <i className="ri-phone-line text-base" />
              </a>
            </div>
          </div>

          {/* Contact */}
          <div className="lg:col-span-4">
            <h4 className="font-heading font-semibold text-foreground-950 text-sm mb-3">
              {t.contactHeading}
            </h4>
            <div className="space-y-2 text-sm text-foreground-600">
              <p className="flex items-start gap-2">
                <i className="ri-phone-line text-foreground-400 mt-0.5" />
                <a href="tel:+85221857377" className="hover:text-primary-600 transition-colors">
                  (+852) 2185 7377
                </a>
              </p>
              <p className="flex items-start gap-2">
                <i className="ri-whatsapp-line text-foreground-400 mt-0.5" />
                <a href="https://wa.me/85259335827?text=I%20would%20like%20to%20enquire%20about%20BW%20Event%20Music%20services" target="_blank" rel="noreferrer" className="hover:text-primary-600 transition-colors">
                  (+852) 5933 5827 (WhatsApp)
                </a>
              </p>
              <p className="flex items-start gap-2">
                <i className="ri-mail-line text-foreground-400 mt-0.5" />
                <a href="mailto:sales@bwevent-music.com" className="hover:text-primary-600 transition-colors break-all">
                  sales@bwevent-music.com
                </a>
              </p>
              <p className="flex items-start gap-2 text-foreground-500 leading-relaxed">
                <i className="ri-map-pin-line text-foreground-400 mt-0.5" />
                <span>{t.address}</span>
              </p>
            </div>
          </div>

          {/* Quick links */}
          <div className="lg:col-span-2">
            <h4 className="font-heading font-semibold text-foreground-950 text-sm mb-3">
              {t.quickHeading}
            </h4>
            <ul className="space-y-1.5">
              {quickLinks[uiLang].map((link) => (
                <li key={link.path}>
                  <FooterNavLink link={link} lang={lang} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="px-4 md:px-6">
        <div className="max-w-7xl mx-auto border-t border-background-200/70" />
      </div>

      {/* Link groups */}
      <div className="px-4 md:px-6 py-8 md:py-10">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-8">
          {langGroups.map((group) => (
            <div key={group.heading}>
              <h4 className="font-heading font-semibold text-foreground-950 text-sm mb-3">
                {group.heading}
              </h4>
              <ul className="space-y-1.5">
                {group.links.map((link) => (
                  <li key={link.path}>
                    <FooterNavLink link={link} lang={lang} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Copyright bar */}
      <div className="border-t border-background-200/70 px-4 md:px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1">
          <p className="text-xs text-foreground-400">
            &copy; {new Date().getFullYear()} BW Event Music. {t.rights}
          </p>
          <p className="text-xs text-foreground-400">
            BW Solution Ltd.
          </p>
        </div>
      </div>
    </footer>
  );
}