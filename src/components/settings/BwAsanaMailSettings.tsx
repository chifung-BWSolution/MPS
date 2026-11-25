import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Mail, Plus, RefreshCw, Save, Search, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

type Settings = {
  code: string;
  enabled: boolean;
  match_mode: 'phrase' | 'words';
  min_match_words: number;
  skip_subjects: string[];
  title_format: string;
  collaborator_gids: string[];
  not_before: string | null;
};

type MailJob = {
  id: string;
  subject: string | null;
  status: string;
  task_name: string | null;
  error: string | null;
  created_at: string;
};

type Route = {
  id: string;
  keyword: string;
  assignee_name: string;
  assignee_email: string;
  project_name: string;
  project_gid: string;
  enabled: boolean;
  sort_order: number;
};

type AsanaPerson = { gid: string; name: string; email: string };
type AsanaProject = { gid: string; name: string };
type GmailStatus = { connected?: boolean; login_hint?: string; error?: string };
type RouteFilter = 'all' | 'open' | 'blank';

const inputClass =
  'w-full min-h-11 text-[14px] border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600';

function personLabel(person: AsanaPerson): string {
  if (person.email && person.name) return `${person.email}（${person.name}）`;
  return person.email || person.name || '';
}

function routeReady(route: Route): boolean {
  return Boolean(route.keyword.trim() && route.assignee_email.trim() && route.project_gid.trim());
}

function projectKey(route: Route): string {
  const gid = route.project_gid.trim();
  if (gid) return gid;
  const name = route.project_name.trim();
  return name ? `name:${name}` : '';
}

function assigneeText(route: Route, people: AsanaPerson[]): { email: string; name: string } {
  const email = route.assignee_email.trim();
  const person = people.find((item) => item.email.toLowerCase() === email.toLowerCase());
  return { email, name: person?.name || '' };
}

function NameSearch<T extends { gid: string }>({
  items,
  labelOf,
  placeholder,
  emptyText,
  onPick,
}: {
  items: T[];
  labelOf: (item: T) => string;
  placeholder: string;
  emptyText: string;
  onPick: (item: T) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const matches = q ? items.filter((item) => labelOf(item).toLowerCase().includes(q)).slice(0, 8) : [];
  return (
    <div className="relative">
      <input
        className={inputClass}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && q && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-md">
          {matches.map((item) => (
            <button
              key={item.gid}
              type="button"
              className="block min-h-11 w-full px-3 py-2 text-left text-[14px] text-slate-900 hover:bg-slate-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(item);
                setQuery('');
                setOpen(false);
              }}
            >
              {labelOf(item)}
            </button>
          ))}
          {matches.length === 0 && <p className="px-3 py-2 text-[14px] text-slate-600">{emptyText}</p>}
        </div>
      )}
    </div>
  );
}

