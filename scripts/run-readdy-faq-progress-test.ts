import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {
  applyBackgroundConversionOverlay,
  buildServerRunPageStates,
  createInitialBackgroundPageStates,
  isRemoteJobNewerThanLocal,
  loadSavedPageProgress,
  normalizeFramerProjectKey,
  patchSavedPageProgress,
  savePageProgress,
  selectPagesForOneClickConversion,
} from '../src/lib/readdyFramerProgress.ts';
import { matchSceneToSection, resolveGridColumns, type SceneNode } from '../src/lib/readdySceneGraph.ts';
import type { ReaddyDiscoveredPage } from '../src/types/readdyFramer.ts';

// 1. Progress scoping tests with mocked localStorage
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return store.size;
  },
  clear() {
    store.clear();
  },
  getItem(key: string) {
    return store.get(key) ?? null;
  },
  key(index: number) {
    return Array.from(store.keys())[index] ?? null;
  },
  removeItem(key: string) {
    store.delete(key);
  },
  setItem(key: string, value: string) {
    store.set(key, String(value));
  },
};

assert.equal(normalizeFramerProjectKey(''), 'unassigned');
assert.equal(normalizeFramerProjectKey('https://framer.com/projects/Readdy-Landing-Sync--9xK2mP'), '9xk2mp');
assert.equal(normalizeFramerProjectKey('https://framer.com/projects/1By2EVSupvfaOWy965Q9'), '1by2evsupvfaowy965q9');

const projectA = 'https://framer.com/projects/Readdy-Landing-Sync--9xK2mP';
const projectB = 'https://framer.com/projects/1By2EVSupvfaOWy965Q9';
const pageHome: ReaddyDiscoveredPage = {
  id: '/',
  path: '/',
  title: 'BW Event Music',
  locale: 'zh',
  pageKind: 'home',
  componentName: 'Home',
  sourceFile: 'src/pages/home/page.tsx',
  migrationStatus: 'failed',
  jobId: 'old-job-id',
};

savePageProgress('gh:org/repo:main', [pageHome], projectA);
assert.equal(
  loadSavedPageProgress('gh:org/repo:main', projectA)['/']?.migrationStatus,
  'failed',
  'Project A retains its failed status',
);
assert.deepEqual(
  loadSavedPageProgress('gh:org/repo:main', projectB),
  {},
  'Project B starts clean and does not inherit stale failed status from Project A',
);

patchSavedPageProgress('gh:org/repo:main', '/', { migrationStatus: 'migrated', jobId: 'new-job' }, projectB);
assert.equal(loadSavedPageProgress('gh:org/repo:main', projectB)['/']?.migrationStatus, 'migrated');
assert.equal(loadSavedPageProgress('gh:org/repo:main', projectA)['/']?.migrationStatus, 'failed');

const oneClickTargets = selectPagesForOneClickConversion([
  { ...pageHome, id: '/', path: '/', migrationStatus: 'migrated' },
  { ...pageHome, id: '/services', path: '/services', migrationStatus: 'parsed' },
  { ...pageHome, id: '/about', path: '/about', migrationStatus: 'pending' },
  { ...pageHome, id: '/faq', path: '/faq', migrationStatus: 'failed' },
  { ...pageHome, id: '/404', path: '/404', migrationStatus: 'skipped' },
]);
assert.deepEqual(
  oneClickTargets.map((p) => p.id),
  ['/', '/services', '/about', '/faq'],
  'One-click conversion includes already-migrated, parsed, pending, and failed pages while excluding skipped pages',
);

// 1b. Background conversion overlay, server poll snapshot, timestamp guard & transient syncing guard
const overlayInputPages: ReaddyDiscoveredPage[] = [
  { ...pageHome, id: '/', path: '/', migrationStatus: 'migrated', jobId: 'job-prev-1', sectionCount: 5 },
  { ...pageHome, id: '/services', path: '/services', migrationStatus: 'migrated', jobId: 'job-prev-2', sectionCount: 3 },
  { ...pageHome, id: '/about', path: '/about', migrationStatus: 'pending', jobId: null },
  { ...pageHome, id: '/404', path: '/404', migrationStatus: 'skipped', jobId: null },
];
const initialBgStates = createInitialBackgroundPageStates(
  overlayInputPages.filter((p) => p.migrationStatus !== 'skipped'),
);
assert.deepEqual(initialBgStates, {
  '/': { migrationStatus: 'pending' },
  '/services': { migrationStatus: 'pending' },
  '/about': { migrationStatus: 'pending' },
});

const overlaidActive = applyBackgroundConversionOverlay(overlayInputPages, {
  active: true,
  pageStates: {
    ...initialBgStates,
    '/': { migrationStatus: 'syncing' },
  },
});
assert.equal(overlaidActive[0].migrationStatus, 'syncing', 'Active page is marked syncing');
assert.equal(overlaidActive[0].jobId, 'job-prev-1', 'Existing jobId metadata is preserved while syncing');
assert.equal(overlaidActive[1].migrationStatus, 'pending', 'Previously migrated queued page resets to pending while active');
assert.equal(overlaidActive[1].jobId, 'job-prev-2', 'Existing jobId metadata is preserved while queued');
assert.equal(overlaidActive[3].migrationStatus, 'skipped', 'Skipped pages remain skipped');

assert.equal(
  applyBackgroundConversionOverlay(overlayInputPages, { active: false, pageStates: initialBgStates }),
  overlayInputPages,
  'Inactive overlay returns the original pages array reference untouched',
);

