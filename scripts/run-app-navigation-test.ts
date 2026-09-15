import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyLocationHash,
  buildSameOriginHref,
  handleAppHrefClick,
  isModifiedClick,
  shouldOpenHrefInNewTab,
} from '../src/lib/appNavigation';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

assert.equal(isModifiedClick(undefined), false);
assert.equal(isModifiedClick({}), false);
assert.equal(isModifiedClick({ ctrlKey: true }), true);
assert.equal(isModifiedClick({ metaKey: true }), true);
assert.equal(isModifiedClick({ shiftKey: true }), true);
assert.equal(isModifiedClick({ button: 1 }), true);
assert.equal(isModifiedClick({ button: 0 }), false);

Object.defineProperty(globalThis, 'window', {
  value: {
    location: { pathname: '/app', search: '', hash: '#dashboard/overview' },
    open(href: string, target: string, features: string) {
      opened.push({ href, target, features });
      return null;
    },
  },
  configurable: true,
});

const opened: { href: string; target: string; features: string }[] = [];

assert.equal(buildSameOriginHref('quotation/pitching'), '/app#quotation/pitching');
assert.equal(buildSameOriginHref('#website/list?id=ws-1'), '/app#website/list?id=ws-1');

assert.equal(applyLocationHash('quotation/projects?id=p1'), false);
assert.equal(window.location.hash, '#quotation/projects?id=p1');
assert.equal(opened.length, 0);

assert.equal(applyLocationHash('quotation/pitching?id=p2', { ctrlKey: true }), true);
assert.equal(window.location.hash, '#quotation/projects?id=p1');
assert.equal(opened.length, 1);
assert.equal(opened[0].href, '/app#quotation/pitching?id=p2');
assert.equal(opened[0].target, '_blank');

assert.equal(applyLocationHash('marketing/google-ads?campaign=1', { metaKey: true }), true);
assert.equal(opened.length, 2);
assert.equal(opened[1].href, '/app#marketing/google-ads?campaign=1');

assert.equal(shouldOpenHrefInNewTab({ ctrlKey: true }), true);
assert.equal(shouldOpenHrefInNewTab({ button: 0 }), false);

const sameTab: string[] = [];
const preventCalls: string[] = [];
handleAppHrefClick(
  { ctrlKey: true, preventDefault: () => preventCalls.push('p') },
  '/app#quotation/pitching?id=row-1',
  () => sameTab.push('same'),
);
assert.equal(sameTab.length, 0);
assert.equal(preventCalls.length, 1);
assert.equal(opened.at(-1)?.href, '/app#quotation/pitching?id=row-1');

handleAppHrefClick(
  { button: 0 },
  '/app#quotation/projects?id=row-2',
  () => sameTab.push('same'),
);
assert.equal(sameTab.join(','), 'same');

const topNav = read('src/components/layout/TopNav.tsx');
assert.match(topNav, /<AppLink/);
assert.doesNotMatch(topNav, /onClick=\{\(\) => navigateTo\(menuItem\.id\)\}/);

const sidebar = read('src/components/layout/Sidebar.tsx');
assert.match(sidebar, /<AppLink/);
assert.match(sidebar, /module=\{currentModule\}/);
assert.match(sidebar, /subModule=\{subItem\.id\}/);

const appContext = read('src/context/AppContext.tsx');
assert.match(appContext, /installAppNavGestureListener/);
assert.match(appContext, /applyLocationHash/);

const pitching = read('src/components/quotation/PitchingModule.tsx');
assert.match(pitching, /appHrefClickProps\(buildQuotationProjectHref/);
const projectList = read('src/components/quotation/ProjectModule.tsx');
assert.match(projectList, /appHrefClickProps\(buildQuotationProjectHref/);

console.log('app navigation: ok');
