import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {
  loadSavedPageProgress,
  normalizeFramerProjectKey,
  patchSavedPageProgress,
  savePageProgress,
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
  detectSectionKind: (hint: string, tag: string, idx: number, total: number) => string;
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
      elements: { heading?: string; subheading?: string; buttons?: Array<{ label: string }>; cards?: Array<{ title: string; description: string }> };
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
assert.equal(detectSectionKind('FaqSection', 'section', 10, 12), 'content');

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

assert.equal(rootOp.attrs.fill, '#17120E', 'Transparent home navbar falls back to dark solid fill on Framer canvas');
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

console.log('ALL READDY FAQ & PROGRESS TESTS PASSED');