const runPages = [
  { id: '/', path: '/' },
  { id: '/services', path: '/services' },
  { id: '/about', path: '/about' },
];
const queuedSnap = buildServerRunPageStates({
  pages: runPages,
  runStatus: 'queued',
  pageIndex: 0,
  progressPages: [],
});
assert.equal(queuedSnap.done, 0);
assert.equal(queuedSnap.pageStates['/'].migrationStatus, 'pending', 'Queued run keeps pages pending before worker starts');

const runningIndex0Snap = buildServerRunPageStates({
  pages: runPages,
  runStatus: 'running',
  pageIndex: 0,
  progressPages: [],
});
assert.equal(runningIndex0Snap.pageStates['/'].migrationStatus, 'syncing', 'Running with page_index 0 marks page 0 syncing even without currentPageId');
assert.equal(runningIndex0Snap.pageStates['/services'].migrationStatus, 'pending');

const runningExplicitSnap = buildServerRunPageStates({
  pages: runPages,
  runStatus: 'running',
  pageIndex: 0,
  currentPageId: '/services',
  progressPages: [
    { pageId: '/', path: '/', status: 'migrated', jobId: 'job-1', sectionCount: 4 },
  ],
});
assert.equal(runningExplicitSnap.pageStates['/'].migrationStatus, 'migrated');
assert.equal(runningExplicitSnap.pageStates['/services'].migrationStatus, 'syncing');
assert.equal(runningExplicitSnap.done, 1);

const staleCurrentPageSnap = buildServerRunPageStates({
  pages: runPages,
  runStatus: 'running',
  pageIndex: 1,
  currentPageId: '/',
  progressPages: [
    { pageId: '/', path: '/', status: 'migrated', jobId: 'job-1', sectionCount: 4 },
  ],
});
assert.equal(
  staleCurrentPageSnap.pageStates['/services'].migrationStatus,
  'syncing',
  'Falls back to pages[pageIndex] as syncing when currentPageId still points to a just-migrated page',
);

const multiFinishSnap = buildServerRunPageStates({
  pages: runPages,
  runStatus: 'running',
  pageIndex: 2,
  progressPages: [
    { pageId: '/', path: '/', status: 'migrated', jobId: 'job-1', sectionCount: 4 },
    { path: '/services', status: 'failed', sectionCount: 0 },
  ],
});
assert.equal(multiFinishSnap.done, 2);
assert.equal(multiFinishSnap.finishedEntries.length, 2);
assert.equal(multiFinishSnap.pageStates['/'].migrationStatus, 'migrated');
assert.equal(multiFinishSnap.pageStates['/services'].migrationStatus, 'failed');
assert.equal(multiFinishSnap.pageStates['/about'].migrationStatus, 'syncing');

const cancelledSnap = buildServerRunPageStates({
  pages: runPages,
  runStatus: 'cancelled',
  pageIndex: 1,
  currentPageId: '/services',
  progressPages: [
    { pageId: '/', path: '/', status: 'migrated', jobId: 'job-1', sectionCount: 4 },
  ],
});
assert.equal(cancelledSnap.pageStates['/services'].migrationStatus, 'pending', 'Cancelled run clears syncing back to pending');

const successSnap = buildServerRunPageStates({
  pages: runPages,
  runStatus: 'success',
  pageIndex: 3,
  currentPageId: '/about',
  progressPages: [
    { pageId: '/', path: '/', status: 'migrated', jobId: 'job-1', sectionCount: 4 },
    { pageId: '/services', path: '/services', status: 'migrated', jobId: 'job-2', sectionCount: 3 },
    { pageId: '/about', path: '/about', status: 'migrated', jobId: 'job-3', sectionCount: 2 },
  ],
});
assert.equal(successSnap.done, 3);
assert.equal(successSnap.pageStates['/about'].migrationStatus, 'migrated');

// Timestamp guard for hydration
assert.equal(
  isRemoteJobNewerThanLocal(
    { migrationStatus: 'failed', updatedAt: '2026-11-27T10:00:00.000Z' },
    '2026-11-27T09:00:00.000Z',
  ),
  false,
  'Older completed remote job does not overwrite newer local failed status',
);
assert.equal(
  isRemoteJobNewerThanLocal(
    { migrationStatus: 'failed', updatedAt: '2026-11-27T10:00:00.000Z' },
    '2026-11-27T11:00:00.000Z',
  ),
  true,
  'Newer completed remote job promotes local failed status',
);
assert.equal(
  isRemoteJobNewerThanLocal({ migrationStatus: 'failed' }, '2026-11-27T09:00:00.000Z'),
  true,
  'Legacy local entry without timestamps preserves promotion behavior',
);

// savePageProgress must never persist transient syncing
savePageProgress(
  'gh:org/repo:sync-guard',
  [{ ...pageHome, id: '/', path: '/', migrationStatus: 'migrated', jobId: 'job-durable' }],
  projectA,
);
savePageProgress(
  'gh:org/repo:sync-guard',
  [{ ...pageHome, id: '/', path: '/', migrationStatus: 'syncing', jobId: 'job-durable' }],
  projectA,
);
assert.equal(
  loadSavedPageProgress('gh:org/repo:sync-guard', projectA)['/']?.migrationStatus,
  'migrated',
  'savePageProgress keeps prior durable status instead of writing transient syncing',
);

// 2. Load pure parser helpers directly from supabase/functions/readdy-parse-ir/index.ts
const parseIrTs = readFileSync(new URL('../supabase/functions/readdy-parse-ir/index.ts', import.meta.url), 'utf8');
const serveIdx = parseIrTs.indexOf('Deno.serve(');
assert.ok(serveIdx > 0, 'Found Deno.serve in readdy-parse-ir/index.ts');

