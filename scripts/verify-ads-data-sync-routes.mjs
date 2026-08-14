import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contextSrc = readFileSync(path.join(root, 'src/context/AppContext.tsx'), 'utf8');
const marketingSrc = readFileSync(path.join(root, 'src/components/marketing/MarketingModule.tsx'), 'utf8');
const sidebarSrc = readFileSync(path.join(root, 'src/components/layout/Sidebar.tsx'), 'utf8');

const checks = [
  {
    name: 'menu has 廣告數據同步 under 設定',
    ok: /id: 'ads-data-sync',\s*label: '廣告數據同步',\s*section: '設定'/.test(contextSrc),
  },
  {
    name: 'old Google Ads 同步 menu item removed',
    ok: !contextSrc.includes("label: 'Google Ads 同步'"),
  },
  {
    name: 'old Facebook Ads 同步 menu item removed',
    ok: !contextSrc.includes("label: 'Facebook Ads 同步'"),
  },
  {
    name: 'legacy hashes alias to ads-data-sync',
    ok: contextSrc.includes("sub === 'google-ads-sync' || sub === 'facebook-ads-sync'")
      && contextSrc.includes("return 'ads-data-sync'"),
  },
  {
    name: 'MarketingModule renders AdsDataSyncModule',
    ok: marketingSrc.includes("activeTab === 'ads-data-sync' && <AdsDataSyncModule")
      && !marketingSrc.includes('GoogleAdsSyncModule')
      && !marketingSrc.includes('FacebookAdsSyncModule'),
  },
  {
    name: 'sidebar still groups by section',
    ok: sidebarSrc.includes('subItem.section'),
  },
];

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
}
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log('All ads-data-sync route checks passed.');
}
