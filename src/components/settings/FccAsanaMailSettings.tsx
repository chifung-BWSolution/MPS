import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, Mail, RefreshCw, Save, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

type MailRule = {
  code: string;
  enabled: boolean;
  gmail_address: string;
  gmail_label_name: string;
  assignee_gid: string;
  collaborator_gids: string[];
  lunch_project_gid: string;
  lunch_title_prefix: string;
  catering_project_gid: string;
  catering_title_prefix: string;
  fcp_project_gid: string;
  fcp_title_prefix: string;
  consulting_project_gid: string;
  consulting_title_prefix: string;
  consulting_assignee_gid: string;
};

type MailJob = {
  id: string;
  subject: string | null;
  received_on: string | null;
  status: string;
  task_name: string | null;
  notes: string | null;
  asana_task_gid: string | null;
  error: string | null;
  created_at: string;
};

type GmailStatus = {
  connected?: boolean;
  login_hint?: string;
  redirect_uri?: string;
  error?: string;
};

type AsanaPerson = {
  gid: string;
  name: string;
  email: string;
};

type AsanaProject = {
  gid: string;
  name: string;
};

const inputClass =
  'w-full text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500';

const JOB_PAGE_SIZE = 10;

const JOB_STATUS_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'created', label: '已開 task' },
  { id: 'skipped', label: '略過' },
  { id: 'error', label: '失敗' },
  { id: 'processing', label: '處理中' },
] as const;

function personLabel(person: AsanaPerson): string {
  if (person.email && person.name) return `${person.email}（${person.name}）`;
  return person.email || person.name || person.gid;
}

type TaskStory = {
  gid: string;
  at: string;
  by: string;
  subtype: string;
  label: string;
  text: string;
};

type TaskActivity = {
  completed: boolean;
  assignee: string;
  projects: Array<{ name: string; section: string }>;
  stories: TaskStory[];
  error?: string;
};

function jobStatusLabel(status: string): string {
  if (status === 'created') return '已開 task';
  if (status === 'skipped') return '略過';
  if (status === 'error') return '失敗';
  if (status === 'processing') return '處理中';
  return status;
}

function jobStatusClass(status: string): string {
  if (status === 'created') return 'bg-teal-100 text-teal-900';
  if (status === 'error') return 'bg-amber-100 text-amber-950';
  if (status === 'processing') return 'bg-sky-100 text-sky-950';
  return 'bg-slate-100 text-slate-700';
}

function jobAccent(status: string): string {
  if (status === 'created') return 'border-l-teal-500';
  if (status === 'error') return 'border-l-amber-500';
  if (status === 'processing') return 'border-l-sky-500';
  return 'border-l-slate-300';
}

function storyTone(subtype: string): { card: string; badge: string } {
  if (subtype === 'comment_added') return { card: 'border-teal-200 bg-teal-50', badge: 'bg-teal-200 text-teal-950' };
  if (subtype === 'added_to_project' || subtype === 'removed_from_project' || subtype === 'section_changed') {
    return { card: 'border-violet-200 bg-violet-50', badge: 'bg-violet-200 text-violet-950' };
  }
  if (subtype === 'marked_complete' || subtype === 'marked_incomplete') {
    return { card: 'border-emerald-200 bg-emerald-50', badge: 'bg-emerald-200 text-emerald-950' };
  }
  if (subtype === 'assigned' || subtype === 'unassigned' || subtype === 'follower_added' || subtype === 'follower_removed') {
    return { card: 'border-sky-200 bg-sky-50', badge: 'bg-sky-200 text-sky-950' };
  }
  return { card: 'border-slate-200 bg-slate-50', badge: 'bg-slate-200 text-slate-800' };
}

