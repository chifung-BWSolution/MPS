import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contextSrc = readFileSync(path.join(root, 'src/context/AppContext.tsx'), 'utf8');
const videoModuleSrc = readFileSync(path.join(root, 'src/components/video/VideoModule.tsx'), 'utf8');
const channelsSrc = readFileSync(path.join(root, 'src/components/video/VideoChannelsList.tsx'), 'utf8');
const accountsSrc = readFileSync(path.join(root, 'src/components/video/VideoAccountsList.tsx'), 'utf8');
const formModalSrc = readFileSync(path.join(root, 'src/components/video/VchannelAccountFormModal.tsx'), 'utf8');
const pickerSrc = readFileSync(path.join(root, 'src/components/video/VchannelLoginMethodPicker.tsx'), 'utf8');
const formLibSrc = readFileSync(path.join(root, 'src/lib/vchannelAccountForm.ts'), 'utf8');
const migrationSrc = readFileSync(path.join(root, 'supabase/migrations/20260817020000_vchannel_accounts_login_methods_join_is_active.sql'), 'utf8');

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
  {
    name: 'legacy 登入方式 stays a text field labeled as reference',
    ok: formModalSrc.includes('登入方式（參考）')
      && formModalSrc.includes('form.loginMethod')
      && !/<input type="checkbox"/.test(formModalSrc),
  },
  {
    name: 'real 登入方式 picker sits before 備註 and supports search plus quick create',
    ok: /登入方式[\s\S]*VchannelLoginMethodPicker[\s\S]*備註/.test(formModalSrc)
      && pickerSrc.includes('搜尋並選擇登入方式')
      && pickerSrc.includes('快速新增登入方式')
      && pickerSrc.includes('新增並選取'),
  },
  {
    name: '備註 is a textarea and FeedHive / is_active use Switch',
    ok: formModalSrc.includes('<Textarea')
      && formModalSrc.includes('FeedHive 統一管理')
      && formModalSrc.includes('<Switch')
      && formModalSrc.includes('form.isActive')
      && !formModalSrc.includes('type="checkbox"'),
  },
  {
    name: 'listing shows linked login methods and is_active toggle',
    ok: accountsSrc.includes('linkedLoginMethods')
      && accountsSrc.includes('toggleAccountActive')
      && accountsSrc.includes('acc.isActive ? \'啟用\' : \'停用\''),
  },
  {
    name: 'form payload and join-table migration cover login methods and is_active',
    ok: formLibSrc.includes('loginMethodIds')
      && formLibSrc.includes('isActive: true')
      && migrationSrc.includes('vchannel_account_login_methods')
      && migrationSrc.includes('is_active'),
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