const pureTs = parseIrTs
  .slice(0, serveIdx)
  .replace(/import\s+"jsr:[^"]+";\s*/g, '')
  .replace(/import\s+\{[\s\S]*?\}\s+from\s+"\.\.\/_shared\/framer-mcp\.ts";\s*/g, '');

const compiled = ts.transpileModule(
  `${pureTs}\nmodule.exports = { extractJsxElementTexts, detectSectionKind, detectInteractivePlaceholders, filterInteractivePlaceholders, deterministicParseCode, normalizeIrPayload, isFaqHint };`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
);

const mod = { exports: {} as Record<string, unknown> };
const req = createRequire(import.meta.url);
const wrapped = `(function(module, exports, require, console) {\n${compiled.outputText}\n})`;
const fn = vm.runInThisContext(wrapped) as (
  m: typeof mod,
  e: typeof mod.exports,
  r: typeof req,
  c: typeof console,
) => void;
fn(mod, mod.exports, req, console);

const {
  extractJsxElementTexts,
  detectSectionKind,
  detectInteractivePlaceholders,
  filterInteractivePlaceholders,
  deterministicParseCode,
  normalizeIrPayload,
} = mod.exports as {
  extractJsxElementTexts: (code: string, tagNames: string[]) => string[];
  detectSectionKind: (hint: string, tag: string) => string;
  detectInteractivePlaceholders: (chunk: string, hint?: string) => string[];
  filterInteractivePlaceholders: (list: string[], sectionName: string, chunkHasForm: boolean) => string[];
  deterministicParseCode: (
    rawCode: string,
    grid: { desktop_width: number; container_max_width: number; columns: number; gutter: number },
    assetUrlMap: Record<string, string>,
  ) => {
    sections: Array<{
      id: string;
      step: number;
      name: string;
      sectionKind: string;
      framerType: string;
      columns: number;
      elements: {
        heading?: string;
        subheading?: string;
        paragraphs?: string[];
        backgroundImage?: string;
        buttons?: Array<{ label: string; href?: string }>;
        cards?: Array<{ title: string; description: string; imageUrl?: string }>;
      };
      interactivePlaceholders: string[];
    }>;
  };
  normalizeIrPayload: (
    candidate: unknown,
    fallback: unknown,
    grid: { desktop_width: number; container_max_width: number; columns: number; gutter: number },
    assetUrlMap: Record<string, string>,
    cssTokens?: unknown,
    isAssembledMultiComponent?: boolean,
  ) => ReturnType<typeof deterministicParseCode>;
};

// 2a. JSX arrow handler in <button onClick={() => ...}> must not leak into button text
const faqSnippet = `
const FAQ_ITEMS = [
  { question: '可以只聘請歌手或樂隊嗎？', answer: '可以。你可以單獨安排歌手、樂手或樂隊。' },
  { question: '場地沒有音響設備怎麼辦？', answer: '可以。我們會按場地大小建議音響方案。' },
  { question: '需要提早多久預約？', answer: '熱門日期一般需要較早確認。' },
  { question: '可否按主題或指定歌曲安排？', answer: '可以。請在查詢時說明活動主題。' },
  { question: '音響工程與現場音樂可以分開安排嗎？', answer: '可以。我們都可以按你的需要靈活組合。' },
  { question: '報價前需要準備甚麼資料？', answer: '一般只需提供活動日期、場地、性質。' },
];
export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <section>
      <h2>常見問題</h2>
      <p>關於活動統籌與現場音樂安排的常見疑問</p>
      {FAQ_ITEMS.map((faq, index) => (
        <div key={index}>
          <button
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            className="w-full flex items-center justify-between gap-4 p-4 md:p-5 text-left"
          >
            <span>{faq.question}</span>
          </button>
          <p>{faq.answer}</p>
        </div>
      ))}
    </section>
  );
}
`;
assert.deepEqual(extractJsxElementTexts(faqSnippet, ['button']), [], 'Dynamic arrow onClick button leaks no raw JSX');
assert.deepEqual(
  extractJsxElementTexts('<button onClick={() => go()}>立即報價</button>', ['button']),
  ['立即報價'],
  'Static button with arrow onClick extracts clean label',
);

// 2b. Section kind at idx === total - 2 (right before Footer) must be content, not cta
assert.equal(detectSectionKind('FaqSection', 'section'), 'content');

// 2c. Real form vs stateful FAQ
assert.deepEqual(detectInteractivePlaceholders(faqSnippet, 'FaqSection'), []);
assert.deepEqual(
  detectInteractivePlaceholders('<section><form onSubmit={handleSubmit}><input /></form></section>', 'ContactForm'),
  ['表單互動（已保留版面結構，送出邏輯需於 Framer 綁定）'],
);

// 2d. Full deterministic + normalize check with 4+ sections where FAQ is at total - 2
const assembledSample = [
  '/* === COMPONENT: Navbar === */\n<header><nav><a href="#">主頁</a></nav><button>網上報價</button></header>',
  '/* === COMPONENT: HeroSection === */\n<section><h1>讓現場音樂成為亮點</h1><p>介紹</p></section>',
  `/* === COMPONENT: FaqSection (src/pages/home/sections/FaqSection.tsx) === */\n${faqSnippet}`,
  '/* === COMPONENT: Footer === */\n<footer><span>BW Event Music</span><p>© 2026</p></footer>',
].join('\n\n');