function formatHkt(iso: string): string {
  return new Intl.DateTimeFormat('zh-HK', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function formatReceived(date: string | null): string {
  if (!date) return '';
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return `${day}/${month}/${year}`;
}

function NameSearch<T extends { gid: string }>({
  items,
  labelOf,
  exclude,
  placeholder,
  emptyText,
  onPick,
}: {
  items: T[];
  labelOf: (item: T) => string;
  exclude: string[];
  placeholder: string;
  emptyText: string;
  onPick: (item: T) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const q = query.trim().toLowerCase();
  const matches = q
    ? items.filter((item) => !exclude.includes(item.gid) && labelOf(item).toLowerCase().includes(q)).slice(0, 8)
    : [];
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
        <div className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-md border border-border bg-white shadow-sm">
          {matches.map((item) => (
            <button
              key={item.gid}
              type="button"
              className="block w-full px-3 py-2 text-left text-[13px] text-foreground hover:bg-muted/40"
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
          {matches.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-muted-foreground">{emptyText}</p>
          )}
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

export function FccAsanaMailSettings({ panel = 'all' }: { panel?: 'all' | 'rules' | 'records' | 'errors' } = {}) {
  const [rule, setRule] = useState<MailRule | null>(null);
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [people, setPeople] = useState<AsanaPerson[]>([]);
  const [projects, setProjects] = useState<AsanaProject[]>([]);
  const [projectError, setProjectError] = useState('');
  const [creator, setCreator] = useState<{ name: string; email: string } | null>(null);
  const [peopleError, setPeopleError] = useState('');
  const [jobs, setJobs] = useState<MailJob[]>([]);
  const [jobStatus, setJobStatus] = useState<'all' | 'created' | 'skipped' | 'error' | 'processing'>(panel === 'errors' ? 'error' : 'all');
  const [jobQuery, setJobQuery] = useState('');
  const [jobDraft, setJobDraft] = useState('');
  const [jobPage, setJobPage] = useState(0);
  const [jobTotal, setJobTotal] = useState(0);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [activity, setActivity] = useState<Record<string, TaskActivity>>({});
  const [activityLoading, setActivityLoading] = useState<string | null>(null);
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadJobs = async (
    status: 'all' | 'created' | 'skipped' | 'error' | 'processing',
    query: string,
    page: number,
  ) => {
    setJobsLoading(true);
    const needle = query.replace(/[%_,]/g, ' ').trim();
    const from = page * JOB_PAGE_SIZE;
    let request = supabase
      .from('asana_mail_jobs')
      .select('id, subject, received_on, status, task_name, notes, asana_task_gid, error, created_at', { count: 'exact' })
      .eq('rule_code', 'fcc')
      .not('status', 'in', '(unmatched,ignored)')
      .order('created_at', { ascending: false });
    if (status !== 'all') request = request.eq('status', status);
    if (needle) {
      request = request.or(`subject.ilike.%${needle}%,task_name.ilike.%${needle}%,notes.ilike.%${needle}%,error.ilike.%${needle}%`);
    }
    const { data, error, count } = await request.range(from, from + JOB_PAGE_SIZE - 1);
    if (error) toast.error(error.message);
    const total = count || 0;
    const lastPage = Math.max(0, Math.ceil(total / JOB_PAGE_SIZE) - 1);
    if (page > lastPage) {
      setJobPage(lastPage);
      setJobsLoading(false);
      await loadJobs(status, query, lastPage);
      return;
    }
    setJobs((data || []) as MailJob[]);
    setJobTotal(total);
    setJobsLoading(false);
  };

  const load = async () => {
    setLoading(true);
    const [{ data, error }, status, directory] = await Promise.all([
      supabase.from('asana_mail_rules').select('*').eq('code', 'fcc').maybeSingle(),
      callFunction<GmailStatus>('gmail-fcc-oauth', { action: 'status' }).catch((e: Error) => ({ error: e.message })),
      callFunction<{ users?: AsanaPerson[]; projects?: AsanaProject[]; projectError?: string; creator?: { name: string; email: string } | null }>('sync-fcc-asana-mail', { action: 'users' }).catch((e: Error) => ({ error: e.message })),
    ]);
    if (error) toast.error(error.message);
    if (data) {
      const next = data as MailRule;
      next.fcp_project_gid = next.fcp_project_gid || '';
      next.fcp_title_prefix = next.fcp_title_prefix || 'FCP';
      next.consulting_project_gid = next.consulting_project_gid || '';
      next.consulting_title_prefix = next.consulting_title_prefix || 'FC Consulting Marketing';
      next.consulting_assignee_gid = next.consulting_assignee_gid || '';
      setRule(next);
      setCollaborators((next.collaborator_gids || []).map((gid) => gid.trim()).filter(Boolean));
    }
    if ('error' in directory && directory.error) {
      setPeopleError(directory.error);
      setPeople([]);
      setProjects([]);
      setProjectError(directory.error);
      setCreator(null);
    } else {
      setPeopleError('');
      setPeople('users' in directory ? directory.users || [] : []);
      setProjects('projects' in directory ? directory.projects || [] : []);
      setProjectError('projectError' in directory ? directory.projectError || '' : '');
      setCreator('creator' in directory ? directory.creator || null : null);
    }
    setGmail(status);
    setLoading(false);
  };

  useEffect(() => {
    void loadJobs(jobStatus, jobQuery, jobPage);
  }, [jobStatus, jobQuery, jobPage]);

  useEffect(() => {
    void load();
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'mps-gmail-fcc-oauth') return;
      if (event.data.ok) toast.success('Gmail 已連接');
      else toast.error(String(event.data.message || 'Gmail 授權失敗'));
      void load();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const save = async () => {
    if (!rule) return;
    setSaving(true);
    const collaborator_gids = collaborators.map((gid) => gid.trim()).filter(Boolean);
    const { error } = await supabase.from('asana_mail_rules').update({
      enabled: rule.enabled,
      assignee_gid: rule.assignee_gid.trim(),
      collaborator_gids,
      lunch_project_gid: rule.lunch_project_gid.trim(),
      lunch_title_prefix: rule.lunch_title_prefix.trim(),
      catering_project_gid: rule.catering_project_gid.trim(),
      catering_title_prefix: rule.catering_title_prefix.trim(),
      fcp_project_gid: rule.fcp_project_gid.trim(),
      fcp_title_prefix: rule.fcp_title_prefix.trim(),
      consulting_project_gid: rule.consulting_project_gid.trim(),
      consulting_title_prefix: rule.consulting_title_prefix.trim(),
      consulting_assignee_gid: rule.consulting_assignee_gid.trim(),
      updated_at: new Date().toISOString(),
    }).eq('code', 'fcc');
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('已儲存 FC 查詢設定');
    await load();
  };

  const connect = async () => {
    try {
      const started = await callFunction<{ authorization_url: string }>('gmail-fcc-oauth', { action: 'start' });
      const popup = window.open(started.authorization_url, 'mps-gmail-fcc-oauth', 'width=520,height=740');
      if (!popup) window.location.assign(started.authorization_url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const openJob = async (job: MailJob) => {
    const next = openJobId === job.id ? null : job.id;
    setOpenJobId(next);
    if (!next || !job.asana_task_gid || activity[job.asana_task_gid]) return;
    const taskGid = job.asana_task_gid;
    setActivityLoading(taskGid);
    try {
      const result = await callFunction<TaskActivity>('sync-fcc-asana-mail', { action: 'activity', taskGid });
      setActivity((current) => ({ ...current, [taskGid]: result }));
    } catch (e) {
      setActivity((current) => ({ ...current, [taskGid]: { completed: false, assignee: '', projects: [], stories: [], error: e instanceof Error ? e.message : String(e) } }));
    } finally {
      setActivityLoading((current) => current === taskGid ? null : current);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const result = await callFunction<{ created?: number; skipped?: number; error?: string }>('sync-fcc-asana-mail', {});
      if (result.error) toast.error(result.error);
      else toast.success(`已處理。新開 ${result.created ?? 0} 個 task，略過 ${result.skipped ?? 0} 封。`);
      await load();
      await loadJobs(jobStatus, jobQuery, jobPage);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  const showRules = panel === 'all' || panel === 'rules';
  const showJobs = panel !== 'rules';
  if (showRules && loading && !rule) {
    return <p className="text-[13px] text-muted-foreground">載入 FC 查詢設定…</p>;
  }
  if (showRules && !rule) {
    return <p className="text-[13px] text-muted-foreground">找不到 FCC 規則。請先套用資料庫 migration。</p>;
  }

  return (
    <div className="space-y-5">
      {showRules && rule && (
      <>
      <section className="rounded-md border border-teal-300 bg-teal-50 p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-teal-700 px-2 text-[13px] font-semibold text-white">1</span>
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900">授權電郵</h2>
            <p className="mt-1 text-[14px] leading-6 text-slate-700">讀 {rule.gmail_address} 的「{rule.gmail_label_name}」。只有 EmailMeForm 寄出的信先會開 task。同事回覆或客人回覆都不會再開。</p>
          </div>
        </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-teal-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-md flex items-center justify-center ${gmail?.connected ? 'bg-teal-50' : 'bg-amber-50'}`}>
            <Mail size={18} className={gmail?.connected ? 'text-teal-600' : 'text-amber-600'} />
          </div>
          <div>
            <p className="text-[14px] font-medium inline-flex items-center gap-1.5">
              {gmail?.connected ? <CheckCircle2 size={14} className="text-teal-600" /> : <XCircle size={14} className="text-amber-600" />}
              {gmail?.connected ? 'Gmail 已連接' : '尚未連接 Gmail'}
            </p>
            <p className="text-[12px] text-muted-foreground">請用 {gmail?.login_hint || rule.gmail_address} 授權，只讀郵件。</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void connect()} className="inline-flex min-h-11 items-center rounded-md bg-teal-700 px-4 text-[14px] font-medium text-white hover:bg-teal-800">
            {gmail?.connected ? '重新授權' : '授權這個信箱'}
          </button>
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={syncing}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-teal-300 bg-white px-3 text-[14px] text-teal-950 hover:bg-teal-100 disabled:opacity-60"
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : undefined} />
            {syncing ? '檢查中…' : '立即檢查郵件'}
          </button>
        </div>
      </div>
      <label className="mt-4 flex min-h-11 items-center gap-3 text-[15px] font-medium text-slate-900">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={rule.enabled}
          onChange={(e) => setRule({ ...rule, enabled: e.target.checked })}
        />
        啟用自動開 task
      </label>
      <p className="mt-2 text-[14px] leading-6 text-slate-700">
        正餐或小食到會開 Catering，只有飯盒或下午茶開 Lunch Box。FCP 活動策劃同開店查詢用下面各自的專案。BWL、禮品同療程唔會開。
        {creator?.email ? ` 開 task 的 Asana 帳號是 ${creator.email}。` : ' 開 task 的 Asana 帳號未設定，暫停期間不會再開。'}
      </p>
      </section>

      <section className="rounded-md border border-sky-300 bg-sky-50 p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-sky-700 px-2 text-[13px] font-semibold text-white">2</span>
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900">負責人同協作者</h2>
            <p className="mt-1 text-[14px] leading-6 text-slate-700">到會、飯盒同 FCP 用同一個負責人。開店查詢可以另外指定。協作者會加進每一個新 task。</p>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-sky-300 bg-white p-3">
            <p className="text-[13px] font-semibold text-sky-900">負責人</p>
            <div className="mt-1 space-y-1">
              <p className="text-[13px] text-foreground min-h-5">
                {people.find((person) => person.gid === rule.assignee_gid)
                  ? personLabel(people.find((person) => person.gid === rule.assignee_gid) as AsanaPerson)
                  : rule.assignee_gid ? '未能對上 Gmail' : '未選擇'}
              </p>
              <NameSearch
                items={people}
                labelOf={personLabel}
                exclude={rule.assignee_gid ? [rule.assignee_gid] : []}
                placeholder="搜尋 Gmail 或姓名"
                emptyText={peopleError || '找不到這個人'}
                onPick={(person) => setRule({ ...rule, assignee_gid: person.gid })}
              />
            </div>
          </div>
          <div className="rounded-md border border-sky-300 bg-white p-3">
            <p className="text-[13px] font-semibold text-sky-900">協作者</p>
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {collaborators.map((gid) => {
                  const person = people.find((item) => item.gid === gid);
                  return (
                    <span key={gid} className="inline-flex min-h-11 items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 text-[14px] text-slate-900">
                      {person ? personLabel(person) : '未能對上 Gmail'}
                      <button
                        type="button"
                        className="inline-flex h-11 w-8 items-center justify-center text-slate-600 hover:text-slate-900"
                        onClick={() => setCollaborators((current) => current.filter((item) => item !== gid))}
                        aria-label="移除協作者"
                      >
                        <X size={14} />
                      </button>
                    </span>
                  );
                })}
                {collaborators.length === 0 && <span className="text-[14px] text-slate-700">未加入協作者</span>}
              </div>
              <NameSearch
                items={people}
                labelOf={personLabel}
                exclude={collaborators}
                placeholder="搜尋後加入協作者"
                emptyText={peopleError || '找不到這個人'}
                onPick={(person) => setCollaborators((current) => current.includes(person.gid) ? current : [...current, person.gid])}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-emerald-300 bg-emerald-50 p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-emerald-700 px-2 text-[13px] font-semibold text-white">3</span>
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900">四種查詢</h2>
            <p className="mt-1 text-[14px] leading-6 text-slate-700">每種查詢一張卡。未選專案就不會開。標題是 task 名稱前面那截。</p>
          </div>
        </div>
        <div className="space-y-3">
          {([
            ['Lunch Box', '只有飯盒或下午茶', 'lunch_project_gid', 'lunch_title_prefix'],
            ['Catering', '正餐或小食到會', 'catering_project_gid', 'catering_title_prefix'],
            ['FCP', 'FCP 活動策劃', 'fcp_project_gid', 'fcp_title_prefix'],
            ['Consulting', '開店預約同開店說明會', 'consulting_project_gid', 'consulting_title_prefix'],
          ] as const).map(([title, hint, projectKey, prefixKey]) => {
            const projectGid = rule[projectKey];
            const ready = Boolean(projectGid.trim() && rule[prefixKey].trim());
            return (
              <article key={title} className={`rounded-md border-2 bg-white p-4 ${ready ? 'border-emerald-300' : 'border-amber-400'}`}>
                <p className={`mb-3 inline-flex items-center gap-1.5 text-[14px] font-semibold ${ready ? 'text-emerald-900' : 'text-amber-950'}`}>
                  {ready ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  {title} · {ready ? '已填好，可以開' : '未填完，不會開'}
                </p>
                <p className="mb-3 text-[14px] text-slate-700">{hint}</p>
                <label className="block text-[14px] font-medium text-slate-900">
                  標題
                  <input className={`${inputClass} mt-1 min-h-11 text-[14px]`} value={rule[prefixKey]} onChange={(e) => setRule({ ...rule, [prefixKey]: e.target.value })} />
                </label>
                <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3">
                  <p className="text-[13px] font-semibold text-emerald-900">Asana 專案</p>
                  <p className="mt-1 text-[16px] font-semibold text-slate-900">{projects.find((project) => project.gid === projectGid)?.name || (projectGid ? '未能對上專案名稱' : '未選專案')}</p>
                  <div className="mt-2">
                    <NameSearch
                      items={projects}
                      labelOf={(project) => project.name}
                      exclude={projectGid ? [projectGid] : []}
                      placeholder="搜尋專案名稱"
                      emptyText={projectError || '找不到這個專案'}
                      onPick={(project) => setRule({ ...rule, [projectKey]: project.gid })}
                    />
                  </div>
                </div>
              </article>
            );
          })}
          <article className="rounded-md border-2 border-sky-300 bg-white p-4">
            <p className="mb-3 text-[14px] font-semibold text-sky-950">Consulting 負責人</p>
            <p className="text-[16px] font-semibold text-slate-900">
              {people.find((person) => person.gid === rule.consulting_assignee_gid) ? personLabel(people.find((person) => person.gid === rule.consulting_assignee_gid)!) : (rule.consulting_assignee_gid ? '未能對上 Gmail' : '未選擇，開店查詢用上面的負責人')}
            </p>
            <div className="mt-2">
              <NameSearch
                items={people}
                labelOf={personLabel}
                exclude={rule.consulting_assignee_gid ? [rule.consulting_assignee_gid] : []}
                placeholder="搜尋負責人"
                emptyText={peopleError || '找不到這個人'}
                onPick={(person) => setRule({ ...rule, consulting_assignee_gid: person.gid })}
              />
            </div>
          </article>
        </div>
      </section>
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-3 rounded-md border border-slate-300 bg-white/95 p-3 shadow-md">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-teal-700 px-4 text-[14px] font-medium text-white hover:bg-teal-800 disabled:opacity-60"
        >
          <Save size={16} />
          {saving ? '儲存中…' : '儲存規則'}
        </button>
      </div>
      </>
      )}

      {showJobs && (
      <div className="bg-white border border-border/50 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50">
          <p className="text-[13px] font-medium">{panel === 'errors' ? '失敗' : '最近處理'}</p>
          <p className="text-[12px] text-muted-foreground">點一行先展開。左邊時間是系統處理時間，收信是郵件真正收到的日子。藍底是郵件，綠底是 Asana。</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {panel !== 'errors' && JOB_STATUS_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={`rounded-md px-2.5 py-1 text-[12px] ${jobStatus === filter.id ? 'bg-teal-700 text-white' : 'border border-border text-foreground hover:bg-muted/40'}`}
                onClick={() => {
                  setJobStatus(filter.id);
                  setJobPage(0);
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setJobPage(0);
              setJobQuery(jobDraft.trim());
            }}
          >
            <input
              className={`${inputClass} min-w-0 flex-1`}
              value={jobDraft}
              placeholder="搜尋主旨、task 標題或郵件內容"
              onChange={(event) => setJobDraft(event.target.value)}
            />
            <button type="submit" className="h-9 rounded-md border border-border px-3 text-[13px] hover:bg-muted/40">搜尋</button>
          </form>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
            <p>{jobsLoading ? '載入中…' : (jobTotal === 0 ? '0 筆' : `第 ${jobPage * JOB_PAGE_SIZE + 1}–${Math.min(jobTotal, (jobPage + 1) * JOB_PAGE_SIZE)} 筆，共 ${jobTotal} 筆`)}</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="h-8 rounded-md border border-border px-2.5 text-foreground hover:bg-muted/40 disabled:opacity-40"
                disabled={jobPage === 0 || jobsLoading}
                onClick={() => setJobPage((page) => Math.max(0, page - 1))}
              >
                上一頁
              </button>
              <button
                type="button"
                className="h-8 rounded-md border border-border px-2.5 text-foreground hover:bg-muted/40 disabled:opacity-40"
                disabled={jobsLoading || (jobPage + 1) * JOB_PAGE_SIZE >= jobTotal}
                onClick={() => setJobPage((page) => page + 1)}
              >
                下一頁
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
            <span className="rounded px-1.5 py-0.5 bg-teal-100 text-teal-900">已開 task</span>
            <span className="rounded px-1.5 py-0.5 bg-slate-100 text-slate-700">略過</span>
            <span className="rounded px-1.5 py-0.5 bg-amber-100 text-amber-950">失敗</span>
            <span className="rounded px-1.5 py-0.5 bg-teal-200 text-teal-950">留言</span>
            <span className="rounded px-1.5 py-0.5 bg-violet-200 text-violet-950">轉專案</span>
            <span className="rounded px-1.5 py-0.5 bg-emerald-200 text-emerald-950">完成</span>
          </div>
        </div>
        {jobs.length === 0 && !jobsLoading && (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">{jobQuery || jobStatus !== 'all' ? '沒有符合的紀錄' : '未有處理紀錄'}</p>
        )}
        <div className="divide-y divide-border/40">
          {jobs.map((job) => {
            const open = openJobId === job.id;
            const title = job.task_name || job.subject || '—';
            const taskActivity = job.asana_task_gid ? activity[job.asana_task_gid] : undefined;
            const loadingActivity = job.asana_task_gid !== null && activityLoading === job.asana_task_gid;
            return (
              <article key={job.id} className={`border-l-4 ${jobAccent(job.status)}`}>
                <div className="flex items-stretch">
                  <button
                    type="button"
                    className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-600"
                    aria-expanded={open}
                    aria-label={`${open ? '收起' : '展開'} ${title}`}
                    onClick={() => void openJob(job)}
                  >
                    <ChevronRight size={16} className={`shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150 ${open ? 'rotate-90' : ''}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                        <time dateTime={job.created_at}>處理 {formatHkt(job.created_at)}</time>
                        {job.received_on && <span>收信 {formatReceived(job.received_on)}</span>}
                        <span className={`rounded px-1.5 py-0.5 ${jobStatusClass(job.status)}`}>{jobStatusLabel(job.status)}</span>
                      </span>
                      <span className="block truncate text-[13px] font-medium text-foreground">{title}</span>
                    </span>
                  </button>
                  {job.asana_task_gid && (
                    <a
                      href={`https://app.asana.com/0/0/${job.asana_task_gid}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 shrink-0 items-center px-3 text-[12px] text-teal-700 hover:underline"
                    >
                      開啟
                    </a>
                  )}
                </div>
                {open && (
                  <div className="space-y-3 px-4 pb-4 pl-9">
                    {job.error && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">{job.error}</p>}
                    <div className="rounded-md border border-sky-200 bg-sky-50 p-3">
                      <p className="text-[12px] font-medium text-sky-950">郵件</p>
                      <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-white px-3 py-2 font-sans text-[13px] leading-6 text-foreground">{job.notes || '未有儲存郵件內容'}</pre>
                    </div>
                    {job.asana_task_gid && (
                      <div className="rounded-md border border-teal-200 bg-teal-50/70 p-3">
                        <p className="text-[12px] font-medium text-teal-950">Asana 之後</p>
                        {loadingActivity && <p className="mt-2 text-[13px] text-teal-900">讀取紀錄…</p>}
                        {taskActivity?.error && <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">{taskActivity.error}</p>}
                        {taskActivity && !taskActivity.error && (
                          <div className="mt-2 space-y-2">
                            <div className="flex flex-wrap gap-1.5">
                              <span className={`rounded px-1.5 py-0.5 text-[12px] ${taskActivity.completed ? 'bg-emerald-200 text-emerald-950' : 'bg-white text-slate-700'}`}>
                                {taskActivity.completed ? '已完成' : '未完成'}
                              </span>
                              {taskActivity.assignee && (
                                <span className="rounded bg-sky-200 px-1.5 py-0.5 text-[12px] text-sky-950">負責人 {taskActivity.assignee}</span>
                              )}
                              {taskActivity.projects.map((project) => (
                                <span key={`${project.name}-${project.section}`} className="rounded bg-violet-200 px-1.5 py-0.5 text-[12px] text-violet-950">
                                  {project.section ? `${project.name} / ${project.section}` : project.name}
                                </span>
                              ))}
                            </div>
                            {taskActivity.stories.length === 0 ? (
                              <p className="text-[13px] text-teal-900">開 task 之後未有留言或狀態更新。</p>
                            ) : (
                              <ol className="max-h-80 space-y-2 overflow-y-auto">
                                {taskActivity.stories.map((story) => {
                                  const tone = storyTone(story.subtype);
                                  return (
                                    <li key={story.gid || `${story.at}-${story.text}`} className={`rounded-md border px-3 py-2 ${tone.card}`}>
                                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                                        <span className={`rounded px-1.5 py-0.5 ${tone.badge}`}>{story.label}</span>
                                        {story.at && <time dateTime={story.at} className="text-slate-700">{formatHkt(story.at)}</time>}
                                        {story.by && <span className="text-slate-700">{story.by}</span>}
                                      </p>
                                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-slate-950">{story.text}</p>
                                    </li>
                                  );
                                })}
                              </ol>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
