import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import ts from 'typescript';
import { captureRenderedPage, captureVisiblePage, formatBrowserlessError, publishCapturedImages, resolveRenderUrl } from '../supabase/functions/_shared/readdy-render.ts';
import { fitCapturedImage, splitCssLayers } from '../supabase/functions/_shared/readdy-image-layout.ts';
import { CAPTURE_DEVICES, comparePageLayouts, LAYOUT_MEASUREMENT_VERSION, type PageLayout } from '../supabase/functions/_shared/readdy-layout-score.ts';
import { applyPaintedTextCase, mergePaintedText, readPaintedTextLines } from '../supabase/functions/_shared/readdy-text-layout.ts';
import { analyzeReaddyFileMap } from '../src/lib/readdyProjectAnalyzer.ts';

const path = '/design-center/';
const origin = 'https://officedesign.hk';
const url = resolveRenderUrl(origin, path);
assert.equal(url.href, origin + path);
assert.throws(() => resolveRenderUrl('https://127.0.0.1', '/'));
assert.throws(() => resolveRenderUrl(origin, '//example.com'));
assert.throws(
  () => resolveRenderUrl(origin, '/design-center/:slug'),
  /動態 id/,
);
assert.equal(analyzeReaddyFileMap({
  'index.html': '<title>Office Design</title>',
  'public/sitemap.xml': `<urlset><url><loc>${url.href}</loc></url></urlset>`,
}, { sourceType: 'upload' }).sourceOrigin, origin);

const title = 'OFFICE DESIGN & BUILD';
const text = { id: 'dom-0-0', type: 'text', text: title, htmlTag: 'h1', layout: { width: '380px' } };
const image = { id: 'dom-0-1', type: 'image', src: origin + '/desktop.jpg' };
const menu = { id: 'dom-0-2', type: 'text', text: '開啟選單' };
const root = { id: 'dom-0', type: 'section', name: 'PageBanner', children: [text, image], layout: { height: '720px' } };
const phone = {
  ...root,
  layout: { height: '600px' },
  children: [{ ...text, layout: { width: '350px' } }, { ...image, src: origin + '/phone.jpg' }, menu],
};
const devices = { desktop: 1440, tablet: 834, phone: 390 };
const provider: typeof fetch = async (input, init) => {
  assert.equal(new URL(String(input)).pathname, '/function');
  const { code, context } = JSON.parse(String(init?.body));
  assert.equal(context.url, url.href);
  assert.deepEqual(context.widths, devices);
  assert.ok(code.includes('globalThis.readPaintedTextLines ='), 'Browserless script must inject readPaintedTextLines into page context');
  assert.ok(code.includes('globalThis.fitCapturedImage ='), 'Browserless script must inject fitCapturedImage into page context');
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  const program = await import(moduleUrl);
  let width = 0;
  const result = await program.default({
    context,
    page: {
      setRequestInterception: async () => {},
      on: () => {},
      setViewport: async (viewport: { width: number }) => { width = viewport.width; },
      goto: async () => ({ ok: () => true }),
      url: () => url.href,
      evaluate: async (fn: () => unknown) => {
        if (fn.name === 'captureVisiblePage') return { scenes: [width === devices.phone ? phone : root], limitations: [] };
        if (fn.name === 'measurePageLayout') return { version: context.measurementVersion, width, height: 800, regions: [{ key: 'text:' + title, x: 30, y: 40, width: 200, height: 35 }] };
        if (fn.toString().includes('scrollHeight')) return 800;
      },
      screenshot: async () => 'YQ==',
    },
  });
  return Response.json(result);
};
const capture = await captureRenderedPage(url, 1440, 'fixture-token', provider);
assert.equal(capture.images.phone, 'YQ==');
assert.deepEqual(capture.scenes.phone, [phone]);
const preview = await captureRenderedPage(url, 1440, 'fixture-token', provider, true);
assert.deepEqual(preview.scenes, {});
const iconSource = 'data:image/png;base64,YQ==';
const iconInHeader = { src: iconSource };
const iconOnPhone = { src: iconSource };
let iconUploads = 0;
await publishCapturedImages({ desktop: [{ children: [iconInHeader] }], tablet: [], phone: [iconOnPhone] }, async (name, data) => {
  assert.equal(Buffer.from(data).toString(), 'a');
  iconUploads++;
  return `https://example.com/${name}`;
});
assert.equal(iconUploads, 1);
assert.equal(iconInHeader.src, 'https://example.com/visual-0.png');
assert.equal(iconOnPhone.src, iconInHeader.src);
assert.deepEqual(splitCssLayers('linear-gradient(180deg, rgba(0,0,0,.4), transparent), url("https://example.com/a,b.png")'), [
  'linear-gradient(180deg, rgba(0,0,0,.4), transparent)', 'url("https://example.com/a,b.png")',
]);
assert.deepEqual(fitCapturedImage(1200, 650, 1200, 900, 'cover', '50% 0%'), { x: 0, y: 0, width: 1200, height: 900 });
assert.deepEqual(fitCapturedImage(390, 600, 1200, 650, 'cover', '100% 50%'), {
  x: 390 - 1200 * (600 / 650), y: 0, width: 1200 * (600 / 650), height: 600,
});
assert.deepEqual(fitCapturedImage(200, 400, 300, 300, 'contain', '50% calc(100% - 10px)'), { x: 0, y: 190, width: 200, height: 200 });
assert.deepEqual(fitCapturedImage(900, 180, 520, 260, '50% auto', '0px 0px'), { x: 0, y: 0, width: 450, height: 225 });
assert.deepEqual(fitCapturedImage(640, 400, 400, 250, 'auto auto', 'right 12px bottom 6px'), { x: 228, y: 144, width: 400, height: 250 });
const wholeHeadline = { text: '讓現場音樂 成為賓客記得住的部分', left: 20, top: 30, right: 162, bottom: 46 };
assert.equal(applyPaintedTextCase('Office Design & Build', 'uppercase'), 'OFFICE DESIGN & BUILD');
assert.equal(applyPaintedTextCase('event music services', 'capitalize'), 'Event Music Services');
assert.deepEqual(mergePaintedText([
  { ...wholeHeadline, text: '讓現場音樂', right: 82 },
  { ...wholeHeadline, text: '成為賓客記得住的部分', left: 85 },
]), mergePaintedText([wholeHeadline]));
assert.equal(mergePaintedText([
  { ...wholeHeadline, text: '關於我們', right: 82 },
  { ...wholeHeadline, text: '查看服務', left: 108 },
]).length, 2);
let rangeStart = 0;
let rangeEnd = 0;
const wrapText = '現場音樂婚宴演出';
const wrappingRange = {
  setStart: (_node: unknown, offset: number) => { rangeStart = offset; },
  setEnd: (_node: unknown, offset: number) => { rangeEnd = offset; },
  getClientRects: () => Array.from({ length: rangeEnd - rangeStart }, (_, index) => {
    const indexInText = rangeStart + index;
    const left = 10 + indexInText % 4 * 12;
    const top = indexInText < 4 ? 20 : 44;
    return { left, top, right: left + 12, bottom: top + 20, width: 12, height: 20 };
  }),
};
assert.deepEqual(readPaintedTextLines({ textContent: wrapText } as ChildNode, wrappingRange as unknown as Range), [
  { text: '現場音樂', left: 10, right: 58, top: 20, bottom: 40 },
  { text: '婚宴演出', left: 10, right: 58, top: 44, bottom: 64 },
]);
assert.equal(comparePageLayouts(capture.geometry, preview.geometry).meetsTarget, true);
await assert.rejects(() => captureRenderedPage(url, 1440, 'fixture-token', async () => Response.json({})), /不完整/);