const grid = { desktop_width: 1440, container_max_width: 1200, columns: 12, gutter: 24 };
const parsed = deterministicParseCode(assembledSample, grid, {});
const faqSec = parsed.sections.find((s) => s.name === 'FaqSection');
assert.ok(faqSec, 'FaqSection parsed');
assert.equal(faqSec.sectionKind, 'content');
assert.equal(faqSec.framerType, 'Stack');
assert.equal(faqSec.columns, 1);
assert.equal(faqSec.elements.heading, '常見問題');
assert.equal(faqSec.elements.subheading, '關於活動統籌與現場音樂安排的常見疑問');
assert.equal(faqSec.elements.buttons, undefined, 'No bogus JSX button extracted on FaqSection');
assert.equal(faqSec.elements.cards?.length, 6, 'All 6 FAQ items extracted into cards');
assert.equal(faqSec.elements.cards?.[0]?.title, '可以只聘請歌手或樂隊嗎？');
assert.deepEqual(faqSec.interactivePlaceholders, []);

const normalized = normalizeIrPayload(
  {
    sections: [
      { sectionKind: 'navbar', name: 'Top Navigation', interactivePlaceholders: [] },
      { sectionKind: 'hero', name: 'Hero Section', interactivePlaceholders: [] },
      {
        sectionKind: 'cta',
        name: 'FAQ Section',
        interactivePlaceholders: [
          'Form / Stateful Interaction → Framer Component Variant',
          'Accordion FAQ with open/close state',
        ],
      },
      { sectionKind: 'footer', name: 'Footer', interactivePlaceholders: [] },
    ],
  },
  parsed,
  grid,
  {},
  undefined,
  true,
);
const normFaq = normalized.sections[2];
assert.equal(normFaq.sectionKind, 'content');
assert.equal(normFaq.elements.cards?.length, 6);
assert.deepEqual(
  normFaq.interactivePlaceholders,
  [],
  'normalizeIrPayload strips false-positive Form / Accordion placeholders on FAQ',
);
assert.deepEqual(
  filterInteractivePlaceholders(['Form / Stateful Interaction → Framer Component Variant'], 'Contact', false),
  [],
);

const officePage = [
  '/* === COMPONENT: Navbar === */\n<header><nav><a href="/">主頁</a></nav></header>',
  `/* === COMPONENT: DesignCenter Body (src/pages/design-center/page.tsx) === */
<section>
  <h1>Design Center</h1>
  <p>KEYWORDS</p>
  <p>OFFICE DESIGN/SPACE PLANNING</p>
  <PageBanner />
</section>`,
  `/* === COMPONENT: Page Banner === */
<section className="relative min-h-[640px]">
  <img src="https://cdn.example/hero.jpg" className="absolute inset-0 w-full h-full object-cover" />
  <div className="absolute inset-0 bg-gradient-to-b from-black/50"></div>
  <h1>HK Office Design</h1>
  <a href="/quote">免費報價</a>
</section>`,
  `/* === COMPONENT: Page Banner === */
<section className="bg-white py-16">
  <h2>頁面說明</h2>
  <p>這一段沒有全幅圖片。</p>
</section>`,
  `/* === COMPONENT: Latest Office === */
<section className="grid grid-cols-4">
  <img src="https://cdn.example/a.jpg" alt="" />
  <img src="https://cdn.example/b.jpg" alt="" />
  <img src="https://cdn.example/c.jpg" alt="" />
  <img src="https://cdn.example/d.jpg" alt="" />
</section>`,
].join('\n\n');

const office = deterministicParseCode(officePage, grid, {});
const officeBody = office.sections.find((s) => s.name.includes('DesignCenter Body'));
const officeHero = office.sections.find((s) => s.elements.heading === 'HK Office Design');
const officeNote = office.sections.find((s) => s.elements.heading === '頁面說明');
const officeGallery = office.sections.find((s) => s.name === 'Latest Office');
assert.ok(officeBody, 'page shell is still a section');
assert.equal(officeBody.sectionKind, 'content', 'keyword shell is not turned into a hero just because it is the first block');
assert.equal(officeBody.elements.buttons, undefined, 'no invented Learn More button');
assert.ok(
  !(officeBody.elements.paragraphs || []).some((line) => /KEYWORDS|OFFICE DESIGN/i.test(line)) &&
    !/KEYWORDS|OFFICE DESIGN/i.test(officeBody.elements.subheading || ''),
  'SEO keyword lines are not rendered as copy',
);
assert.equal(officeHero?.sectionKind, 'hero');
assert.equal(officeHero?.elements.backgroundImage, 'https://cdn.example/hero.jpg');
assert.equal(officeHero?.elements.buttons?.[0]?.label, '免費報價');
assert.equal(officeHero?.elements.buttons?.[0]?.href, '/quote');
assert.equal(officeNote?.sectionKind, 'content', 'a block named Page Banner without a full-bleed image stays content');
assert.equal(officeGallery?.sectionKind, 'features');
assert.equal(officeGallery?.elements.cards?.length, 4);
assert.equal(officeGallery?.elements.cards?.[0]?.imageUrl, 'https://cdn.example/a.jpg');
assert.equal(officeGallery?.elements.cards?.[3]?.imageUrl, 'https://cdn.example/d.jpg');

