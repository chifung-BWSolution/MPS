import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contextSrc = readFileSync(path.join(root, 'src/context/AppContext.tsx'), 'utf8');
const websiteSrc = readFileSync(path.join(root, 'src/components/website/WebsiteModule.tsx'), 'utf8');
const setupSrc = readFileSync(path.join(root, 'docs/ga4-setup.md'), 'utf8');

const checks = [
  {
    name: 'website menu has 網站流量',
    ok: /id: 'traffic',\s*label: '網站流量'/.test(contextSrc),
  },
  {
    name: 'WebsiteModule renders Ga4TrafficModule',
    ok: websiteSrc.includes("case 'traffic':") && websiteSrc.includes('<Ga4TrafficModule'),
  },
  {
    name: 'website detail has 流量 tab',
    ok: websiteSrc.includes("id: 'traffic', label: '網站流量'") && websiteSrc.includes('<WebsiteTrafficTab'),
  },
  {
    name: 'setup doc mentions chifung.login@gmail.com and secrets',
    ok:
      setupSrc.includes('chifung.login@gmail.com') &&
      setupSrc.includes('GOOGLE_GA4_REFRESH_TOKEN') &&
      setupSrc.includes('Google Analytics Data API'),
  },
];

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
}
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log('All GA4 traffic route checks passed.');
}
