import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from '../routerShim';
import { useSiteScroll } from '../scrollRoot';
import { getLangFromPath, toLangPath, toSafeLangPath, type Lang } from '../lang';

type NavChild = { zh: { label: string; path: string }; en: { label: string; path: string } };
type NavItem = {
  zh: { label: string; path: string };
  en: { label: string; path: string };
  children?: NavChild[];
};

const mainNavItems: NavItem[] = [
  { zh: { label: '主頁', path: '/' }, en: { label: 'Home', path: '/en' } },
  {
    zh: { label: '服務一覽', path: '/services/' },
    en: { label: 'Services', path: '/en/services/' },
    children: [
      { zh: { label: '樂手名單', path: '/services/musicians/' }, en: { label: 'Musicians', path: '/en/services/musicians/' } },
      { zh: { label: '歌手表演', path: '/services/singer-performance/' }, en: { label: 'Singer Performance', path: '/en/services/singer-performance/' } },
      { zh: { label: '粵語之夜', path: '/services/cantonese-music-night/' }, en: { label: 'Cantonese Music Night', path: '/en/services/cantonese-music-night/' } },
      { zh: { label: '經典英文歌曲', path: '/services/classic-english-songs/' }, en: { label: 'Classic English Songs', path: '/en/services/classic-english-songs/' } },
      { zh: { label: '流行曲派對', path: '/services/pop-party/' }, en: { label: 'Pop Party', path: '/en/services/pop-party/' } },
      { zh: { label: '跳舞之夜', path: '/services/dance-night/' }, en: { label: 'Dance Night', path: '/en/services/dance-night/' } },
      { zh: { label: '酒會爵士', path: '/services/cocktail-jazz/' }, en: { label: 'Cocktail Jazz', path: '/en/services/cocktail-jazz/' } },
    ],
  },
  {
    zh: { label: '婚禮演出', path: '/wedding-performance/' },
    en: { label: 'Weddings', path: '/en/wedding-performance/' },
    children: [
      { zh: { label: '婚禮現場音樂', path: '/wedding-performance/wedding-live-music/' }, en: { label: 'Wedding Live Music', path: '/en/wedding-performance/wedding-live-music/' } },
      { zh: { label: '證婚迎賓音樂', path: '/wedding-performance/ceremony-cocktail-music/' }, en: { label: 'Ceremony & Cocktail Music', path: '/en/wedding-performance/ceremony-cocktail-music/' } },
      { zh: { label: '婚宴樂隊歌手', path: '/wedding-performance/banquet-band-singer/' }, en: { label: 'Banquet Band & Singer', path: '/en/wedding-performance/banquet-band-singer/' } },
      { zh: { label: '婚禮流程音樂', path: '/wedding-performance/wedding-music-rundown/' }, en: { label: 'Wedding Music Rundown', path: '/en/wedding-performance/wedding-music-rundown/' } },
      { zh: { label: '婚禮音響方案', path: '/wedding-performance/wedding-sound-system/' }, en: { label: 'Wedding Sound System', path: '/en/wedding-performance/wedding-sound-system/' } },
      { zh: { label: '求婚現場', path: '/wedding-performance/proposal-live/' }, en: { label: 'Proposal Live', path: '/en/wedding-performance/proposal-live/' } },
    ],
  },
  {
    zh: { label: '周年晚宴', path: '/annual-dinner/' },
    en: { label: 'Dinner', path: '/en/annual-dinner/' },
    children: [
      { zh: { label: '公司晚宴', path: '/annual-dinner/corporate-dinner/' }, en: { label: 'Corporate Dinner', path: '/en/annual-dinner/corporate-dinner/' } },
      { zh: { label: '慈善晚宴', path: '/annual-dinner/charity-gala/' }, en: { label: 'Charity Gala', path: '/en/annual-dinner/charity-gala/' } },
      { zh: { label: '頒獎與周年慶典', path: '/annual-dinner/awards-celebration/' }, en: { label: 'Awards & Celebration', path: '/en/annual-dinner/awards-celebration/' } },
    ],
  },
  {
    zh: { label: '學校培訓', path: '/school-training/' },
    en: { label: 'Schools', path: '/en/school-training/' },
    children: [
      { zh: { label: '校園音樂工作坊', path: '/school-training/music-workshop/' }, en: { label: 'Campus Music Workshop', path: '/en/school-training/music-workshop/' } },
      { zh: { label: '合唱與樂隊訓練', path: '/school-training/choir-band-training/' }, en: { label: 'Choir & Band Training', path: '/en/school-training/choir-band-training/' } },
      { zh: { label: '學校典禮演出', path: '/school-training/school-ceremony-showcase/' }, en: { label: 'School Ceremony Showcase', path: '/en/school-training/school-ceremony-showcase/' } },
    ],
  },
  {
    zh: { label: '駐場歌手', path: '/resident-singer/' },
    en: { label: 'Singers', path: '/en/resident-singer/' },
    children: [
      { zh: { label: '餐廳駐場歌手', path: '/resident-singer/restaurant-resident-singer/' }, en: { label: 'Restaurant Resident Singer', path: '/en/resident-singer/restaurant-resident-singer/' } },
      { zh: { label: '酒店會所駐場', path: '/resident-singer/hotel-club-resident-singer/' }, en: { label: 'Hotel & Club Resident', path: '/en/resident-singer/hotel-club-resident-singer/' } },
      { zh: { label: '駐場試音排期', path: '/resident-singer/audition-scheduling/' }, en: { label: 'Audition & Scheduling', path: '/en/resident-singer/audition-scheduling/' } },
    ],
  },
  {
    zh: { label: 'VIP接待', path: '/vip-reception/' },
    en: { label: 'VIP', path: '/en/vip-reception/' },
    children: [
      { zh: { label: 'CEO Dinner', path: '/vip-reception/ceo-dinner/' }, en: { label: 'CEO Dinner', path: '/en/vip-reception/ceo-dinner/' } },
      { zh: { label: 'VVIP款待晚宴', path: '/vip-reception/vvip-dinner/' }, en: { label: 'VVIP Dinner', path: '/en/vip-reception/vvip-dinner/' } },
      { zh: { label: '音樂遊船河', path: '/vip-reception/music-cruise/' }, en: { label: 'Music Cruise', path: '/en/vip-reception/music-cruise/' } },
      { zh: { label: '品酒配樂', path: '/vip-reception/wine-music-tasting/' }, en: { label: 'Wine & Music Tasting', path: '/en/vip-reception/wine-music-tasting/' } },
    ],
  },
  {
    zh: { label: '商場表演', path: '/mall-performance/' },
    en: { label: 'Malls', path: '/en/mall-performance/' },
    children: [
      { zh: { label: '節日助慶', path: '/mall-performance/festival-celebration/' }, en: { label: 'Festival Celebration', path: '/en/mall-performance/festival-celebration/' } },
      { zh: { label: '人寵音樂會', path: '/mall-performance/pet-friendly-concert/' }, en: { label: 'Pet-Friendly Concert', path: '/en/mall-performance/pet-friendly-concert/' } },
      { zh: { label: '品牌快閃', path: '/mall-performance/brand-pop-up/' }, en: { label: 'Brand Pop-up', path: '/en/mall-performance/brand-pop-up/' } },
    ],
  },
  { zh: { label: '節日活動', path: '/festival-events/' }, en: { label: 'Festivals', path: '/en/festival-events/' } },
  { zh: { label: '餐廳Live', path: '/restaurant-live/' }, en: { label: 'Restaurants', path: '/en/restaurant-live/' } },
  { zh: { label: '保險行業', path: '/insurance-industry/' }, en: { label: 'Insurance', path: '/en/insurance-industry/' } },
  { zh: { label: '表演排舞', path: '/performance-choreography/' }, en: { label: 'Dance', path: '/en/performance-choreography/' } },
  { zh: { label: '音響工程', path: '/sound-engineering/' }, en: { label: 'Sound', path: '/en/sound-engineering/' } },
  {
    zh: { label: '音樂資訊', path: '/music-insights/' },
    en: { label: 'Blog', path: '/en/music-insights/' },
    children: [
      { zh: { label: '婚禮現場音樂完整指南', path: '/music-insights/wedding-live-music-guide/' }, en: { label: 'Wedding Live Music Guide', path: '/en/music-insights/wedding-live-music-guide/' } },
    ],
  },
];