const heroWithDuplicateCopy = `/* === COMPONENT: Navbar === */
<header><nav><a href="/">主頁</a></nav></header>

/* === COMPONENT: HeroSection === */
<section className="relative min-h-[720px]">
  <img src="https://cdn.example/band.jpg" className="absolute inset-0 object-cover" />
  <div className="absolute inset-0 bg-gradient-to-b from-black/50"></div>
  <p className="sr-only">一首剛剛好的進場歌，這段是給搜尋引擎的，不該出現在主視覺。</p>
  <p>這段在標題前面，不是主視覺文案。</p>
  <h1>讓現場音樂，成為賓客記得住的部分</h1>
  <p>婚禮、企業晚宴、VIP 接待、餐廳、商場和節日活動的現場音樂統籌。</p>
  <p>婚禮、企業晚宴、VIP 接待、餐廳、商場和節日活動的現場音樂統籌。</p>
  <a href="https://www.emailmeform.com/builder/form/69aam00sCW063">立即網上報價</a>
  <Link to="/services/">查看服務一覽</Link>
</section>`;
const heroParsed = deterministicParseCode(heroWithDuplicateCopy, grid, {});
const heroCopy = heroParsed.sections.find((s) => s.sectionKind === 'hero');
assert.equal(heroCopy?.elements.heading, '讓現場音樂，成為賓客記得住的部分');
assert.equal(
  heroCopy?.elements.subheading,
  '婚禮、企業晚宴、VIP 接待、餐廳、商場和節日活動的現場音樂統籌。',
);
assert.equal(heroCopy?.elements.paragraphs, undefined, 'a single hero paragraph is not also stored as a paragraph list');
assert.deepEqual(
  heroCopy?.elements.buttons?.map((button) => button.label),
  ['立即網上報價', '查看服務一覽'],
);
assert.equal(heroCopy?.elements.buttons?.[1]?.href, '/services/');
const heroTwice = deterministicParseCode(
  heroWithDuplicateCopy.replace(
    '/* === COMPONENT: HeroSection === */',
    '/* === COMPONENT: HeroSection === */',
  ) + '\n\n' + heroWithDuplicateCopy.slice(heroWithDuplicateCopy.indexOf('/* === COMPONENT: HeroSection === */')),
  grid,
  {},
);
assert.equal(heroTwice.sections.filter((section) => section.sectionKind === 'hero').length, 1);

const officeLayout = normalizeIrPayload(
  {
    sections: office.sections.map((section, index) => ({
      sectionKind: index === 1 ? 'hero' : section.sectionKind,
      name: `Renamed ${index}`,
      elements: { heading: '模型改寫的標題' },
    })),
  },
  office,
  grid,
  {},
  undefined,
  true,
);
assert.equal(officeLayout.sections[1].sectionKind, 'content', 'model cannot mark a block with no image as hero');
assert.equal(officeLayout.sections[1].elements.heading, 'Design Center', 'model cannot replace source copy');
assert.equal(officeLayout.sections[2].elements.heading, 'HK Office Design');

// 3. Load buildSectionOps from supabase/functions/framer-mcp-sync/index.ts and verify navbar ops
const syncTs = readFileSync(new URL('../supabase/functions/framer-mcp-sync/index.ts', import.meta.url), 'utf8');
const syncServeIdx = syncTs.indexOf('Deno.serve(');
assert.ok(syncServeIdx > 0, 'Found Deno.serve in framer-mcp-sync/index.ts');

const pureSyncTs = syncTs
  .slice(0, syncServeIdx)
  .replace(/import\s+"jsr:[^"]+";\s*/g, '')
  .replace(/import\s+\{[\s\S]*?\}\s+from\s+"\.\.\/_shared\/framer-mcp\.ts";\s*/g, '');

const compiledSync = ts.transpileModule(
  `${pureSyncTs}\nmodule.exports = { buildSectionOps, buildNodeOps };`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
);

const syncMod = { exports: {} as Record<string, unknown> };
const syncWrapped = `(function(module, exports, require, console) {\n${compiledSync.outputText}\n})`;
const syncFn = vm.runInThisContext(syncWrapped) as (
  m: typeof syncMod,
  e: typeof syncMod.exports,
  r: typeof req,
  c: typeof console,
) => void;
syncFn(syncMod, syncMod.exports, req, console);

const { buildSectionOps, buildNodeOps } = syncMod.exports as {
  buildNodeOps: (
    scene: SceneNode,
    sectionId: string,
  ) => {
    ops: Array<{
      op: string;
      parent: string;
      attrs: Record<string, unknown>;
      responsive?: { phone?: { layout?: string; width?: string } };
    }>;
    backgroundImage: string | null;
  };

  buildSectionOps: (
    section: Record<string, unknown>,
    grid: { desktop_width: number; container_max_width: number; columns: number; gutter: number },
    fontName?: string,
    bodyFontName?: string,
  ) => {
    ops: Array<{ op: string; id: string; parent: string; attrs: Record<string, unknown> }>;
    backgroundImage: string | null;
  };
};

const navLinks14 = [
  '主頁', '服務一覽', '婚禮演出', '周年晚宴', '學校培訓', '駐場歌手', 'VIP接待',
  '商場表演', '節日活動', '餐廳Live', '保險行業', '表演排舞', '音響工程', '音樂資訊',
];

const homeNavBuilt = buildSectionOps(
  {
    id: 'sec-1',
    step: 1,
    name: 'Top Navigation',
    sectionKind: 'navbar',
    framerType: 'Stack',
    direction: 'horizontal',
    gridSpan: '12 Cols · 1200px Container',
    columns: 1,
    gap: 24,
    padding: '20px 32px',
    background: 'transparent',
    textColor: '#F9F4EE',
    accentColor: '#B37900',
    elements: {
      heading: 'BW Event Music',
      navLinks: navLinks14,
      buttons: [
        { label: '網上報價', variant: 'primary' },
        { label: '聯絡我們', variant: 'secondary' },
      ],
    },
  },
  grid,
  'Noto Serif HK',
  'Noto Sans HK',
);