// Load the production Edge functions without serving HTTP or loading remote dependencies.
const file = 'supabase/functions/framer-mcp-sync/index.ts';
const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const mapper = source.statements
  .filter((statement) => !ts.isImportDeclaration(statement) && !statement.getText(source).startsWith('Deno.serve('))
  .map((statement) => statement.getText(source)).join('\n');
const output = ts.transpileModule(mapper + '\nexport { buildRenderedOps, buildFramerProgram };', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { buildRenderedOps, buildFramerProgram } = await import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'));
const ops = buildRenderedOps({ id: 'dom-0', renderedScenes: { desktop: root, tablet: root, phone } });
assert.equal(ops[0].attrs.elementId, 'readdy-dom-0');
assert.equal(ops[0].responsive.phone.height, '600px');
assert.equal(ops[1].attrs.text, title);
assert.equal(ops[1].responsive.phone.width, '350px');
assert.equal(ops[2].replicaImages.phone, origin + '/phone.jpg');
assert.equal(ops[3].attrs.visible, false);
assert.equal(ops[3].responsive.phone.visible, true);
const absolute = buildRenderedOps({
  id: 'dom-1',
  renderedScenes: { desktop: { ...root, layout: { width: '1112px', left: '164px', top: '103px', height: '720px' } } },
}, true);
assert.equal(absolute[0].attrs.position, 'absolute');
assert.equal(absolute[0].attrs.left, '164px');
assert.equal(absolute[0].attrs.top, '103px');
const centered = buildRenderedOps({
  id: 'dom-hero',
  renderedScenes: {
    desktop: {
      id: 'dom-hero', type: 'section', htmlTag: 'section',
      layout: { width: '100%', height: '720px', left: '0px', top: '0px' },
      style: { background: '#111111' },
      children: [
        { id: 'bg', type: 'image', src: origin + '/hero.jpg', layout: { position: 'absolute', left: '0px', top: '0px', width: '100%', height: '720px' } },
        {
          id: 'bar', type: 'stack', htmlTag: 'nav',
          layout: { position: 'absolute', left: '0px', top: '0px', width: '100%', height: '64px' },
          style: { background: '#000000' },
          children: [{
            id: 'lnk', type: 'stack', htmlTag: 'a', href: '/office-design/',
            layout: { position: 'absolute', left: '120px', top: '20px', width: '80px', height: '24px' },
            children: [{ id: 't1', type: 'text', text: '辦公室設計', layout: { position: 'absolute', left: '0px', top: '0px', width: '80px', height: 'auto' } }],
          }],
        },
      ],
    },
    phone: {
      id: 'dom-hero', type: 'section', htmlTag: 'section',
      layout: { width: '100%', height: '600px', left: '0px', top: '0px' },
      style: { background: '#111111' },
      children: [
        { id: 'bg', type: 'image', src: origin + '/hero.jpg', layout: { position: 'absolute', left: '0px', top: '0px', width: '100%', height: '600px' } },
      ],
    },
  },
}, true, { desktop: '1440px', tablet: '834px', phone: '390px' });
assert.equal(centered[0].attrs.stackAlignment, 'center');
assert.equal(centered[1].parent, centered[0].id);
assert.equal(centered[1].attrs.width, '100%');
const backdropOp = centered.find((op: { attrs: { name?: string } }) => String(op.attrs.name || '').includes('Backdrop'));
assert.ok(backdropOp, 'Full-width colored bar emits a 100% backdrop');
assert.equal(backdropOp.parent, centered[0].id);
assert.equal(backdropOp.attrs.width, '100%');
assert.equal(backdropOp.attrs.fill, '#000000');
const stageOp = centered.find((op: { attrs: { name?: string } }) => op.attrs.name === 'Content Stage');
assert.ok(stageOp, 'Full-width section creates a centered Content Stage');
assert.equal(stageOp.parent, centered[0].id);
assert.equal(stageOp.attrs.width, '1440px');
assert.equal(stageOp.responsive.phone.width, '390px');
const linkOp = centered.find((op: { attrs: { link?: string } }) => Boolean(op.attrs.link));
assert.ok(linkOp, 'Rendered anchor keeps its link');
assert.equal(linkOp.attrs.link, '/office-design');
assert.equal(linkOp.attrs.htmlTag, 'a');
const breakpointReset = buildRenderedOps({
  id: 'dom-reset',
  renderedScenes: {
    desktop: { ...root, style: { background: '#fff', radius: '24px', opacity: 0.5 }, layout: { clip: true, zIndex: 3 } },
    phone: root,
  },
});
assert.equal(breakpointReset[0].responsive.phone.fill, 'rgba(0, 0, 0, 0)');
assert.equal(breakpointReset[0].responsive.phone.radius, '0px');
assert.equal(breakpointReset[0].responsive.phone.overflow, 'visible');
assert.equal(breakpointReset[0].responsive.phone.zIndex, 0);
assert.equal(breakpointReset[0].responsive.phone.opacity, 1);

const legacy = { id: 'legacy', elementId: 'readdy-sec-1' };
const authored = { id: 'authored', elementId: 'custom-footer' };
const desktop = { id: 'desktop', name: 'Desktop', type: 'FrameNode', layout: 'stack', width: '1440px', children: [authored, legacy] };
const tablet = { id: 'tablet', name: 'Tablet', type: 'FrameNode', width: '834px' };
const mobile = { id: 'phone', name: 'Phone', type: 'FrameNode', width: '390px' };
const page = { id: 'page', path, type: 'WebPageNode', children: [desktop, tablet, mobile] };
const nodes = new Map<string, unknown>([['page', page], ['desktop', desktop]]);
const patches = new Map<string, unknown>();
const tree = {
  get: (id: string) => nodes.get(id),
  getNodesOfTypes: () => [page],
  insert: (type: string, id: string, attrs: { parent?: string; elementId?: string }) => {
    const node = { id, type, ...attrs };
    nodes.set(id, node);
    if (attrs.parent === 'desktop') desktop.children.push({ id, elementId: attrs.elementId || '' });
    return node;
  },
  remove: (id: string) => { desktop.children = desktop.children.filter((child) => child.id !== id); },
  setParent: (id: string, _parent: string, index: number) => {
    const child = desktop.children.find((item) => item.id === id)!;
    desktop.children = desktop.children.filter((item) => item !== child);
    desktop.children.splice(index, 0, child);
  },
  patch: (id: string, attrs: object) => { patches.set(id, attrs); },
  assetReference: async (url: string) => ({ url }),
};
const program = buildFramerProgram({
  stamp: 'fixture', pagePath: path, pageTitle: 'Design Center',
  pageNodeId: 'page', desktopWidth: '1440px', rendered: true, ops, marker: 'readdy-dom-0',
  expectedMarkers: ['readdy-dom-0'],
});
const run = new Function('api', `return (async () => { ${program} })();`);
assert.deepEqual((await run({ tree })).warnings, []);
assert.deepEqual(desktop.children.map((child) => child.elementId), ['custom-footer', 'readdy-dom-0']);
assert.deepEqual([...patches.entries()].find(([id]) => id.startsWith('phone') && id.endsWith(ops[2].id))?.[1], {
  ...ops[2].responsive.phone, fill: { url: origin + '/phone.jpg' },
});
const previouslyWritten = desktop.children.slice();
await assert.rejects(() => run({ tree: {
  ...tree,
  assetReference: async () => { throw new Error('fixture asset unavailable'); },
} }), /圖片未能載入/);
assert.deepEqual(desktop.children, previouslyWritten);
await assert.rejects(() => run({ tree: {
  ...tree,
  get: (id: string) => {
    if (id.endsWith(ops[1].id)) return { id, text: 'incorrect text' };
    return tree.get(id);
  },
} }), /讀回不一致/);
assert.deepEqual(desktop.children, previouslyWritten);
// Framer RichTextNode normalizes straight quotes/apostrophes to typographic quotes on readback
const smartQuoteOps = buildRenderedOps({
  id: 'dom-quote',
  renderedScenes: {
    desktop: {
      id: 'dom-quote', type: 'section', htmlTag: 'section', layout: { height: '100px' },
      children: [{ id: 'q1', type: 'text', text: "Manager's Office", layout: { width: '180px' } }],
    },
  },
});
const smartQuoteProgram = buildFramerProgram({
  stamp: 'quote', pagePath: path, pageTitle: 'Design Center',
  pageNodeId: 'page', desktopWidth: '1440px', rendered: true, ops: smartQuoteOps, marker: 'readdy-dom-quote',
});
const smartQuoteResult = await new Function('api', `return (async () => { ${smartQuoteProgram} })();`)({
  tree: {
    ...tree,
    get: (id: string) => (id.endsWith(smartQuoteOps[1].id) ? { id, text: 'Manager\u2019s Office' } : tree.get(id)),
  },
});
assert.ok(smartQuoteResult.sectionId, 'Smart apostrophe normalization on readback should pass');
desktop.children = desktop.children.filter((child) => child.elementId !== 'readdy-dom-quote');
const missingProgram = buildFramerProgram({
  stamp: 'missing', pagePath: path, pageTitle: 'Design Center',
  pageNodeId: 'page', desktopWidth: '1440px', rendered: true, ops: [],
  expectedMarkers: ['readdy-dom-0', 'readdy-dom-99'],
});
assert.deepEqual((await new Function('api', `return (async () => { ${missingProgram} })();`)({ tree })).missingMarkers, ['readdy-dom-99']);
assert.deepEqual(desktop.children, previouslyWritten);
Object.assign(desktop, { width: '1200px' });
Object.assign(tablet, { width: '810px' });
const misaligned = await run({ tree });
assert.deepEqual(patches.get('desktop'), { width: '1440px' });
assert.deepEqual(patches.get('tablet'), { width: '834px', left: '1520px' });
assert.match(misaligned.warnings.join('\n'), /834px/);
Object.assign(desktop, { width: '1440px' });
Object.assign(tablet, { width: '834px', left: '1520px' });
Object.assign(mobile, { width: '390px', left: '2434px' });
const imported = desktop.children.filter((child) => child.elementId === 'readdy-dom-0');
assert.equal(imported.length, 1);
assert.notEqual(imported[0].id, previouslyWritten.find((child) => child.elementId === 'readdy-dom-0')?.id);

const mounted = { id: 'captured-page', elementId: 'readdy-rendered-content', children: [] as { id: string; elementId: string }[] };
desktop.children.push(mounted);
nodes.set(mounted.id, mounted);
const mountTree = {
  ...tree,
  insert: (type: string, id: string, attrs: { parent: string; elementId?: string }) => {
    const inserted = tree.insert(type, id, attrs);
    if (attrs.parent === mounted.id) mounted.children.push({ id, elementId: attrs.elementId || '' });
    return inserted;
  },
  setParent: () => {},
};
const mountProgram = buildFramerProgram({
  stamp: 'geometry', pagePath: path, pageTitle: 'Design Center',
  pageNodeId: 'page', desktopWidth: '1440px', rendered: true, ops: absolute,
  pageGeometry: {
    desktop: { height: 1110, background: '#eeeeee' },
    tablet: { height: 1300 },
    phone: { height: 1680 },
  },
  expectedMarkers: ['readdy-dom-1'],
});
await new Function('api', `return (async () => { ${mountProgram} })();`)({ tree: mountTree });
assert.deepEqual(patches.get(mounted.id), { height: '1110px', fill: '#eeeeee' });
assert.deepEqual(patches.get('phone' + mounted.id), { height: '1680px' });
assert.deepEqual(mounted.children.map((child) => child.elementId), ['readdy-dom-1']);
assert.deepEqual(desktop.children.map((child) => child.elementId), ['custom-footer', mounted.elementId]);

const atDevices = (regions: PageLayout['regions']): typeof capture.geometry => Object.fromEntries(
  CAPTURE_DEVICES.map((device) => [device, { version: LAYOUT_MEASUREMENT_VERSION, width: devices[device], height: 800, regions }]),
) as typeof capture.geometry;
const region = (key: string, y: number) => ({ key, x: 25, y, width: 200, height: 45 });
for (const heading of ['OFFICE DESIGN & BUILD', '讓現場音樂，成為賓客記得住的部分']) {
  const regions = [region('text:' + heading, 85), region('image', 190), region('image', 310), region('text:查看服務', 470)];
  const source = atDevices(regions);
  const target = atDevices(regions.map((item) => ({ ...item, x: item.x + 2 })));
  assert.equal(comparePageLayouts(source, target).meetsTarget, true);
  target.phone.regions = target.phone.regions.filter((_, index) => index !== 0);
  const missingTitle = comparePageLayouts(source, target);
  assert.equal(missingTitle.devices.desktop.percent, 100);
  assert.equal(missingTitle.devices.phone.missing, 1);
  assert.equal(missingTitle.meetsTarget, false);
  target.phone.regions = regions.map((item, index) => index === 1 ? region('image', 310) : item);
  assert.equal(comparePageLayouts(source, target).meetsTarget, false);
}

// Verify captureVisiblePage unwraps full-page flex/bg/relative shells and <main> into distinct sections,
// while preserving Hero relative+absolute containers and padded content divs as single blocks.
{
  type MockStyle = Record<string, string>;
  interface MockEl {
    tagName: string;
    styleMap: MockStyle;
    rect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
    children: MockEl[];
    childNodes: Array<MockEl | { nodeType: number; textContent: string }>;
    matches: (sel: string) => boolean;
    closest: (sel: string) => MockEl | null;
    querySelector: (sel: string) => MockEl | null;
    querySelectorAll: () => MockEl[];
    getAttribute: (attr: string) => string | null;
    getBoundingClientRect: () => MockEl['rect'];
  }
  const makeEl = (
    tag: string,
    styleOverrides: MockStyle,
    children: MockEl[] = [],
    text?: string,
    attrs: Record<string, string> = {},
    width = 1440,
    height = 200,
  ): MockEl => {
    const childNodes: MockEl['childNodes'] = [
      ...children,
      ...(text ? [{ nodeType: 3, textContent: text }] : []),
    ];
    return {
      tagName: tag.toUpperCase(),
      styleMap: {
        display: 'block',
        visibility: 'visible',
        opacity: '1',
        position: 'static',
        backgroundColor: 'rgba(0, 0, 0, 0)',
        backgroundImage: 'none',
        borderRadius: '0px',
        borderWidth: '0px',
        borderTopWidth: '0px',
        padding: '0px',
        margin: '0px',
        maxWidth: 'none',
        overflow: 'visible',
        color: 'rgb(24, 24, 24)',
        fontFamily: 'Inter',
        fontSize: '16px',
        fontWeight: '400',
        lineHeight: '24px',
        letterSpacing: '0px',
        textAlign: 'left',
        textTransform: 'none',
        ...styleOverrides,
      },
      rect: { left: 0, top: 0, right: width, bottom: height, width, height },
      children,
      childNodes,
      matches: (sel: string) => sel.split(',').map((s) => s.trim().toLowerCase()).includes(tag.toLowerCase()),
      closest: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      getAttribute: (attr: string) => attrs[attr] ?? null,
      getBoundingClientRect() { return this.rect; },
    };
  };

  const navEl = makeEl('header', { position: 'fixed', zIndex: '50', backgroundColor: 'rgba(0, 0, 0, 0)' }, [
    makeEl('span', {}, [], 'BW Event Music'),
  ], undefined, {}, 1440, 80);
  const heroAbsBg = makeEl('div', { position: 'absolute', backgroundColor: 'rgb(10, 10, 10)' }, [], undefined, {}, 1440, 720);
  const heroContent = makeEl('div', { position: 'relative', padding: '80px 32px' }, [
    makeEl('h1', { fontWeight: '700', fontSize: '48px' }, [], '讓現場音樂，成為賓客記得住的部分'),
  ], undefined, {}, 1440, 400);
  // Hero built with <div class="relative"> + absolute background child must NOT be unwrapped into 2 blocks
  const heroDivSection = makeEl('div', { position: 'relative', overflow: 'hidden' }, [heroAbsBg, heroContent], undefined, {}, 1440, 720);
  const servicesSection = makeEl('section', { padding: '96px 24px', backgroundColor: 'rgb(250, 248, 245)' }, [
    makeEl('h2', { fontWeight: '700', fontSize: '36px' }, [], '我們可以為您統籌甚麼？'),
  ], undefined, {}, 1440, 600);
  const paddedBodyDiv = makeEl('div', { padding: '64px 24px' }, [
    makeEl('h2', { fontWeight: '700', fontSize: '32px' }, [], '活動流程'),
  ], undefined, {}, 1440, 480);
  const mainEl = makeEl('main', { display: 'block' }, [heroDivSection, servicesSection, paddedBodyDiv], undefined, {}, 1440, 1800);
  const footerEl = makeEl('footer', { padding: '48px 24px', backgroundColor: 'rgb(243, 238, 228)' }, [
    makeEl('h3', { fontWeight: '600' }, [], '聯絡我們'),
  ], undefined, {}, 1440, 360);
  const floatingQuote = makeEl('a', { position: 'fixed', backgroundColor: 'rgb(240, 140, 40)' }, [], '快速報價', {}, 160, 48);
  floatingQuote.rect = { left: 1240, top: 720, right: 1400, bottom: 768, width: 160, height: 48 };
  const floatingWhatsapp = makeEl('a', { position: 'fixed', backgroundColor: 'rgb(59, 108, 168)' }, [], 'WhatsApp 聯絡我們', {}, 200, 48);
  floatingWhatsapp.rect = { left: 1200, top: 780, right: 1400, bottom: 828, width: 200, height: 48 };
  const pageShell = makeEl(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden auto',
      backgroundColor: 'rgb(250, 248, 245)',
    },
    [navEl, mainEl, footerEl, floatingQuote, floatingWhatsapp],
    undefined,
    {},
    1440,
    2240,
  );
  const appRoot = makeEl('div', {}, [pageShell], undefined, { id: 'root' }, 1440, 2240);

  const prevGlobals = {
    document: (globalThis as Record<string, unknown>).document,
    getComputedStyle: (globalThis as Record<string, unknown>).getComputedStyle,
    Node: (globalThis as Record<string, unknown>).Node,
    Element: (globalThis as Record<string, unknown>).Element,
    HTMLImageElement: (globalThis as Record<string, unknown>).HTMLImageElement,
  };
  class DummyElement {}
  class DummyHTMLImageElement extends DummyElement {}
  const attachProto = (el: MockEl) => {
    Object.setPrototypeOf(el, DummyElement.prototype);
    el.children.forEach(attachProto);
  };
  attachProto(appRoot);

  try {
    (globalThis as Record<string, unknown>).Element = DummyElement;
    (globalThis as Record<string, unknown>).HTMLImageElement = DummyHTMLImageElement;
    (globalThis as Record<string, unknown>).Node = { TEXT_NODE: 3 };
    (globalThis as Record<string, unknown>).getComputedStyle = (el: MockEl) => ({
      ...el.styleMap,
      getPropertyValue: (k: string) => el.styleMap[k] || '',
    });
    (globalThis as Record<string, unknown>).document = {
      documentElement: { clientWidth: 1440, scrollHeight: 2240 },
      body: appRoot,
      querySelector: (sel: string) => (sel.includes('#root') ? appRoot : null),
      createElement: () => ({ width: 1, height: 1, getContext: () => null }),
      createRange: () => ({
        setStart: () => {},
        setEnd: () => {},
        getClientRects: () => [{ left: 0, top: 0, right: 120, bottom: 24, width: 120, height: 24 }],
      }),
    };

    const desktopCaptured = await captureVisiblePage(null);
    assert.deepEqual(desktopCaptured.unwrapped, ['dom-0', 'dom-0-1']);
    assert.deepEqual(
      (desktopCaptured.scenes as Array<{ id: string; htmlTag: string }>).map((s) => `${s.id}:${s.htmlTag}`),
      ['dom-0-0:header', 'dom-0-1-0:div', 'dom-0-1-1:section', 'dom-0-1-2:div', 'dom-0-2:footer'],
    );
    const phoneCaptured = await captureVisiblePage(desktopCaptured.unwrapped);
    assert.deepEqual(
      (phoneCaptured.scenes as Array<{ id: string }>).map((s) => s.id),
      (desktopCaptured.scenes as Array<{ id: string }>).map((s) => s.id),
    );
  } finally {
    for (const [k, v] of Object.entries(prevGlobals)) {
      if (v === undefined) delete (globalThis as Record<string, unknown>)[k];
      else (globalThis as Record<string, unknown>)[k] = v;
    }
  }
}

