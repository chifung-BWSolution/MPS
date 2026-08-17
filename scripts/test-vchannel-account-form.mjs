import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contextSrc = readFileSync(path.join(root, 'src/context/AppContext.tsx'), 'utf8');
const videoModuleSrc = readFileSync(path.join(root, 'src/components/video/VideoModule.tsx'), 'utf8');
const channelsSrc = readFileSync(path.join(root, 'src/components/video/VideoChannelsList.tsx'), 'utf8');
const accountsSrc = readFileSync(path.join(root, 'src/components/video/VideoAccountsList.tsx'), 'utf8');

const checks = [
  {
    name: 'sidebar has 平台帳號 directly under 頻道設定',
    ok: /id: 'channels', label: '頻道設定', section: '設定'[\s\S]*id: 'accounts', label: '平台帳號', section: '設定'[\s\S]*id: 'login-methods'/.test(contextSrc),
  },
  {
    name: 'VideoModule routes accounts to VideoAccountsList',
    ok: videoModuleSrc.includes("resolvedTab === 'accounts' && <VideoAccountsList")
      && videoModuleSrc.includes("case 'accounts':"),
  },
  {
    name: 'channels page no longer has 平台帳號 tab switcher',
    ok: !channelsSrc.includes("tab === 'channels' ? '頻道主檔'")
      && !channelsSrc.includes("setActiveTab")
      && !channelsSrc.includes("activeTab === 'accounts'"),
  },
  {
    name: 'accounts page renders 平台帳號 heading and sortable table',
    ok: accountsSrc.includes('平台帳號')
      && accountsSrc.includes('ACCOUNT_SORT_COLUMNS')
      && accountsSrc.includes('共 {accounts.length} 條平台帳號'),
  },
];

const failed = checks.filter(c => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
}
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log('All video accounts route checks passed.');
}