const rootOp = homeNavBuilt.ops[0];
const innerOp = homeNavBuilt.ops[1];
const headingOp = homeNavBuilt.ops.find((o) => o.op === 'text' && o.attrs.name === 'Heading');
const navRowOp = homeNavBuilt.ops.find((o) => o.op === 'frame' && o.attrs.name === 'NavLinks');
const navLinkOp = homeNavBuilt.ops.find((o) => o.op === 'text' && o.parent === navRowOp?.id);
const buttonFrameOps = homeNavBuilt.ops.filter((o) => o.op === 'frame' && o.attrs.name === 'Button');
const secondaryBtnTextOp = homeNavBuilt.ops.find(
  (o) => o.op === 'text' && o.parent === buttonFrameOps[1]?.id,
);

assert.equal(rootOp.attrs.fill, '#1A1A1A', 'Transparent home navbar falls back to a neutral dark fill when no surface token is set');
assert.equal(rootOp.attrs.overflow, 'visible', 'Navbar does not clip the trailing contact button');
assert.equal(innerOp.attrs.stackAlignment, 'center', 'Navbar container vertically centers children');
assert.equal(innerOp.attrs.gap, '8px', 'Dense navbar keeps brand, links, and buttons on one row');
assert.equal(innerOp.attrs.maxWidth, '1392px', 'Navbar container widens to 1392px on 1440px desktop');
assert.equal(headingOp?.attrs.width, 'auto', 'Navbar brand Heading uses hug width (not 1fr)');
assert.equal(navRowOp?.attrs.gap, '8px', 'Dense 14-link navbar uses compact 8px gap');
assert.equal(navLinkOp?.attrs.width, 'auto', 'Navbar links hug their text instead of filling leftover width');
assert.equal(navLinkOp?.attrs.fontSize, '12px', 'Dense 14-link navbar uses 12px font size');
assert.equal(buttonFrameOps.length, 2);
assert.ok(
  typeof buttonFrameOps[1]?.attrs.fill === 'string' && buttonFrameOps[1].attrs.fill.startsWith('rgba('),
  'Secondary navbar button has visible subtle fill',
);
assert.equal(secondaryBtnTextOp?.attrs.fontSize, '12px');

const subpageNavBuilt = buildSectionOps(
  {
    id: 'sec-1',
    step: 1,
    name: 'Top Navigation',
    sectionKind: 'navbar',
    framerType: 'Stack',
    direction: 'horizontal',
    gridSpan: '12 Cols · 1200px Container',
    columns: 1,
    gap: 24,
    padding: '20px 32px',
    background: '#F9F4EE',
    textColor: '#1F0000',
    accentColor: '#B37900',
    elements: {
      heading: 'BW Event Music',
      navLinks: navLinks14,
      buttons: [
        { label: '網上報價', variant: 'primary' },
        { label: '聯絡我們', variant: 'secondary' },
      ],
    },
  },
  grid,
);
assert.equal(subpageNavBuilt.ops[0].attrs.fill, '#F9F4EE', 'Solid cream subpage navbar keeps #F9F4EE fill');
assert.equal(
  subpageNavBuilt.ops.find((o) => o.op === 'text' && o.attrs.name === 'Heading')?.attrs.textColor,
  '#1F0000',
  'Solid cream subpage navbar keeps #1F0000 textColor',
);

const homeNavLinks = homeNavBuilt.ops.find((o) => o.op === 'frame' && o.attrs.name === 'NavLinks') as {
  responsive?: { tablet?: { visible?: boolean }; phone?: { visible?: boolean } };
};
assert.equal(homeNavBuilt.ops[0].attrs.position, 'fixed', 'Home navbar is fixed over the hero');
assert.equal(homeNavLinks.responsive?.tablet?.visible, false, 'Tablet hides the desktop link row');
assert.equal(homeNavLinks.responsive?.phone?.visible, false, 'Phone hides the desktop link row');

const heroBuilt = buildSectionOps(
  {
    id: 'hero',
    step: 2,
    name: 'Hero Section',
    sectionKind: 'hero',
    framerType: 'Stack',
    direction: 'vertical',
    gridSpan: '12 Cols',
    columns: 1,
    gap: 16,
    padding: '64px 32px',
    background: '#17120E',
    textColor: '#F9F4EE',
    accentColor: '#B37900',
    elements: {
      heading: '讓現場音樂，成為賓客記得住的部分',
      subheading: '婚禮、企業晚宴、VIP 接待的現場音樂統籌。',
      buttons: [
        { label: '立即網上報價', variant: 'primary' },
        { label: 'setOpenIndex(openIndex === index ? null : index)} className="w-full"', variant: 'secondary' },
      ],
    },
  },
  grid,
  'Noto Serif HK',
  'Noto Sans HK',
);
const heroRoot = heroBuilt.ops[0] as {
  attrs: Record<string, unknown>;
  responsive?: { tablet?: { minHeight?: string }; phone?: { minHeight?: string } };
};
const heroHeading = heroBuilt.ops.find((o) => o.op === 'text' && o.attrs.name === 'Heading');
const heroActions = heroBuilt.ops.find((o) => o.op === 'frame' && o.attrs.name === 'Actions');
assert.equal(heroRoot.attrs.minHeight, '720px');
assert.equal(heroRoot.attrs.stackDistribution, 'center');
assert.equal(heroRoot.responsive?.phone?.minHeight, '560px');
assert.equal(heroHeading?.attrs.textAlignment, 'center');
assert.equal((heroHeading as { appear?: { delay: number } } | undefined)?.appear?.delay, 0);