// Verify fixed header mounts directly on Breakpoint (not inside overflow:clip Readdy Content),
// internal page links resolve to existing WebPageNode without invalid htmlTag="a", and appear/shadow propagate.
{
  const fixedNavOps = buildRenderedOps({
    id: 'dom-nav',
    renderedScenes: {
      desktop: {
        id: 'dom-nav', type: 'section', htmlTag: 'header',
        layout: { position: 'fixed', width: '100%', height: '80px', left: '0px', top: '0px', zIndex: 50 },
        style: { shadow: '0px 4px 12px rgba(0, 0, 0, 0.12)' },
        appear: { opacity: 0, y: '18px', delay: 0.15 },
        children: [{
          id: 'nav-lnk', type: 'stack', name: 'a', htmlTag: 'a', href: '/Services/',
          layout: { position: 'absolute', left: '200px', top: '24px', width: '80px', height: '24px' },
          children: [{ id: 'nav-t1', type: 'text', text: '服務一覽', layout: { position: 'absolute', left: '0px', top: '0px', width: '80px', height: 'auto' } }],
        }],
      },
    },
  }, true, { desktop: '1536px', tablet: '834px', phone: '390px' });
  assert.equal(fixedNavOps[0].attrs.position, 'fixed');
  assert.equal(fixedNavOps[0].attrs.zIndex, 50);
  assert.equal(fixedNavOps[0].attrs.shadow, '0px 4px 12px rgba(0, 0, 0, 0.12)');
  assert.deepEqual(fixedNavOps[0].appear, { opacity: 0, y: '18px', delay: 0.15 });

  const bpDesktop = { id: 'bp-d', name: 'Desktop', type: 'FrameNode', layout: 'stack', width: '1536px', children: [] as Array<{ id: string; elementId: string }> };
  const bpTablet = { id: 'bp-t', name: 'Tablet', type: 'FrameNode', width: '834px', left: '1616px' };
  const bpPhone = { id: 'bp-p', name: 'Phone', type: 'FrameNode', width: '390px', left: '2530px' };
  const homePage = { id: 'pg-home', path: '/', type: 'WebPageNode', children: [bpDesktop, bpTablet, bpPhone] };
  const servicesPage = { id: 'pg-services', path: '/services', type: 'WebPageNode', children: [] };
  const localNodes = new Map<string, Record<string, unknown>>([['pg-home', homePage], ['bp-d', bpDesktop]]);
  let linkFrameId = '';
  const patchedLinks: Array<{ id: string; attrs: Record<string, unknown> }> = [];
  const localTree = {
    get: (id: string) => localNodes.get(id),
    getNodesOfTypes: (type: string) => (type === 'WebPageNode' ? [homePage, servicesPage] : []),
    insert: (type: string, id: string, attrs: Record<string, unknown>) => {
      const node: Record<string, unknown> = { id, type, ...attrs, children: [] };
      assert.equal(attrs.link, undefined, 'Framer ignores string link attributes');
      if (attrs.name === 'a') {
        linkFrameId = id;
        assert.equal(attrs.htmlTag, undefined, 'Framer supplies the anchor tag for linked frames');
      }
      localNodes.set(id, node);
      const pNode = localNodes.get(String(attrs.parent || '')) as { children?: Array<{ id: string; elementId: string }> } | undefined;
      if (pNode && Array.isArray(pNode.children)) pNode.children.push({ id, elementId: String(attrs.elementId || '') });
      return node;
    },
    remove: (id: string) => {
      for (const n of localNodes.values()) {
        if (Array.isArray(n.children)) n.children = (n.children as Array<{ id: string }>).filter((c) => c.id !== id);
      }
      localNodes.delete(id);
    },
    setParent: () => {},
    patch: (id: string, attrs: Record<string, unknown>) => {
      patchedLinks.push({ id, attrs });
      const n = localNodes.get(id);
      if (n) {
        Object.assign(n, attrs);
        if ('link.href' in attrs) n.link = { href: attrs['link.href'] };
      }
    },
    assetReference: async (u: string) => ({ url: u }),
  };
  const fixedProgram = buildFramerProgram({
    stamp: 'fixednav', pagePath: '/', pageTitle: 'Home', pageNodeId: 'pg-home',
    desktopWidth: '1536px', rendered: true,
    pageGeometry: { desktop: { height: 2400 }, tablet: { height: 2600 }, phone: { height: 3000 } },
    sections: [{ marker: 'readdy-dom-nav', ops: fixedNavOps }],
    expectedMarkers: ['readdy-dom-nav'],
  });
  const fixedRes = await new Function('api', `return (async () => { ${fixedProgram} })();`)({ tree: localTree });
  assert.deepEqual(fixedRes.missingMarkers, []);
  assert.ok(bpDesktop.children.some((c) => c.elementId === 'readdy-dom-nav'), 'Fixed header must mount directly on Breakpoint');
  assert.ok(linkFrameId);
  assert.deepEqual(localNodes.get(linkFrameId)?.link, { href: '/services' }, 'Framer exposes native links through link.href');
  assert.ok(patchedLinks.some((p) => p.attrs['appearEffect.enter.opacity'] === 0), 'Appear effect should be patched on rendered node');
}