async function callFunction<T>(slug: string, body: Record<string, unknown>): Promise<T> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token || supabaseAnonKey;
  const res = await fetch(`${supabaseUrl}/functions/v1/${slug}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok || json.error) throw new Error(String(json.error || `${res.status} ${res.statusText}`));
  return json;
}

function Section({
  step,
  title,
  hint,
  tone,
  children,
}: {
  step: string;
  title: string;
  hint: string;
  tone: 'sky' | 'amber' | 'violet' | 'slate';
  children: ReactNode;
}) {
  const toneClass = {
    sky: 'border-sky-300 bg-sky-50',
    amber: 'border-amber-300 bg-amber-50',
    violet: 'border-violet-300 bg-violet-50',
    slate: 'border-slate-300 bg-slate-50',
  }[tone];
  const badgeClass = {
    sky: 'bg-sky-700 text-white',
    amber: 'bg-amber-700 text-white',
    violet: 'bg-violet-700 text-white',
    slate: 'bg-slate-700 text-white',
  }[tone];
  return (
    <section className={`rounded-md border p-4 sm:p-5 ${toneClass}`}>
      <div className="mb-4 flex items-start gap-3">
        <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-[13px] font-semibold ${badgeClass}`}>{step}</span>
        <div>
          <h2 className="text-[18px] font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-[14px] leading-6 text-slate-700">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function BwAsanaMailSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [people, setPeople] = useState<AsanaPerson[]>([]);
  const [projects, setProjects] = useState<AsanaProject[]>([]);
  const [directoryError, setDirectoryError] = useState('');
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [jobs, setJobs] = useState<MailJob[]>([]);
  const [routeFilter, setRouteFilter] = useState<RouteFilter>('all');
  const [projectFilter, setProjectFilter] = useState('');
  const [routeQuery, setRouteQuery] = useState('');

  const load = async () => {
    setLoading(true);
    const [settingsRes, routesRes, directory, gmailStatus] = await Promise.all([
      supabase.from('bw_asana_mail_settings').select('*').eq('code', 'bw').maybeSingle(),
      supabase.from('bw_asana_mail_routes').select('*').order('sort_order', { ascending: true }),
      callFunction<{ users?: AsanaPerson[]; projects?: AsanaProject[]; error?: string }>('sync-fcc-asana-mail', { action: 'users' }).catch((e: Error) => ({ error: e.message })),
      callFunction<GmailStatus>('gmail-fcc-oauth', { action: 'status', mailbox: 'bw' }).catch((e: Error) => ({ error: e.message })),
    ]);
    if (settingsRes.error) toast.error(settingsRes.error.message);
    if (routesRes.error) toast.error(routesRes.error.message);
    if (settingsRes.data) {
      const row = settingsRes.data as Settings;
      setSettings({
        ...row,
        enabled: row.enabled === true,
        match_mode: row.match_mode === 'words' ? 'words' : 'phrase',
        skip_subjects: row.skip_subjects || [],
        collaborator_gids: row.collaborator_gids || [],
        min_match_words: Number(row.min_match_words || 3),
        not_before: row.not_before || null,
      });
      setSavedEnabled(row.enabled === true);
    }
    const jobsRes = await supabase
      .from('asana_mail_jobs')
      .select('id, subject, status, task_name, error, created_at')
      .eq('rule_code', 'bw')
      .order('created_at', { ascending: false })
      .limit(8);
    if (jobsRes.error) toast.error(jobsRes.error.message);
    setJobs((jobsRes.data || []) as MailJob[]);
    setRoutes((routesRes.data || []) as Route[]);
    if (directory.error) {
      setDirectoryError(directory.error);
      setPeople([]);
      setProjects([]);
    } else {
      setDirectoryError('');
      setPeople(directory.users || []);
      setProjects(directory.projects || []);
    }
    setGmail(gmailStatus);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'mps-gmail-bw-oauth') return;
      if (event.data.ok) toast.success('BW Gmail 已連接');
      else toast.error(String(event.data.message || 'Gmail 授權失敗'));
      void callFunction<GmailStatus>('gmail-fcc-oauth', { action: 'status', mailbox: 'bw' })
        .then(setGmail)
        .catch((e: Error) => setGmail({ error: e.message }));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const updateRoute = (id: string, patch: Partial<Route>) => {
    setRoutes((current) => current.map((route) => (route.id === id ? { ...route, ...patch } : route)));
  };

  const save = async () => {
    if (!settings) return;
    const cleaned = routes.map((route, index) => ({ ...route, keyword: route.keyword.trim(), sort_order: index }));
    if (cleaned.some((route) => !route.keyword)) {
      toast.error('每一行都要有關鍵字');
      return;
    }
    setSaving(true);
    const skip_subjects = settings.skip_subjects.map((item) => item.trim()).filter(Boolean);
    const { error: settingsError } = await supabase.from('bw_asana_mail_settings').update({
      match_mode: settings.match_mode,
      min_match_words: Math.max(1, Number(settings.min_match_words) || 3),
      skip_subjects,
      title_format: settings.title_format.trim(),
      collaborator_gids: settings.collaborator_gids.map((gid) => gid.trim()).filter(Boolean),
      enabled: settings.enabled,
      ...(settings.enabled && !savedEnabled ? { not_before: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    }).eq('code', 'bw');
    if (settingsError) {
      setSaving(false);
      toast.error(settingsError.message);
      return;
    }
    const payload = cleaned.map((route) => {
      const person = people.find((item) => item.email.toLowerCase() === route.assignee_email.trim().toLowerCase());
      const storedName = route.assignee_name.includes('/') ? '' : route.assignee_name.trim();
      return {
        id: route.id,
        keyword: route.keyword,
        assignee_name: person?.name || storedName,
        assignee_email: route.assignee_email.trim(),
        project_name: route.project_name.trim(),
        project_gid: route.project_gid.trim(),
        enabled: route.enabled,
        sort_order: route.sort_order,
        updated_at: new Date().toISOString(),
      };
    });
    if (payload.length === 0) {
      const { error: deleteError } = await supabase.from('bw_asana_mail_routes').delete().gte('sort_order', 0);
      setSaving(false);
      if (deleteError) {
        toast.error(deleteError.message);
        return;
      }
    } else {
      const { error: upsertError } = await supabase.from('bw_asana_mail_routes').upsert(payload);
      if (upsertError) {
        setSaving(false);
        toast.error(upsertError.message);
        return;
      }
      const { error: deleteError } = await supabase
        .from('bw_asana_mail_routes')
        .delete()
        .not('id', 'in', `(${payload.map((route) => `"${route.id}"`).join(',')})`);
      setSaving(false);
      if (deleteError) {
        toast.error(deleteError.message);
        return;
      }
    }
    toast.success(settings.enabled ? '已儲存。之後收到的新郵件會自動開 task。' : '已儲存。自動開 task 已關閉。');
    await load();
  };

  const connect = async () => {
    setConnecting(true);
    try {
      const started = await callFunction<{ authorization_url: string }>('gmail-fcc-oauth', { action: 'start', mailbox: 'bw' });
      const popup = window.open(started.authorization_url, 'mps-gmail-bw-oauth', 'width=520,height=740');
      if (!popup) window.location.assign(started.authorization_url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  };

  const syncNow = async () => {
    if (!savedEnabled) {
      toast.error('請先打開自動開 task，再按儲存');
      return;
    }
    setSyncing(true);
    try {
      const result = await callFunction<{ created?: number; skipped?: number; error?: string }>('sync-bw-asana-mail', {});
      if (result.error) toast.error(result.error);
      else toast.success(`已檢查。新開 ${result.created ?? 0} 個 task，略過 ${result.skipped ?? 0} 封。`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  const readyCount = routes.filter(routeReady).length;
  const blankCount = routes.length - readyCount;
  const projectOptions = useMemo(() => {
    const grouped = new Map<string, { name: string; total: number; ready: number }>();
    for (const route of routes) {
      const key = projectKey(route);
      if (!key) continue;
      const current = grouped.get(key) || { name: route.project_name.trim() || '未命名專案', total: 0, ready: 0 };
      current.total += 1;
      if (routeReady(route)) current.ready += 1;
      grouped.set(key, current);
    }
    return [...grouped.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }, [routes]);
  const readyProjects = projectOptions.filter((project) => project.ready > 0);
  const incompleteProjects = projectOptions.filter((project) => project.ready === 0);
  const unassignedCount = routes.filter((route) => !projectKey(route)).length;
  const visibleRoutes = useMemo(() => {
    const needle = routeQuery.trim().toLowerCase();
    return routes.filter((route) => {
      if (routeFilter === 'open' && !routeReady(route)) return false;
      if (routeFilter === 'blank' && routeReady(route)) return false;
      if (projectFilter === '__none__' && projectKey(route)) return false;
      if (projectFilter && projectFilter !== '__none__' && projectKey(route) !== projectFilter) return false;
      if (!needle) return true;
      return [route.keyword, route.assignee_email, route.project_name].join(' ').toLowerCase().includes(needle);
    });
  }, [routes, routeFilter, projectFilter, routeQuery]);

  if (loading) return <p className="text-[14px] text-slate-600">載入中…</p>;
  if (!settings) return <p className="text-[14px] text-slate-600">尚未有 BW 規則。資料表更新後先可以核對。</p>;

  const loginHint = gmail?.login_hint || 'brandingworks.services@gmail.com';

  return (
    <div className="space-y-5 pb-24">
      <Section
        step="1"
        title="授權電郵"
        hint="用下面這個信箱登入。打開自動開 task 並儲存之後，每 5 分鐘檢查新郵件。只開儲存那一刻之後收到的 EmailMeForm，不會補開舊信。"
        tone="sky"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-md ${gmail?.connected ? 'bg-emerald-100' : 'bg-amber-100'}`}>
              <Mail size={18} className={gmail?.connected ? 'text-emerald-800' : 'text-amber-800'} />
            </div>
            <div>
              <p className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-slate-900">
                {gmail?.connected ? <CheckCircle2 size={16} className="text-emerald-700" /> : <XCircle size={16} className="text-amber-700" />}
                {gmail?.connected ? '已授權' : '未授權'}
              </p>
              <p className="text-[14px] text-slate-700">{loginHint}</p>
              <p className="text-[13px] text-slate-600">
                {savedEnabled ? '自動開 task 已啟用。只處理啟用之後的新郵件。' : '自動開 task 未啟用。打開下面的開關並儲存先會開始。'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={connecting}
            className="inline-flex min-h-11 items-center rounded-md bg-sky-700 px-4 text-[14px] font-medium text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {connecting ? '開啟中…' : gmail?.connected ? '重新授權' : '授權這個信箱'}
          </button>
        </div>
        {gmail?.error && <p className="mt-3 text-[14px] text-red-800">暫時未能查看授權狀態：{gmail.error}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-200 bg-white p-4">
          <label className="flex min-h-11 items-center gap-3 text-[15px] font-medium text-slate-900">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
            啟用自動開 task
          </label>
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={syncing || !savedEnabled}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-sky-300 bg-white px-3 text-[14px] text-sky-950 hover:bg-sky-100 disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : undefined} />
            {syncing ? '檢查中…' : '立即檢查郵件'}
          </button>
        </div>
        <p className="mt-2 text-[14px] leading-6 text-slate-700">
          未填負責人電郵或專案的查詢不會開。同事回覆和客人回覆都不會再開。
          {settings.enabled && !savedEnabled ? ' 這個開關要儲存之後先生效。' : ''}
        </p>
        {jobs.length > 0 && (
          <ul className="mt-3 space-y-2">
            {jobs.map((job) => (
              <li key={job.id} className="rounded-md border border-sky-200 bg-white px-3 py-2 text-[14px] text-slate-800">
                <span className="font-medium">{job.status === 'created' ? '已開 task' : job.status === 'error' ? '失敗' : '略過'}</span>
                <span className="mx-2 text-slate-400">·</span>
                {job.task_name || job.subject || '沒有主旨'}
                {job.error && job.status !== 'created' ? <span className="mt-1 block text-[13px] text-slate-600">{job.error}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        step="2"
        title="點樣對上查詢"
        hint="只看 EmailMeForm 寄出的郵件主旨。主旨包含某一行的關鍵字，就用該行的電郵同專案。"
        tone="amber"
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-amber-200 bg-white p-4">
            <p className="text-[14px] font-semibold text-slate-900">對上多於一行</p>
            <p className="mt-1 text-[14px] leading-6 text-slate-700">用最長嗰句。長度一樣，用主旨入面最先出現嗰句。</p>
          </div>
          <div className="rounded-md border border-amber-200 bg-white p-4">
            <p className="text-[14px] font-semibold text-slate-900">只收 EmailMeForm</p>
            <p className="mt-1 text-[14px] leading-6 text-slate-700">寄件人必須是 @emailmeform.com。同事回覆、客人回覆同一封信，即使主旨一樣，都不會再開。FC 都是同一條規則。</p>
          </div>
          <div className="rounded-md border border-amber-200 bg-white p-4">
            <p className="text-[14px] font-semibold text-slate-900">這幾種不會開</p>
            <p className="mt-1 text-[14px] leading-6 text-slate-700">不是 EmailMeForm 寄出、對不上關鍵字、未填負責人電郵、未選專案，或者主旨包含下面的略過字句。</p>
          </div>
          <div className="rounded-md border border-amber-200 bg-white p-4">
            <p className="text-[14px] font-semibold text-slate-900">開出來的 task</p>
            <p className="mt-1 text-[14px] leading-6 text-slate-700">標題只取主旨冒號前面的字，後面是姓名、電話、地址，中間用空格，不會把冒號抄進去。例如：[九龍]牆身工程查詢 - Ivy 9309 3186 九龍。內容一行一個欄位。到期日是當日。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="block text-[14px] font-medium text-slate-900">
            主旨有這些字就略過（一行一個）
            <textarea
              className={`${inputClass} mt-1 min-h-24`}
              value={settings.skip_subjects.join('\n')}
              onChange={(e) => setSettings({ ...settings, skip_subjects: e.target.value.split(/\r?\n/) })}
            />
          </label>
          <label className="block text-[14px] font-medium text-slate-900">
            Task 標題格式
            <input
              className={`${inputClass} mt-1`}
              value={settings.title_format}
              onChange={(e) => setSettings({ ...settings, title_format: e.target.value })}
            />
            <span className="mt-1 block font-normal leading-6 text-slate-600">郵件主旨的冒號不會進入 task 標題，同 FC 一樣只留空格。</span>
          </label>
        </div>
        <details className="mt-4 rounded-md border border-amber-200 bg-white p-4">
          <summary className="cursor-pointer text-[14px] font-medium text-slate-900">進階：改配對方式</summary>
          <fieldset className="mt-3 space-y-3">
            <legend className="text-[14px] text-slate-700">平時用第一個。第二個會令短關鍵字開不到 task。</legend>
            <label className="flex min-h-11 items-start gap-3 text-[14px] text-slate-900">
              <input
                type="radio"
                className="mt-1 h-4 w-4"
                checked={settings.match_mode === 'phrase'}
                onChange={() => setSettings({ ...settings, match_mode: 'phrase' })}
              />
              <span>關鍵字成句要出現喺主旨。</span>
            </label>
            <label className="flex min-h-11 items-start gap-3 text-[14px] text-slate-900">
              <input
                type="radio"
                className="mt-1 h-4 w-4"
                checked={settings.match_mode === 'words'}
                onChange={() => setSettings({ ...settings, match_mode: 'words' })}
              />
              <span>沿用舊 Zap：至少對上指定字數。多數中文關鍵字不足 3 個字，開這個會開少好多。</span>
            </label>
            <label className="block max-w-xs text-[14px] font-medium text-slate-900">
              最少對上字數
              <input
                type="number"
                min={1}
                className={`${inputClass} mt-1`}
                value={settings.min_match_words}
                onChange={(e) => setSettings({ ...settings, min_match_words: Number(e.target.value) })}
              />
            </label>
          </fieldset>
        </details>
      </Section>

      <Section
        step="3"
        title="每封都加的人"
        hint="這幾個人會加在每一個 task。同下面每一行的負責人電郵是兩件事。"
        tone="violet"
      >
        <div className="flex flex-wrap gap-2">
          {settings.collaborator_gids.map((gid) => {
            const person = people.find((item) => item.gid === gid);
            return (
              <span key={gid} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-violet-200 bg-white px-3 text-[14px] text-slate-900">
                {person ? personLabel(person) : '未能對上電郵'}
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-violet-100 hover:text-slate-900"
                  aria-label="移除這個人"
                  onClick={() => setSettings({ ...settings, collaborator_gids: settings.collaborator_gids.filter((item) => item !== gid) })}
                >
                  <X size={14} />
                </button>
              </span>
            );
          })}
        </div>
        <div className="mt-3 max-w-xl">
          <label className="mb-1 block text-[14px] font-medium text-slate-900">加入</label>
          <NameSearch
            items={people}
            labelOf={personLabel}
            placeholder="搜尋電郵或姓名"
            emptyText={directoryError || '找不到這個人'}
            onPick={(person) => {
              if (settings.collaborator_gids.includes(person.gid)) return;
              setSettings({ ...settings, collaborator_gids: [...settings.collaborator_gids, person.gid] });
            }}
          />
        </div>
      </Section>

      <Section
        step="4"
        title="每種查詢"
        hint="藍色是收 task 的電郵。綠色是 Asana 專案。琥珀色的卡片是未填完，未填就不會開。"
        tone="slate"
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {([
            ['all', `全部 ${routes.length}`],
            ['blank', `未填完 ${blankCount}`],
            ['open', `已填好 ${readyCount}`],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={routeFilter === id}
              onClick={() => setRouteFilter(id)}
              className={`min-h-11 rounded-md border px-3 text-[14px] font-medium ${routeFilter === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-800'}`}
            >
              {label}
            </button>
          ))}
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">搜尋關鍵字、電郵或專案</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className={`${inputClass} pl-9`}
              value={routeQuery}
              placeholder="搜尋關鍵字、電郵或專案"
              onChange={(e) => setRouteQuery(e.target.value)}
            />
          </label>
        </div>
        <label className="mb-4 block max-w-xl text-[14px] font-medium text-slate-900">
          用 Asana 專案篩選
          <span className="ml-2 font-normal text-slate-600">已有 {readyProjects.length} 個專案可以開 task</span>
          <select
            className={`${inputClass} mt-1`}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">全部專案</option>
            {readyProjects.length > 0 && (
              <optgroup label="已可以開 task">
                {readyProjects.map((project) => (
                  <option key={project.key} value={project.key}>
                    {project.name}（{project.ready} 行）
                  </option>
                ))}
              </optgroup>
            )}
            {incompleteProjects.length > 0 && (
              <optgroup label="已選專案，但未填完">
                {incompleteProjects.map((project) => (
                  <option key={project.key} value={project.key}>
                    {project.name}（{project.total} 行）
                  </option>
                ))}
              </optgroup>
            )}
            <option value="__none__">未選專案（{unassignedCount} 行）</option>
          </select>
        </label>
        <div className="space-y-3">
          {visibleRoutes.map((route) => {
            const ready = routeReady(route);
            const assignee = assigneeText(route, people);
            return (
              <article
                key={route.id}
                className={`rounded-md border-2 p-4 ${ready ? 'border-emerald-300 bg-white' : 'border-amber-400 bg-amber-50'}`}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className={`inline-flex items-center gap-1.5 text-[14px] font-semibold ${ready ? 'text-emerald-900' : 'text-amber-950'}`}>
                    {ready ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    {ready ? '已填好，可以開' : '未填完，不會開'}
                  </p>
                  <button
                    type="button"
                    className="min-h-11 rounded-md px-3 text-[14px] text-slate-700 hover:bg-white"
                    onClick={() => setRoutes((current) => current.filter((item) => item.id !== route.id))}
                  >
                    移除這行
                  </button>
                </div>
                <label className="block text-[14px] font-medium text-slate-900">
                  主旨包含這句
                  <input className={`${inputClass} mt-1`} value={route.keyword} onChange={(e) => updateRoute(route.id, { keyword: e.target.value })} />
                </label>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-md border border-sky-300 bg-sky-50 p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-semibold text-sky-900">負責人電郵</p>
                        <p className="mt-1 break-all text-[16px] font-semibold text-slate-900">{assignee.email || '未填電郵'}</p>
                        {assignee.name && <p className="text-[13px] text-slate-700">{assignee.name}</p>}
                      </div>
                      {assignee.email && (
                        <button
                          type="button"
                          className="min-h-11 shrink-0 rounded-md px-2 text-[13px] text-sky-900 hover:bg-sky-100"
                          onClick={() => updateRoute(route.id, { assignee_name: '', assignee_email: '' })}
                        >
                          清除
                        </button>
                      )}
                    </div>
                    <NameSearch
                      items={people}
                      labelOf={personLabel}
                      placeholder="搜尋電郵，揀一個負責人"
                      emptyText={directoryError || '找不到這個人'}
                      onPick={(person) => updateRoute(route.id, { assignee_name: person.name, assignee_email: person.email })}
                    />
                  </div>
                  <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-semibold text-emerald-900">Asana 專案</p>
                        <p className="mt-1 text-[16px] font-semibold text-slate-900">{route.project_name || '未選專案'}</p>
                      </div>
                      {route.project_gid && (
                        <button
                          type="button"
                          className="min-h-11 shrink-0 rounded-md px-2 text-[13px] text-emerald-900 hover:bg-emerald-100"
                          onClick={() => updateRoute(route.id, { project_name: '', project_gid: '' })}
                        >
                          清除
                        </button>
                      )}
                    </div>
                    <NameSearch
                      items={projects}
                      labelOf={(project) => project.name}
                      placeholder="搜尋專案名稱"
                      emptyText={directoryError || '找不到這個專案'}
                      onPick={(project) => updateRoute(route.id, { project_name: project.name, project_gid: project.gid })}
                    />
                  </div>
                </div>
                <label className="mt-3 flex min-h-11 items-center gap-3 text-[14px] text-slate-900">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={route.enabled}
                    onChange={(e) => updateRoute(route.id, { enabled: e.target.checked })}
                  />
                  這行啟用。未填電郵或專案都一樣不會開。
                </label>
              </article>
            );
          })}
          {visibleRoutes.length === 0 && <p className="rounded-md border border-slate-200 bg-white p-4 text-[14px] text-slate-700">沒有符合的查詢行。</p>}
        </div>
        <button
          type="button"
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[14px] text-slate-900 hover:bg-slate-100"
          onClick={() => setRoutes((current) => [...current, {
            id: crypto.randomUUID(),
            keyword: '',
            assignee_name: '',
            assignee_email: '',
            project_name: '',
            project_gid: '',
            enabled: true,
            sort_order: current.length,
          }])}
        >
          <Plus size={16} /> 加一種查詢
        </button>
      </Section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-300 bg-white/95 p-3 shadow-md">
        <p className="text-[14px] text-slate-700">已填好 {readyCount} 行，未填完 {blankCount} 行。{settings.enabled ? '儲存後，新郵件會自動開 task。' : '未啟用自動開 task。'}</p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-teal-700 px-4 text-[14px] font-medium text-white hover:bg-teal-800 disabled:opacity-60"
        >
          <Save size={16} /> {saving ? '儲存中…' : '儲存規則'}
        </button>
      </div>
    </div>
  );
}