const duplicatedHero = buildSectionOps(
  {
    id: 'hero-dup',
    step: 2,
    name: 'Hero Section',
    sectionKind: 'hero',
    framerType: 'Stack',
    direction: 'vertical',
    gridSpan: '12 Cols',
    columns: 1,
    gap: 16,
    padding: '64px 32px',
    background: '#17120E',
    textColor: '#F9F4EE',
    accentColor: '#B37900',
    elements: {
      heading: '讓現場音樂，成為賓客記得住的部分',
      subheading: '一首剛剛好的進場歌。\nBW Event Music 為婚禮統籌現場音樂。',
      paragraphs: ['一首剛剛好的進場歌。', 'BW Event Music 為婚禮統籌現場音樂。', '一首剛剛好的進場歌。'],
      buttons: [{ label: '立即網上報價', variant: 'primary' }],
    },
  },
  grid,
);
const heroBodyCopy = duplicatedHero.ops
  .filter((op) => op.op === 'text' && (op.attrs.name === 'Paragraph' || op.attrs.name === 'Subheading'))
  .map((op) => String(op.attrs.text));
assert.deepEqual(heroBodyCopy, ['一首剛剛好的進場歌。', 'BW Event Music 為婚禮統籌現場音樂。']);
assert.equal(heroBuilt.ops[1].attrs.width, '720px', 'Hero copy stays in a 720px column');
assert.equal(heroBuilt.ops[1].attrs.maxWidth, '100%');
assert.equal(heroHeading?.attrs.width, '100%', 'Hero title fills the column instead of shrinking to one character');
assert.equal(heroActions?.attrs.stackDistribution, 'center');
assert.equal(
  heroBuilt.ops.filter((o) => o.op === 'frame' && o.attrs.name === 'Button').length,
  1,
  'JSX leaked into a button label is not written to Framer',
);

const servicesBuilt = buildSectionOps(
  {
    id: 'services',
    step: 3,
    name: 'Services Section',
    sectionKind: 'features',
    framerType: 'Grid',
    direction: 'vertical',
    gridSpan: '12 Cols',
    columns: 3,
    gap: 24,
    padding: '64px 32px',
    background: '#F9F4EE',
    textColor: '#1F0000',
    accentColor: '#B37900',
    elements: {
      heading: '我們可以為您統籌甚麼？',
      cards: [
        { title: '婚禮演出', description: '證婚與進場' },
        { title: '周年晚宴', description: '開場與壓軸' },
        { title: 'VIP接待', description: '私人晚宴' },
      ],
    },
  },
  grid,
);
const cardsGrid = servicesBuilt.ops.find((o) => o.op === 'frame' && o.attrs.name === 'CardsGrid') as {
  attrs: Record<string, unknown>;
  responsive?: {
    tablet?: { gridColumnCount?: number };
    phone?: { layout?: string; stackDirection?: string };
  };
};
assert.equal(cardsGrid.attrs.gridColumnCount, 3);
assert.equal(cardsGrid.responsive?.tablet?.gridColumnCount, 2, 'Tablet services use two columns');
assert.equal(cardsGrid.responsive?.phone?.layout, 'stack', 'Phone services become a vertical stack');
assert.equal(cardsGrid.responsive?.phone?.stackDirection, 'vertical');

assert.equal(resolveGridColumns('grid-cols-1 md:grid-cols-3', 'desktop'), 3);
assert.equal(resolveGridColumns('grid-cols-1 md:grid-cols-3', 'phone'), 1);
assert.equal(resolveGridColumns('grid-cols-2 lg:grid-cols-4', 'desktop'), 4);
assert.equal(resolveGridColumns('grid-cols-2 lg:grid-cols-4', 'tablet'), 2);
assert.equal(resolveGridColumns('grid-cols-1 lg:grid-cols-2', 'tablet'), 1);

const aboutScene: SceneNode = {
  id: 'about',
  type: 'stack',
  name: '關於 BW Event Music',
  htmlTag: 'section',
  style: { background: '#F9F4EE' },
  layout: { padding: '96px 24px 96px 24px', gap: '40px' },
  children: [
    {
      id: 'cols',
      type: 'grid',
      layout: { columns: 2, tabletColumns: 1, phoneColumns: 1, gap: '48px' },
      children: [
        {
          id: 'copy',
          type: 'stack',
          children: [
            { id: 'h', type: 'text', text: '關於 BW Event Music', htmlTag: 'h2', style: { color: '#1F140C', fontSize: '32px' } },
            { id: 'p', type: 'text', text: '香港音樂娛樂活動統籌中心。音樂、歌單、音量和流程由同一個團隊處理。' },
          ],
        },
        {
          id: 'card',
          type: 'stack',
          layout: { direction: 'horizontal', gap: '16px', padding: '16px', width: '1fr' },
          style: { background: '#F3EEE6', radius: '12px' },
          children: [
            { id: 'bar', type: 'stack', layout: { width: '40px', height: '4px' }, style: { background: '#C45A2A' } },
            { id: 'title', type: 'text', text: '一站式活動統籌' },
          ],
        },
      ],
    },
  ],
};
const aboutOps = buildNodeOps(aboutScene, 'about');
const aboutRoot = aboutOps.ops.find((op) => op.parent === '$bp');
assert.equal(aboutRoot?.attrs.fill, '#F9F4EE');
assert.equal(aboutRoot?.attrs.elementId, 'readdy-about');
const aboutGrid = aboutOps.ops.find((op) => op.attrs.gridColumnCount === 2);
assert.ok(aboutGrid, 'about keeps a 2-column grid instead of one flat card list');
assert.equal(aboutGrid?.responsive?.phone?.layout, 'stack');
const accent = aboutOps.ops.find((op) => op.attrs.fill === '#C45A2A');
assert.ok(accent, 'accent color stays on the bar');
assert.notEqual(aboutRoot?.attrs.fill, '#C45A2A');
const paragraph = aboutOps.ops.find((op) => String(op.attrs.text || '').includes('同一個團隊'));
assert.equal(paragraph?.attrs.width, '1fr');
assert.equal(
  matchSceneToSection(
    { name: 'About', elements: { heading: '關於 BW Event Music' } },
    [aboutScene, { id: 'other', type: 'stack', children: [{ id: 'x', type: 'text', text: '其他段落' }] }],
  )?.id,
  'about',
);