// Verify Browserless transient retry & clean error diagnostics
assert.equal(
  formatBrowserlessError(JSON.stringify({
    error: 'Source page unavailable (desktop: HTTP 503)\ndefault (http://0.0.0.0:3000/function/browserless-function-abc.js:638:46) (requestId: req-1)',
  })),
  'Source page unavailable (desktop: HTTP 503)',
);
assert.equal(
  formatBrowserlessError('Source page unavailable (tablet: net::ERR_RESET) (requestId: req-2)'),
  'Source page unavailable (tablet: net::ERR_RESET)',
);

{
  let capturedCode = '';
  let capturedCtx: unknown = null;
  await captureRenderedPage(url, 1440, 'fixture-token', async (_input, init) => {
    const parsed = JSON.parse(String(init?.body));
    capturedCode = parsed.code;
    capturedCtx = parsed.context;
    return Response.json({
      url: url.href,
      images: { desktop: 'YQ==', tablet: 'YQ==', phone: 'YQ==' },
      scenes: { desktop: [root], tablet: [root], phone: [phone] },
      geometry: atDevices([region('text:' + title, 85)]),
      limitations: [],
    });
  });
  const program = (await import('data:text/javascript;base64,' + Buffer.from(capturedCode).toString('base64'))).default;
  let desktopGotoCalls = 0;
  const retryRes = await program({
    context: capturedCtx,
    page: {
      setRequestInterception: async () => {},
      on: () => {},
      setViewport: async () => {},
      goto: async () => {
        desktopGotoCalls += 1;
        if (desktopGotoCalls === 1) return { ok: () => false, status: () => 503 };
        return { ok: () => true, status: () => 200 };
      },
      url: () => url.href,
      evaluate: async (fn: () => unknown) => {
        if (fn.name === 'captureVisiblePage') return { scenes: [root], limitations: [] };
        if (fn.name === 'measurePageLayout') return { version: LAYOUT_MEASUREMENT_VERSION, width: 1440, height: 800, regions: [{ key: 'text:' + title, x: 30, y: 40, width: 200, height: 35 }] };
        if (fn.toString().includes('scrollHeight')) return 800;
      },
      screenshot: async () => 'YQ==',
    },
  });
  assert.equal(desktopGotoCalls, 4, 'Retries transient 503 once on desktop and completes tablet+phone');
  assert.equal(retryRes.images.phone, 'YQ==');

  let permCalls = 0;
  await assert.rejects(
    () => program({
      context: capturedCtx,
      page: {
        setRequestInterception: async () => {},
        on: () => {},
        setViewport: async () => {},
        goto: async () => {
          permCalls += 1;
          return { ok: () => false, status: () => 404 };
        },
        url: () => url.href,
        evaluate: async () => ({}),
        screenshot: async () => 'YQ==',
      },
    }),
    /Source page unavailable \(desktop: HTTP 404\)/,
  );
  assert.equal(permCalls, 1, 'Permanent 404 does not retry');
}

