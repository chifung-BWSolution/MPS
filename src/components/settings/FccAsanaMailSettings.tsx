import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, Mail, RefreshCw, Save, X, XCircle } from 'lucide-react';
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

export function FccAsanaMailSettings() {
  const [rule, setRule] = useState<MailRule | null>(null);
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [people, setPeople] = useState<AsanaPerson[]>([]);
  const [projects, setProjects] = useState<AsanaProject[]>([]);
  const [projectError, setProjectError] = useState('');
  const [creator, setCreator] = useState<{ name: string; email: string } | null>(null);
  const [peopleError, setPeopleError] = useState('');
  const [jobs, setJobs] = useState<MailJob[]>([]);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [activity, setActivity] = useState<Record<string, TaskActivity>>({});
  const [activityLoading, setActivityLoading] = useState<string | null>(null);
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, jobRes, status, directory] = await Promise.all([
      supabase.from('asana_mail_rules').select('*').eq('code', 'fcc').maybeSingle(),
      supabase.from('asana_mail_jobs').select('id, subject, received_on, status, task_name, notes, asana_task_gid, error, created_at').eq('rule_code', 'fcc').order('created_at', { ascending: false }).limit(12),
      callFunction<GmailStatus>('gmail-fcc-oauth', { action: 'status' }).catch((e: Error) => ({ error: e.message })),
      callFunction<{ users?: AsanaPerson[]; projects?: AsanaProject[]; projectError?: string; creator?: { name: string; email: string } | null }>('sync-fcc-asana-mail', { action: 'users' }).catch((e: Error) => ({ error: e.message })),
    ]);
    if (error) toast.error(error.message);
    if (data) {
      const next = data as MailRule;
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
    setJobs((jobRes.data || []) as MailJob[]);
    setGmail(status);
    setLoading(false);
  };

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  if (loading && !rule) {
    return <p className="text-[13px] text-muted-foreground">載入 FC 查詢設定…</p>;
  }
  if (!rule) {
    return <p className="text-[13px] text-muted-foreground">找不到 FCC 規則。請先套用資料庫 migration。</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-[13px] text-muted-foreground max-w-3xl">
          讀 {rule.gmail_address} 的「{rule.gmail_label_name}」。有正餐或小食到會就開 Catering，只有飯盒或下午茶就開 Lunch Box。到期日是郵件當日（香港時間）。
          {creator?.email
            ? ` 開 task 的 Asana 帳號是 ${creator.email}。`
            : ' 開 task 的 Asana 帳號未設定，暫停期間不會再開。'}
        </p>
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-teal-600 text-white text-[13px] font-medium hover:bg-teal-700 disabled:opacity-60"
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : undefined} />
          {syncing ? '處理中…' : '立即檢查郵件'}
        </button>
      </div>

      <div className="bg-white border border-border/50 rounded-md p-4 flex flex-wrap items-center justify-between gap-3">
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
        <button type="button" onClick={() => void connect()} className="h-8 px-3 rounded-md border border-border text-[12px] hover:bg-muted/40">
          {gmail?.connected ? '重新授權' : '連接 Gmail'}
        </button>
      </div>
      {gmail?.redirect_uri && (
        <p className="text-[12px] text-muted-foreground break-all">
          Google OAuth redirect URI：{gmail.redirect_uri}
        </p>
      )}

      <div className="bg-white border border-border/50 rounded-md p-4 space-y-4">
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(e) => setRule({ ...rule, enabled: e.target.checked })}
          />
          啟用自動開 task
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="block text-[12px] text-muted-foreground">
            負責人
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
          <div className="block text-[12px] text-muted-foreground sm:row-span-2">
            協作者
            <div className="mt-1 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {collaborators.map((gid) => {
                  const person = people.find((item) => item.gid === gid);
                  return (
                    <span key={gid} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-[12px] text-foreground">
                      {person ? personLabel(person) : '未能對上 Gmail'}
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setCollaborators((current) => current.filter((item) => item !== gid))}
                        aria-label="移除協作者"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
                {collaborators.length === 0 && <span className="text-[12px]">未加入協作者</span>}
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
          <div className="block text-[12px] text-muted-foreground">
            Lunch Box 專案
            <div className="mt-1 space-y-1">
              <p className="text-[13px] text-foreground min-h-5">
                {projects.find((project) => project.gid === rule.lunch_project_gid)?.name || (rule.lunch_project_gid ? '未能對上專案名稱' : '未選擇')}
              </p>
              <NameSearch
                items={projects}
                labelOf={(project) => project.name}
                exclude={rule.lunch_project_gid ? [rule.lunch_project_gid] : []}
                placeholder="搜尋專案名稱"
                emptyText={projectError || '找不到這個專案'}
                onPick={(project) => setRule({ ...rule, lunch_project_gid: project.gid })}
              />
            </div>
          </div>
          <label className="block text-[12px] text-muted-foreground">
            Lunch Box 標題
            <input className={`${inputClass} mt-1`} value={rule.lunch_title_prefix} onChange={(e) => setRule({ ...rule, lunch_title_prefix: e.target.value })} />
          </label>
          <div className="block text-[12px] text-muted-foreground">
            Catering 專案
            <div className="mt-1 space-y-1">
              <p className="text-[13px] text-foreground min-h-5">
                {projects.find((project) => project.gid === rule.catering_project_gid)?.name || (rule.catering_project_gid ? '未能對上專案名稱' : '未選擇')}
              </p>
              <NameSearch
                items={projects}
                labelOf={(project) => project.name}
                exclude={rule.catering_project_gid ? [rule.catering_project_gid] : []}
                placeholder="搜尋專案名稱"
                emptyText={projectError || '找不到這個專案'}
                onPick={(project) => setRule({ ...rule, catering_project_gid: project.gid })}
              />
            </div>
          </div>
          <label className="block text-[12px] text-muted-foreground">
            Catering 標題
            <input className={`${inputClass} mt-1`} value={rule.catering_title_prefix} onChange={(e) => setRule({ ...rule, catering_title_prefix: e.target.value })} />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-[13px] hover:bg-muted/40 disabled:opacity-60"
        >
          <Save size={14} />
          {saving ? '儲存中…' : '儲存設定'}
        </button>
      </div>

      <div className="bg-white border border-border/50 rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50">
          <p className="text-[13px] font-medium">最近處理</p>
          <p className="text-[12px] text-muted-foreground">點一行先展開。藍底是郵件，綠底是 Asana。</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
            <span className="rounded px-1.5 py-0.5 bg-teal-100 text-teal-900">已開 task</span>
            <span className="rounded px-1.5 py-0.5 bg-slate-100 text-slate-700">略過</span>
            <span className="rounded px-1.5 py-0.5 bg-amber-100 text-amber-950">失敗</span>
            <span className="rounded px-1.5 py-0.5 bg-teal-200 text-teal-950">留言</span>
            <span className="rounded px-1.5 py-0.5 bg-violet-200 text-violet-950">轉專案</span>
            <span className="rounded px-1.5 py-0.5 bg-emerald-200 text-emerald-950">完成</span>
          </div>
        </div>
        {jobs.length === 0 && (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">未有處理紀錄</p>
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
                        <time dateTime={job.created_at}>{formatHkt(job.created_at)}</time>
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
    </div>
  );
}