assert.match(syncTs, /createVariant/);
assert.match(syncTs, /name: "Tablet"/);
assert.match(syncTs, /name: "Phone"/);
assert.match(syncTs, /patchReplica/);

const footerBuilt = buildSectionOps(
  {
    id: 'sec-footer',
    step: 12,
    name: 'Footer',
    sectionKind: 'footer',
    framerType: 'Stack',
    direction: 'vertical',
    gridSpan: '12 Cols',
    columns: 1,
    gap: 24,
    padding: '40px 32px',
    background: '#F3EEE4',
    textColor: '#1F0000',
    accentColor: '#B37900',
    elements: {
      heading: 'BW Event Music',
      subheading: '© 2026 BW Event Music. 保留所有權利.',
      buttons: [
        { label: '立即網上報價', variant: 'primary', href: 'https://www.emailmeform.com/builder/form/69aam00sCW063' },
        { label: '聯絡我們', variant: 'secondary', href: '/contact/' },
      ],
      footerLead: {
        tagline: '香港音樂娛樂活動統籌中心',
        contactTitle: '聯絡我們',
        contactLines: [{ label: '(+852) 2185 7377', href: 'tel:+85221857377' }],
        quickTitle: '快速連結',
        quickLinks: [{ label: '服務一覽', href: '/services/' }],
        company: 'BW Solution Ltd.',
      },
      footerColumns: [
        { title: '服務分類', links: [{ label: '音響工程', href: '/sound-engineering/' }] },
        { title: '婚宴及晚宴方案', links: [{ label: '公司晚宴', href: '/annual-dinner/corporate-dinner/' }] },
        { title: '服務詳情', links: [{ label: '樂手名單', href: '/services/musicians/' }] },
        { title: '駐場及主題活動', links: [{ label: 'CEO Dinner', href: '/vip-reception/ceo-dinner/' }] },
        { title: '音樂資訊', links: [{ label: '音樂資訊總覽', href: '/music-insights/' }] },
      ],
    },
  },
  grid,
  'Noto Serif HK',
  'Noto Sans HK',
);
const footerGrid = footerBuilt.ops.find((op) => op.attrs.name === 'FooterColumns');
assert.equal(footerGrid?.attrs.gridColumnCount, 5, 'Footer link groups stay on one row of five');
assert.equal(footerBuilt.ops.find((op) => op.attrs.name === 'FooterBrand')?.attrs.width, '3fr');
assert.equal(footerBuilt.ops.find((op) => op.attrs.maxWidth === '448px')?.attrs.text, '香港音樂娛樂活動統籌中心');
assert.ok(footerBuilt.ops.some((op) => op.attrs.width === '2fr' && op.attrs.name === '聯絡我們'));
assert.ok(footerBuilt.ops.some((op) => op.attrs.width === '1fr' && op.attrs.name === '快速連結'));
const quote = footerBuilt.ops.find((op) => op.attrs.link === 'https://www.emailmeform.com/builder/form/69aam00sCW063');
assert.ok(quote, 'Footer quote button keeps its URL');
assert.equal(quote?.attrs.htmlTag, 'a');
const phone = footerBuilt.ops.find((op) => op.attrs.link === 'tel:+85221857377');
assert.equal(phone?.attrs.tag, 'a');
assert.equal(phone?.attrs.text, '(+852) 2185 7377');

const spanOps = buildNodeOps({
  id: 'footer',
  type: 'grid',
  htmlTag: 'footer',
  layout: { columns: 12, gap: '32px' },
  children: [
    { id: 'brand', type: 'stack', layout: { columnSpan: 6 }, children: [{ id: 'name', type: 'text', text: 'BW Event Music' }] },
    { id: 'contact', type: 'stack', layout: { columnSpan: 4 }, children: [{ id: 'phone', type: 'text', text: '(+852) 2185 7377' }] },
    { id: 'quick', type: 'stack', layout: { columnSpan: 2 }, children: [{ id: 'quick', type: 'text', text: '快速連結' }] },
  ],
}, 'footer');
const spanFrames = spanOps.ops.filter((op) => op.parent !== '$bp' && typeof op.attrs.width === 'string' && String(op.attrs.width).endsWith('%'));
assert.deepEqual(spanFrames.map((op) => op.attrs.width), ['50%', '33.3%', '16.7%'], 'Footer 12-column spans become proportional widths');
assert.equal(spanOps.ops.some((op) => op.attrs.gridColumnCount === 12), false, 'Spanned footer row is not written as 12 equal columns');

console.log('ALL READDY FAQ & PROGRESS TESTS PASSED');