{
  let outer502Calls = 0;
  const res502 = await captureRenderedPage(
    url,
    1440,
    'fixture-token',
    async () => {
      outer502Calls += 1;
      if (outer502Calls === 1) return new Response('Bad Gateway', { status: 502 });
      return Response.json({
        url: url.href,
        images: { desktop: 'YQ==', tablet: 'YQ==', phone: 'YQ==' },
        scenes: { desktop: [root], tablet: [root], phone: [phone] },
        geometry: atDevices([region('text:' + title, 85)]),
        limitations: [],
      });
    },
    false,
    0,
  );
  assert.equal(outer502Calls, 2);
  assert.equal(res502.images.desktop, 'YQ==');

  let outer400Calls = 0;
  const res400 = await captureRenderedPage(
    url,
    1440,
    'fixture-token',
    async () => {
      outer400Calls += 1;
      if (outer400Calls === 1) {
        return new Response(
          JSON.stringify({
            error: 'Source page unavailable\ndefault (http://0.0.0.0:3000/function/browserless-function-abc.js:638:46) (requestId: xyz)',
          }),
          { status: 400 },
        );
      }
      return Response.json({
        url: url.href,
        images: { desktop: 'YQ==', tablet: 'YQ==', phone: 'YQ==' },
        scenes: { desktop: [root], tablet: [root], phone: [phone] },
        geometry: atDevices([region('text:' + title, 85)]),
        limitations: [],
      });
    },
    false,
    0,
  );
  assert.equal(outer400Calls, 2);
  assert.equal(res400.images.tablet, 'YQ==');

  let permanent400Calls = 0;
  await assert.rejects(
    () => captureRenderedPage(
      url,
      1440,
      'fixture-token',
      async () => {
        permanent400Calls += 1;
        return new Response(
          JSON.stringify({
            error: 'Source page unavailable (desktop: HTTP 404)\ndefault (http://0.0.0.0:3000/function/browserless-function-abc.js:638:46) (requestId: xyz)',
          }),
          { status: 400 },
        );
      },
      false,
      0,
    ),
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return msg.includes('Source page unavailable (desktop: HTTP 404)') && !msg.includes('browserless-function-');
    },
  );
  assert.equal(permanent400Calls, 1, 'Permanent HTTP 404 error from Browserless does not retry');
}

console.log('Readdy rendered source and Framer breakpoint tests passed');