type MobileSection = { heading: { zh: string; en: string } | null; keys: string[] };

const mobileSections: MobileSection[] = [
  { heading: null, keys: ['/en'] },
  {
    heading: { zh: '主要服務', en: 'Core Services' },
    keys: [
      '/en/services/',
      '/en/wedding-performance/',
      '/en/annual-dinner/',
      '/en/resident-singer/',
      '/en/vip-reception/',
      '/en/mall-performance/',
    ],
  },
  {
    heading: { zh: '更多服務', en: 'More Services' },
    keys: [
      '/en/festival-events/',
      '/en/restaurant-live/',
      '/en/school-training/',
      '/en/insurance-industry/',
      '/en/performance-choreography/',
      '/en/sound-engineering/',
    ],
  },
  {
    heading: { zh: '資訊', en: 'Insights' },
    keys: ['/en/music-insights/'],
  },
];

const ctaItems: { zh: { label: string; path: string; external: boolean }; en: { label: string; path: string; external: boolean } }[] = [
  {
    zh: { label: '網上報價', path: 'https://www.emailmeform.com/builder/form/69aam00sCW063', external: true },
    en: { label: 'Get a Quote', path: 'https://www.emailmeform.com/builder/form/69aam00sCW063', external: true },
  },
  { zh: { label: '聯絡我們', path: '/contact/', external: false }, en: { label: 'Contact', path: '/en/contact/', external: false } },
];

