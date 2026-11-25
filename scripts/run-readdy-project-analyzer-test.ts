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
    import Hero from './sections/Hero';
    import FaqSection from './sections/FaqSection';
    export default function Home() { return <main><Hero /><FaqSection /></main>; }
  `,
  'demo/src/pages/home/sections/Hero.tsx': `
    export default function Hero() { return <section><h1>Demo Hero</h1></section>; }
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
    export default function About() {
      return <PageLayout title="關於我們" subtitle="簡介"><h2>故事</h2></PageLayout>;
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
