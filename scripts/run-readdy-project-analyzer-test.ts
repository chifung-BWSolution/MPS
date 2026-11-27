import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import JSZip from 'jszip';
import {
  analyzeReaddyFileMap,
  assembleReaddyPageCode,
  normalizeProjectFileMap,
  oklchToHex,
  parseCssTokensFromStylesheet,
} from '../src/lib/readdyProjectAnalyzer.ts';

// 1. Unit test: OKLCH -> Hex (CSS Color 4 gamut-mapped) & CSS Token extraction
const primaryHex = oklchToHex(0.62, 0.18, 75);
assert.equal(primaryHex, '#B37900', 'oklchToHex should produce CSS Color 4 gamut-mapped warm amber-gold');

const cssTokens = parseCssTokensFromStylesheet(`
:root {
  --font-heading: "Noto Serif HK", serif;
  --font-body: "Noto Sans HK", sans-serif;
  --background-50: 0.97 0.01 80;
  --primary-500: 0.62 0.18 75;
  --foreground-950: 0.15 0.11 30;
}
`);
assert.ok(cssTokens.backgroundHex?.startsWith('#'), 'backgroundHex parsed from OKLCH');
assert.ok(cssTokens.primaryHex?.startsWith('#'), 'primaryHex parsed from OKLCH');
assert.equal(cssTokens.fontHeading, '"Noto Serif HK", serif'.replace(/"/g, ''));

// 2. Unit test: Inline synthetic multi-page project fixture
const fixtureMap = normalizeProjectFileMap({
  'demo/index.html': '<title>Demo Music Co</title>',
  'demo/src/index.css': ':root { --background-50: 0.97 0.01 80; --primary-500: 0.62 0.18 75; }',
  'demo/src/router/config.tsx': `
    import { lazy } from "react";
    const Home = lazy(() => import("@/pages/home/page"));
    const About = lazy(() => import("@/pages/about/page"));
    export default [
      { path: "/", element: <Home /> },
      { path: "/about/", element: <About /> },
      { path: "*", element: <NotFound /> },
    ];
  `,
  'demo/src/pages/home/page.tsx': `
    import Navbar from '@/components/layout/Navbar';
    import Footer from '@/components/layout/Footer';
    import Hero from './sections/Hero';
    import FaqSection from './sections/FaqSection';
    export default function Home() { return <main><Navbar /><Hero /><FaqSection /><Footer /></main>; }
  `,
  'demo/src/components/layout/Navbar.tsx': `
    const mainNavItems = [
      { zh: { label: '主頁', path: '/' }, en: { label: 'Home', path: '/en' } },
      { zh: { label: '關於', path: '/about/' }, en: { label: 'About', path: '/en/about/' } },
    ];
    const ctaItems = [
      { zh: { label: '報價', path: 'https://example.com/quote' }, en: { label: 'Quote', path: 'https://example.com/quote' } },
    ];
    export default function Navbar() { return null; }
  `,
  'demo/src/components/layout/Footer.tsx': `
    const groups = {
      zh: [{ heading: '服務', links: [{ label: '關於我們', path: '/about/' }] }],
      en: [{ heading: 'Services', links: [{ label: 'About', path: '/en/about/' }] }],
    };
    export default function Footer() { return null; }
  `,
  'demo/src/pages/home/sections/Hero.tsx': `
    import Card from './Card';
    export default function Hero() { return <section><h1>Demo Hero</h1><Card /></section>; }
  `,
  'demo/src/pages/home/sections/Card.tsx': `
    const services = [{ name: '嵌套卡片', occasions: '子組件內容', path: '/about/' }];
    export default function Card() { return <article><h3>嵌套卡片</h3><p>子組件內容</p><a href="/about/">了解更多</a></article>; }
  `,
  'demo/src/pages/home/sections/FaqSection.tsx': `
    import { FAQ_ITEMS } from '@/lib/seo';
    export default function FaqSection() {
      return <section>{FAQ_ITEMS.map((item, idx) => <button key={idx} onClick={() => console.log(idx)}>{item.question}</button>)}</section>;
    }
  `,
  'demo/src/lib/seo.ts': `
    export const FAQ_ITEMS = [
      { question: '第一個問題？', answer: '第一個回答。' },
      { question: '第二個問題？', answer: '第二個回答。' },
    ];
  `,
  'demo/src/pages/about/page.tsx': `
    import PageLayout from '@/components/layout/PageLayout';
    const subPages = [
      { label: '公司晚宴', path: '/annual-dinner/corporate-dinner/' },
    ];
    const elements = ['嘉賓迎賓音樂', '開場秀'];
    export default function About() {
      return (
        <PageLayout title="關於我們" subtitle="簡介" ctaText="報價" ctaLink="https://example.com/quote" ctaSecondaryText="聯絡" ctaSecondaryLink="/contact/">
          <div><h2>故事</h2><p>頁面正文</p></div>
          <div>
            {elements.map((el) => (
              <span key={el}>{el}</span>
            ))}
          </div>
          <div>
            {subPages.map((page) => (
              <Link key={page.path} to={page.path}>{page.label}</Link>
            ))}
          </div>
        </PageLayout>
      );
    }
  `,
  'demo/src/components/layout/PageLayout.tsx': 'export default function PageLayout() { return null; }',
});
const fixtureAnalysis = analyzeReaddyFileMap(fixtureMap, {
  sourceType: 'upload',
  projectName: 'demo',
});
assert.equal(fixtureAnalysis.pages.length, 2, 'Excludes * NotFound and discovers 2 pages');
assert.equal(fixtureAnalysis.pages[1].title, '關於我們');
assert.equal(fixtureAnalysis.pages[1].pageKind, 'layout-page');

const fixtureHomeBundle = assembleReaddyPageCode(fixtureAnalysis.pages[0], fixtureMap, fixtureAnalysis);
assert.ok(fixtureHomeBundle.code.includes('Demo Hero'), 'Home bundle includes Hero section');
assert.ok(
  fixtureHomeBundle.code.includes('const FAQ_ITEMS = [') &&
    fixtureHomeBundle.code.includes('第一個問題？') &&
    fixtureHomeBundle.code.includes('第二個回答。'),
  'Home bundle inlines imported FAQ_ITEMS constant array into FaqSection',
);
assert.ok(fixtureHomeBundle.code.includes('<a href="/">主頁</a>'), 'Navbar keeps the home path');
assert.ok(fixtureHomeBundle.code.includes('<a href="/about/">關於</a>'), 'Navbar keeps section paths');
assert.ok(
  fixtureHomeBundle.code.includes('<a href="https://example.com/quote">報價</a>'),
  'Navbar CTA keeps its external URL',
);
assert.ok(fixtureHomeBundle.code.includes('<a href="/about/">關於我們</a>'), 'Footer keeps link paths');
assert.ok(fixtureHomeBundle.code.includes('嵌套卡片'), 'Nested section components are inlined');
assert.ok(!fixtureHomeBundle.code.includes('<a href="#">'), 'Assembled links are not emptied to hash');
const fixtureAboutBundle = assembleReaddyPageCode(fixtureAnalysis.pages[1], fixtureMap, fixtureAnalysis);
assert.ok(fixtureAboutBundle.code.includes('頁面正文'), 'PageLayout children stay in the assembled page');
assert.ok(fixtureAboutBundle.code.includes('嘉賓迎賓音樂'), 'String lists inside the page are expanded');
assert.ok(
  fixtureAboutBundle.code.includes('<Link key="0" to="/annual-dinner/corporate-dinner/">公司晚宴</Link>') ||
    fixtureAboutBundle.code.includes('to="/annual-dinner/corporate-dinner/"'),
  'Mapped page links keep their paths',
);
assert.ok(fixtureAboutBundle.code.includes('href="https://example.com/quote"'), 'PageLayout CTA keeps its URL');
assert.ok(fixtureAboutBundle.code.includes('href="/contact/"'), 'Secondary CTA keeps its path');

const partialSrcMap = {
  'src/pages/design-center/page.tsx': 'export default function Page() { return <h1>Design Center</h1>; }',
  'src/components/Navbar.tsx': 'export default function Navbar() { return null; }',
};
const partialPage = {
  ...fixtureAnalysis.pages[0],
  path: '/design-center/',
  title: 'Design Center',
  sourceFile: 'src/pages/design-center/page.tsx',
  componentName: 'Page',
};
const partialBundle = assembleReaddyPageCode(partialPage, partialSrcMap, {
  ...fixtureAnalysis,
  sharedFiles: { navbar: 'src/components/Navbar.tsx' },
});
assert.ok(
  !partialBundle.summary.includes('找不到源檔'),
  'A src/-only fetch must not be unwrapped away from the page file',
);
assert.ok(partialBundle.code.includes('Design Center'), 'Partial src map still assembles the page');
assert.ok(!partialBundle.code.includes('<p>src/pages/design-center/page.tsx</p>'), 'Missing-file skeleton is not used');

const layoutRouteMap = {
  'office/src/router/config.tsx': `
    import { lazy } from "react";
    const SiteLayout = lazy(() => import("@/components/feature/SiteLayout"));
    const Home = lazy(() => import("@/pages/home/page"));
    const SpacePlanning = lazy(() => import("@/pages/space-planning/page"));
    export default [
      {
        path: "/",
        element: <SiteLayout />,
        children: [
          { index: true, element: <Home /> },
          { path: "space-planning", element: <SpacePlanning /> },
        ],
      },
    ];
  `,
  'office/src/components/feature/SiteLayout.tsx': `
    export default function SiteLayout() { return <div><Outlet /></div>; }
  `,
  'office/src/pages/home/page.tsx': `
    export default function Home() { return <main><h1>Office Home</h1></main>; }
  `,
  'office/src/pages/space-planning/page.tsx': `
    export default function SpacePlanning() { return <main><h1>Space Planning</h1></main>; }
  `,
};
const layoutAnalysis = analyzeReaddyFileMap(layoutRouteMap, {
  sourceType: 'upload',
  projectName: 'office',
});
const layoutHome = layoutAnalysis.pages.find((page) => page.path === '/');
assert.ok(layoutHome, 'Index child is the home page');
assert.equal(layoutHome.sourceFile, 'src/pages/home/page.tsx', 'Home path uses the index page, not the layout shell');
assert.equal(layoutHome.wrapperComponent, 'SiteLayout');
const layoutSpace = layoutAnalysis.pages.find((page) => page.path === '/space-planning/');
assert.equal(layoutSpace?.sourceFile, 'src/pages/space-planning/page.tsx');

const sharedChildRoutes = {
  'office/src/router/config.tsx': `
    import { lazy } from "react";
    import SiteLayout from "@/components/feature/SiteLayout";
    const Home = lazy(() => import("@/pages/home/page"));
    const DesignCenter = lazy(() => import("@/pages/design-center/page"));
    const pageRoutes = [
      { index: true, element: <Home /> },
      { path: "design-center", element: <DesignCenter /> },
    ];
    const routes = [
      { path: "/", element: <SiteLayout />, children: pageRoutes },
      { path: "/en", element: <SiteLayout />, children: pageRoutes },
    ];
    export default routes;
  `,
  'office/src/components/feature/SiteLayout.tsx': 'export default function SiteLayout() { return <Outlet />; }',
  'office/src/pages/home/page.tsx': 'export default function Home() { return <h1>Office Home</h1>; }',
  'office/src/pages/design-center/page.tsx': 'export default function DesignCenter() { return <h1>Design Center</h1>; }',
};
const sharedChildAnalysis = analyzeReaddyFileMap(sharedChildRoutes, {
  sourceType: 'upload',
  projectName: 'shared-routes',
});
assert.equal(
  sharedChildAnalysis.pages.find((page) => page.path === '/')?.sourceFile,
  'src/pages/home/page.tsx',
);
assert.equal(
  sharedChildAnalysis.pages.find((page) => page.path === '/en/')?.sourceFile,
  'src/pages/home/page.tsx',
);
assert.equal(
  sharedChildAnalysis.pages.find((page) => page.path === '/design-center/')?.sourceFile,
  'src/pages/design-center/page.tsx',
);

const dynamicIdRoutes = {
  'studio/src/router/config.tsx': `
    import { lazy } from "react";
    const DesignCenter = lazy(() => import("@/pages/design-center/page"));
    const DesignDetail = lazy(() => import("@/pages/design-center/detail/page"));
    const SpacePlanning = lazy(() => import("@/pages/space-planning/page"));
    const SpaceDetail = lazy(() => import("@/pages/space-planning/detail/page"));
    const Missing = lazy(() => import("@/pages/missing/page"));
    export default [
      { path: "/design-center", element: <DesignCenter /> },
      { path: "/design-center/:slug", element: <DesignDetail /> },
      { path: "/space-planning", element: <SpacePlanning /> },
      { path: "/space-planning/:slug", element: <SpaceDetail /> },
      { path: "/missing/:id", element: <Missing /> },
    ];
  `,
  'studio/src/pages/design-center/page.tsx': `
    import { DESIGN_PROJECTS } from '@/mocks/designProjects';
    export default function DesignCenter() {
      return DESIGN_PROJECTS.map((item) => <Link key={item.slug} to={\`/design-center/\${item.slug}\`}>{item.title}</Link>);
    }
  `,
  'studio/src/pages/design-center/detail/page.tsx': `
    import { useParams } from 'react-router-dom';
    import { DESIGN_PROJECTS } from '@/mocks/designProjects';
    export default function DesignDetail() {
      const { slug } = useParams();
      const item = DESIGN_PROJECTS.find((project) => project.slug === slug);
      return <h1>{item?.title}</h1>;
    }
  `,
  'studio/src/mocks/designProjects.ts': `
    export const DESIGN_PROJECTS = [
      { slug: 'modern-loft', title: '現代閣樓' },
      { slug: 'minimal-kitchen', title: '極簡廚房' },
    ];
  `,
  'studio/src/pages/space-planning/page.tsx': `
    export default function SpacePlanning() {
      return (
        <div>
          <Link to="/space-planning/reception">接待處</Link>
          <Link to="/space-planning/boss-room/">老闆房</Link>
        </div>
      );
    }
  `,
  'studio/src/pages/space-planning/detail/page.tsx': `
    export default function SpaceDetail() { return <h1>Space</h1>; }
  `,
  'studio/src/pages/missing/page.tsx': `
    export default function Missing() { return <h1>Missing</h1>; }
  `,
};
const dynamicAnalysis = analyzeReaddyFileMap(dynamicIdRoutes, {
  sourceType: 'upload',
  projectName: 'dynamic-ids',
});
assert.equal(
  dynamicAnalysis.pages.some((page) => page.path.includes(':slug')),
  false,
  'Known ids replace the :slug template',
);
assert.equal(
  dynamicAnalysis.pages.find((page) => page.path === '/design-center/modern-loft/')?.title,
  '現代閣樓',
);
assert.equal(
  dynamicAnalysis.pages.find((page) => page.path === '/design-center/minimal-kitchen/')?.title,
  '極簡廚房',
);
assert.equal(
  dynamicAnalysis.pages.find((page) => page.path === '/design-center/modern-loft/')?.sourceFile,
  'src/pages/design-center/detail/page.tsx',
);
assert.equal(
  dynamicAnalysis.pages.find((page) => page.path === '/space-planning/reception/')?.title,
  '接待處',
);
assert.ok(
  dynamicAnalysis.pages.some((page) => page.path === '/space-planning/boss-room/'),
  'Literal detail links become their own pages',
);
const missingTemplate = dynamicAnalysis.pages.find((page) => page.path === '/missing/:id/');
assert.equal(missingTemplate?.migrationStatus, 'skipped');
assert.match(missingTemplate?.lastError || '', /實際 id/);

// 3. Real uploaded Readdy ZIP verification (if present on local machine)
const realZipPath =
  'C:/Users/Administrator/.gemini/antigravity/brain/ba096ec1-00e5-4679-8270-b05d3ad4cee8/.user_uploaded/media_1795573074036_f2189662.zip';

if (existsSync(realZipPath)) {
  const buf = readFileSync(realZipPath);
  const zip = await JSZip.loadAsync(buf);
  const rawMap: Record<string, string> = {};
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const p = entry.name.replace(/^\/+/, '');
    if (/\.(tsx|ts|jsx|js|css|html|json)$/i.test(p) && !p.endsWith('.d.ts')) {
      rawMap[p] = await entry.async('string');
    }
  }
  const fileMap = normalizeProjectFileMap(rawMap);
  const realAnalysis = analyzeReaddyFileMap(fileMap, {
    sourceType: 'upload',
    projectName: 'project-16106125',
  });

  console.log('Real ZIP projectName:', realAnalysis.projectName);
  console.log('Real ZIP pages count:', realAnalysis.pages.length);
  console.log('Real ZIP localeCounts:', realAnalysis.localeCounts);
  console.log('Real ZIP kindCounts:', realAnalysis.kindCounts);
  console.log('Real ZIP cssTokens:', {
    bg: realAnalysis.cssTokens.backgroundHex,
    primary: realAnalysis.cssTokens.primaryHex,
    text: realAnalysis.cssTokens.textHex,
    fontHeading: realAnalysis.cssTokens.fontHeading,
  });

  assert.equal(realAnalysis.pages.length, 217, 'Should discover all 217 non-404 routes from router/config.tsx');
  assert.equal(realAnalysis.localeCounts.zh, 75);
  assert.equal(realAnalysis.localeCounts.en, 67);
  assert.equal(realAnalysis.localeCounts.cn, 75);

  const homePage = realAnalysis.pages.find((p) => p.path === '/');
  assert.ok(homePage, 'Home route / discovered');
  assert.equal(homePage.title, 'BW Event Music', 'Home title parsed from pageSeoData');
  const homeBundle = assembleReaddyPageCode(homePage, fileMap, realAnalysis);
  assert.ok(homeBundle.includedFiles.length >= 10, `Expected >=10 assembled files for /, got ${homeBundle.includedFiles.length}`);
  assert.ok(homeBundle.code.includes('/* === COMPONENT: HeroSection'), 'Home includes HeroSection');
  assert.ok(homeBundle.code.includes('readdy.ai/api/search-image'), 'Home retains Readdy image URLs');
  const homeImgUrls = homeBundle.code.match(/https:\/\/readdy\.ai\/api\/search-image[^'"\s]+/g) || [];
  assert.equal(homeImgUrls.length, 12, `Expected all 12 Home images (1 Hero + 6 Services + 1 Approach + 4 Gallery), got ${homeImgUrls.length}`);
  assert.ok(homeBundle.code.includes('bg-transparent'), 'Home Navbar uses transparent background over Hero');
  assert.ok(homeBundle.code.includes('<!-- footer-groups -->'), 'Footer keeps its link groups');
  assert.ok(homeBundle.code.includes('<h3>服務分類</h3>'), 'Footer keeps the service column');
  assert.ok(homeBundle.code.includes('<a href="/sound-engineering/">音響工程</a>'), 'Footer keeps every service link');
  assert.ok(homeBundle.code.includes('href="tel:+85221857377"'), 'Footer keeps the phone link');
  assert.ok(
    homeBundle.code.includes('href="https://www.emailmeform.com/builder/form/69aam00sCW063"'),
    'Footer quote button keeps the form URL',
  );
  assert.ok(homeBundle.code.includes('服務一覽') && homeBundle.code.includes('音樂資訊'), 'Navbar includes top-level links');
  assert.ok(!homeBundle.code.includes('<a href="#">樂手名單</a>'), 'Navbar does not leak nested submenu items');
  assert.ok(homeBundle.code.includes('網上報價') && homeBundle.code.includes('聯絡我們'), 'Navbar includes dual CTAs');
  assert.ok(
    homeBundle.code.includes('const FAQ_ITEMS = [') &&
      homeBundle.code.includes('可以只聘請歌手或樂隊嗎？') &&
      homeBundle.code.includes('報價前需要準備甚麼資料？'),
    'Real ZIP home bundle inlines all 6 FAQ_ITEMS into FaqSection',
  );

  const servicesPage = realAnalysis.pages.find((p) => p.path === '/services/');
  assert.ok(servicesPage, 'Services page discovered');
  assert.equal(servicesPage.title, '服務一覽', 'Services page uses concise SEO name');

  const musiciansPage = realAnalysis.pages.find((p) => p.path === '/services/musicians/');
  assert.ok(musiciansPage, 'Musicians page discovered');
  assert.equal(musiciansPage.title, '樂手名單', 'Nested parent object in pageSeoData no longer breaks name lookup');

  const annualDinner = realAnalysis.pages.find((p) => p.path === '/annual-dinner/');
  assert.ok(annualDinner, 'Annual dinner page discovered');
  assert.equal(annualDinner.pageKind, 'layout-page');
  const annualBundle = assembleReaddyPageCode(annualDinner, fileMap, realAnalysis);
  assert.ok(annualBundle.code.includes('/* === COMPONENT: PageLayout Hero === */'), 'PageLayout Hero synthesized');
  assert.ok(annualBundle.code.includes('活動可包括的元素'), 'Layout page keeps its own sections');
  assert.ok(annualBundle.code.includes('嘉賓迎賓音樂'), 'Layout page expands repeated items');
  assert.ok(
    annualBundle.code.includes('to="/annual-dinner/corporate-dinner/"'),
    'Layout page keeps links that were rendered from data',
  );
  assert.ok(
    annualBundle.code.includes('https://www.emailmeform.com/builder/form/69aam00sCW063'),
    'Online quote CTA keeps the real form URL',
  );

  const articlePage = realAnalysis.pages.find((p) => p.path === '/music-insights/wedding-band-vs-dj-guide/');
  assert.ok(articlePage, 'Article route discovered');
  assert.equal(articlePage.pageKind, 'article');
  assert.equal(articlePage.articleSlug, 'wedding-band-vs-dj-guide');
  assert.ok(articlePage.title.includes('婚禮樂隊'), `Expected Chinese article title, got ${articlePage.title}`);
  const articleBundle = assembleReaddyPageCode(articlePage, fileMap, realAnalysis);
  assert.ok(articleBundle.code.includes('現場樂隊的優勢'), 'Article bundle resolved sections from zh-01.ts');
  assert.ok(articleBundle.code.includes('/* === COMPONENT: FAQ === */'), 'Article bundle resolved FAQ');

  const cnPage = realAnalysis.pages.find((p) => p.path === '/cn/services/');
  assert.ok(cnPage, 'CN locale mirror route discovered');
  assert.equal(cnPage.locale, 'cn');
  assert.equal(cnPage.pageKind, 'locale-mirror');
} else {
  console.log('Real ZIP not found on disk; skipped real-zip assertions.');
}

console.log('ALL READDY PROJECT ANALYZER TESTS PASSED');