const langOptions: { code: Lang; label: string; short: string }[] = [
  { code: 'zh', label: '繁體中文', short: '繁體' },
  { code: 'cn', label: '简体中文', short: '简体' },
  { code: 'en', label: 'English', short: 'EN' },
];

function LangSwitcher({
  lang,
  pathname,
  transparent,
}: {
  lang: Lang;
  pathname: string;
  transparent: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const current = langOptions.find((opt) => opt.code === lang) ?? langOptions[0];

  const triggerClass = `flex items-center gap-0.5 rounded-full border px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
    !transparent
      ? 'border-background-300/70 text-foreground-700 hover:border-primary-400 hover:text-primary-600'
      : 'border-background-50/50 text-background-50 hover:bg-background-50/10'
  }`;

  return (
    <div className="relative" ref={ref} data-no-convert>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={triggerClass}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="語言 / Language"
      >
        <i className="ri-translate-2 text-sm" />
        <span>{current.short}</span>
        <i className={`ri-arrow-down-s-line text-xs transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-36 rounded-md border border-background-200 bg-background-50 overflow-hidden z-50">
          {langOptions.map((opt) => (
            <Link
              key={opt.code}
              to={toSafeLangPath(pathname, opt.code)}
              data-lang-switch
              onClick={() => setOpen(false)}
              className={`flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors ${
                lang === opt.code
                  ? 'text-primary-600 font-medium bg-primary-50'
                  : 'text-foreground-700 hover:bg-background-100'
              }`}
            >
              <span>{opt.label}</span>
              {lang === opt.code && <i className="ri-check-line text-primary-500" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const scrollerRef = useSiteScroll();
  const location = useLocation();
  const lang: Lang = getLangFromPath(location.pathname);
  const uiLang: 'zh' | 'en' = lang === 'en' ? 'en' : 'zh';

  const label = (item: { zh: { label: string }; en: { label: string } }) =>
    uiLang === 'en' ? item.en.label : item.zh.label;
  const navTo = (zhPath: string) => toLangPath(zhPath, lang);

  useEffect(() => {
    const scroller = scrollerRef?.current ?? null;
    const onScroll = () => {
      const header = headerRef.current;
      const top = scroller ? scroller.scrollTop : window.scrollY;
      if (!scroller || !header) {
        setScrolled(top > 40);
        if (header) header.style.transform = '';
        return;
      }
      // The preview scales the page with CSS transform, which traps `position: fixed`
      // inside the scaled page. Counter-translate by the canvas scroll distance so the
      // bar stays on the visible top edge, in the page's own coordinate space.
      const offsetHeight = header.offsetHeight;
      const visualHeight = header.getBoundingClientRect().height;
      const scale = offsetHeight > 0 && visualHeight > 0 ? visualHeight / offsetHeight : 1;
      const pageTop = top / scale;
      setScrolled(pageTop > 40);
      header.style.transform = pageTop > 0.5 ? `translate3d(0, ${Math.round(pageTop * 100) / 100}px, 0)` : '';
    };
    onScroll();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', onScroll, { passive: true });
    const resizeObserver = scroller ? new ResizeObserver(onScroll) : null;
    if (scroller) resizeObserver?.observe(scroller);
    return () => {
      target.removeEventListener('scroll', onScroll);
      resizeObserver?.disconnect();
      if (headerRef.current) headerRef.current.style.transform = '';
    };
  }, [scrollerRef]);

  useEffect(() => {
    setMobileOpen(false);
    setExpanded(null);
  }, [location.pathname]);

  const isHome = location.pathname === '/' || location.pathname === '/en' || location.pathname === '/cn';
  const navBg = !isHome || scrolled
    ? 'bg-background-50/95 backdrop-blur-sm border-b border-background-200/70'
    : 'bg-transparent';
  const textColor = !isHome || scrolled ? 'text-foreground-950' : 'text-background-50';

  const ctaBaseClass = 'px-3 lg:px-4 py-1.5 lg:py-2 text-xs lg:text-sm font-medium rounded-md whitespace-nowrap transition-colors';

  const isActive = (item: NavItem) => {
    if (item.zh.path === '/') return isHome;
    if (location.pathname === navTo(item.zh.path)) return true;
    if (item.children) {
      return item.children.some((child) => location.pathname === navTo(child.zh.path));
    }
    return false;
  };

  const isChildActive = (child: NavChild) => location.pathname === navTo(child.zh.path);

  return (
    <header
      ref={headerRef}
      className={`fixed top-0 left-0 right-0 z-50 transition-[background-color,border-color,box-shadow] duration-300 ${navBg}`}
    >
      <nav className="w-full px-4 md:px-6">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link to={navTo('/')} className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-primary-500 flex items-center justify-center">
              <i className="ri-music-2-line text-background-50 text-sm lg:text-base" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className={`font-heading font-bold text-base lg:text-lg whitespace-nowrap ${textColor}`}>
                BW Event Music
              </span>
              <span className={`readdy-brand-sub text-[11px] lg:text-xs whitespace-nowrap ${textColor} opacity-70`}>
                {uiLang === 'en' ? 'Hong Kong Music & Event Coordination' : '香港音樂娛樂活動統籌中心'}
              </span>
            </div>
          </Link>

          {/* Desktop Nav — 2xl and above */}
          <div className="readdy-nav-desktop items-center gap-1">
            {mainNavItems.map((item) => (
              <Link
                key={item.zh.path}
                to={navTo(item.zh.path)}
                className={`px-1 py-1.5 text-xs 2xl:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  isActive(item)
                    ? 'text-primary-600'
                    : `${textColor} hover:text-primary-500`
                }`}
              >
                {label(item)}
              </Link>
            ))}
          </div>

          {/* Desktop CTAs + Language switcher — 2xl and above */}
          <div className="readdy-nav-desktop items-center gap-2">
            <LangSwitcher lang={lang} pathname={location.pathname} transparent={isHome && !scrolled} />
            {ctaItems.map((item) => {
              const cta = uiLang === 'en' ? item.en : item.zh;
              return cta.external ? (
                <a
                  key={cta.path}
                  href={cta.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${ctaBaseClass} bg-primary-500 text-background-50 hover:bg-primary-600`}
                >
                  {cta.label}
                </a>
              ) : (
                <Link
                  key={cta.path}
                  to={toLangPath(cta.path, lang)}
                  className={`${ctaBaseClass} border border-primary-500 text-primary-600 hover:bg-primary-50`}
                >
                  {cta.label}
                </Link>
              );
            })}
          </div>

          {/* Mobile controls — below 2xl */}
          <div className="readdy-nav-mobile flex items-center gap-1.5">
            <LangSwitcher lang={lang} pathname={location.pathname} transparent={isHome && !scrolled} />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className={`p-2 rounded-md ${textColor}`}
              aria-label="Toggle menu"
            >
              <i className={`ri-${mobileOpen ? 'close' : 'menu'}-line text-2xl`} />
            </button>
          </div>
        </div>

        {/* Mobile menu — below 2xl */}
        {mobileOpen && (
          <div className="readdy-nav-mobile bg-background-50 border-t border-background-200/70 max-h-[calc(100dvh-4rem)] lg:max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain pb-4 flex-col">
            <div className="flex flex-col">
              {mobileSections.map((section, sIdx) => (
                <div key={section.heading?.en ?? `section-${sIdx}`} className="py-1">
                  {section.heading && (
                    <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-foreground-400">
                      {uiLang === 'en' ? section.heading.en : section.heading.zh}
                    </p>
                  )}
                  {section.keys.map((key) => {
                    const item = mainNavItems.find((navItem) => navItem.en.path === key);
                    if (!item) return null;
                    const hasChildren = !!item.children?.length;
                    const isExpanded = expanded === item.en.path;
                    const active = isActive(item);

                    if (!hasChildren) {
                      return (
                        <Link
                          key={item.zh.path}
                          to={navTo(item.zh.path)}
                          className={`flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium border-b border-background-100 ${
                            active ? 'text-primary-600' : 'text-foreground-800'
                          }`}
                        >
                          <span>{label(item)}</span>
                          {active && <i className="ri-check-line text-primary-500" />}
                        </Link>
                      );
                    }

                    return (
                      <div key={item.zh.path} className="border-b border-background-100">
                        <div className="flex items-stretch">
                          <Link
                            to={navTo(item.zh.path)}
                            className={`flex-1 px-4 py-3 text-sm font-medium ${
                              active ? 'text-primary-600' : 'text-foreground-800'
                            }`}
                          >
                            {label(item)}
                          </Link>
                          <button
                            type="button"
                            onClick={() => setExpanded(isExpanded ? null : item.en.path)}
                            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label(item)}`}
                            aria-expanded={isExpanded}
                            className={`px-4 flex items-center justify-center transition-colors cursor-pointer ${
                              active ? 'text-primary-600' : 'text-foreground-500 hover:text-primary-600'
                            }`}
                          >
                            <i className={`ri-arrow-down-s-line text-lg transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="bg-background-100/70 pb-1">
                            {item.children!.map((child) => (
                              <Link
                                key={child.zh.path}
                                to={navTo(child.zh.path)}
                                className={`block pl-8 pr-4 py-2.5 text-sm border-t border-background-100/80 ${
                                  isChildActive(child)
                                    ? 'text-primary-600 font-medium'
                                    : 'text-foreground-700'
                                }`}
                              >
                                {label(child)}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="flex flex-col gap-2 px-4 pt-4 pb-1">
                {ctaItems.map((item) => {
                  const cta = uiLang === 'en' ? item.en : item.zh;
                  return cta.external ? (
                    <a
                      key={cta.path}
                      href={cta.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 text-sm font-medium rounded-md text-center whitespace-nowrap bg-primary-500 text-background-50"
                    >
                      {cta.label}
                    </a>
                  ) : (
                    <Link
                      key={cta.path}
                      to={toLangPath(cta.path, lang)}
                      className="px-4 py-3 text-sm font-medium rounded-md text-center whitespace-nowrap border border-primary-500 text-primary-600"
                    >
                      {cta.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}