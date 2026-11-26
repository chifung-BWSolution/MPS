import { useEffect, useState } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { canAccessSettings } from '@/lib/permissions';
import { BwAsanaMailSettings } from '@/components/settings/BwAsanaMailSettings';
import { FccAsanaMailSettings } from '@/components/settings/FccAsanaMailSettings';
import { FccAsanaDigestSettings } from '@/components/settings/FccAsanaDigestSettings';

type Dept = 'bw' | 'fc' | 'wp';
type Section = 'records' | 'rules' | 'notify' | 'errors';
type JobStatus = 'all' | 'created' | 'skipped' | 'error' | 'processing';

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
  b2b_event_url: string | null;
};

type TaskStory = { gid: string; at: string; by: string; subtype: string; label: string; text: string };
type TaskActivity = {
  completed: boolean;
  assignee: string;
  projects: Array<{ name: string; section: string }>;
  stories: TaskStory[];
  error?: string;
};

const DEPTS: Array<{ id: Dept; label: string }> = [
  { id: 'bw', label: 'BW' },
  { id: 'fc', label: 'FC' },
  { id: 'wp', label: 'WP' },
];

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'records', label: '查詢紀錄' },
  { id: 'rules', label: '規則' },
  { id: 'notify', label: '通知' },
  { id: 'errors', label: '錯誤' },
];

const JOB_STATUS_FILTERS: Array<{ id: JobStatus; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'created', label: '已開 task' },
  { id: 'skipped', label: '略過' },
  { id: 'error', label: '失敗' },
  { id: 'processing', label: '處理中' },
];

const PAGE_SIZE = 10;
const PORTAL = 'https://www.winepassions-portal.com';

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

function portalHref(path: string | null): string | null {
  const value = (path || '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${PORTAL}${value.startsWith('/') ? value : `/${value}`}`;
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

const DEPT_TONE: Record<Dept, { on: string; off: string }> = {
  bw: { on: 'bg-sky-700 text-white', off: 'border-sky-300 bg-sky-50 text-sky-950' },
  fc: { on: 'bg-teal-700 text-white', off: 'border-teal-300 bg-teal-50 text-teal-950' },
  wp: { on: 'bg-violet-700 text-white', off: 'border-violet-300 bg-violet-50 text-violet-950' },
};

const SECTION_TONE: Record<Section, { on: string; off: string }> = {
  records: { on: 'bg-slate-800 text-white', off: 'border-slate-300 bg-white text-slate-800' },
  rules: { on: 'bg-amber-700 text-white', off: 'border-amber-300 bg-amber-50 text-amber-950' },
  notify: { on: 'bg-sky-800 text-white', off: 'border-sky-300 bg-white text-sky-950' },
  errors: { on: 'bg-rose-700 text-white', off: 'border-rose-300 bg-rose-50 text-rose-950' },
};

function WpRecords({ lockedStatus }: { lockedStatus?: 'error' }) {
  const [jobs, setJobs] = useState<MailJob[]>([]);
  const [jobStatus, setJobStatus] = useState<JobStatus>(lockedStatus || 'all');
  const [jobQuery, setJobQuery] = useState('');
  const [jobDraft, setJobDraft] = useState('');
  const [jobPage, setJobPage] = useState(0);
  const [jobTotal, setJobTotal] = useState(0);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [activity, setActivity] = useState<Record<string, TaskActivity>>({});
  const [activityLoading, setActivityLoading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const status = lockedStatus || jobStatus;

  const loadJobs = async (nextStatus: JobStatus, query: string, page: number) => {
    setJobsLoading(true);
    const needle = query.replace(/[%_,]/g, ' ').trim();
    const from = page * PAGE_SIZE;
    let request = supabase
      .from('asana_mail_jobs')
      .select('id, subject, received_on, status, task_name, notes, asana_task_gid, error, created_at, b2b_event_url', { count: 'exact' })
      .eq('rule_code', 'wp')
      .order('created_at', { ascending: false });
    if (nextStatus !== 'all') request = request.eq('status', nextStatus);
    if (needle) {
      request = request.or(`subject.ilike.%${needle}%,task_name.ilike.%${needle}%,notes.ilike.%${needle}%,error.ilike.%${needle}%`);
    }
    const { data, error, count } = await request.range(from, from + PAGE_SIZE - 1);
    if (error) toast.error(error.message);
    const total = count || 0;
    const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
    if (page > lastPage) {
      setJobPage(lastPage);
      setJobsLoading(false);
      return;
    }
    setJobs((data || []) as MailJob[]);
    setJobTotal(total);
    setJobsLoading(false);
  };

  useEffect(() => {
    void loadJobs(status, jobQuery, jobPage);
  }, [status, jobQuery, jobPage]);

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
      setActivity((current) => ({
        ...current,
        [taskGid]: { completed: false, assignee: '', projects: [], stories: [], error: e instanceof Error ? e.message : String(e) },
      }));
    } finally {
      setActivityLoading((current) => (current === taskGid ? null : current));
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const result = await callFunction<{ upserted?: number }>('sync-wp-asana-runs', {});
      toast.success(`已同步 ${result.upserted ?? 0} 筆 WP 紀錄`);
      await loadJobs(status, jobQuery, jobPage);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="bg-white border border-border/50 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-medium">{lockedStatus ? '失敗' : '最近處理'}</p>
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={syncing}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] hover:bg-muted/40 disabled:opacity-60"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : undefined} />
            {syncing ? '同步中…' : '立即同步'}
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground">WP 的 task 仍由 Wine Passions Portal 開。這裡每 5 分鐘抄入最新狀態，包括之後補上的專案頁連結。</p>
        {!lockedStatus && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {JOB_STATUS_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={`rounded-md px-2.5 py-1 text-[12px] ${status === filter.id ? 'bg-teal-700 text-white' : 'border border-border text-foreground hover:bg-muted/40'}`}
                onClick={() => {
                  setJobStatus(filter.id);
                  setJobPage(0);
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setJobPage(0);
            setJobQuery(jobDraft.trim());
          }}
        >
          <input
            className="h-11 min-w-0 flex-1 rounded-md border border-border px-3 text-[14px]"
            value={jobDraft}
            placeholder="搜尋主旨、task 標題或郵件內容"
            onChange={(event) => setJobDraft(event.target.value)}
          />
          <button type="submit" className="h-11 rounded-md border border-violet-300 bg-white px-3 text-[14px] text-violet-950 hover:bg-violet-50">搜尋</button>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
          <span className="rounded bg-teal-100 px-1.5 py-0.5 text-teal-900">已開 task</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">略過</span>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-950">失敗</span>
          <span className="rounded bg-teal-200 px-1.5 py-0.5 text-teal-950">留言</span>
          <span className="rounded bg-violet-200 px-1.5 py-0.5 text-violet-950">轉專案</span>
          <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-emerald-950">完成</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
          <p>{jobsLoading ? '載入中…' : (jobTotal === 0 ? '0 筆' : `第 ${jobPage * PAGE_SIZE + 1}–${Math.min(jobTotal, (jobPage + 1) * PAGE_SIZE)} 筆，共 ${jobTotal} 筆`)}</p>
          <div className="flex gap-1.5">
            <button type="button" className="h-8 rounded-md border border-border px-2.5 disabled:opacity-40" disabled={jobPage === 0 || jobsLoading} onClick={() => setJobPage((page) => Math.max(0, page - 1))}>上一頁</button>
            <button type="button" className="h-8 rounded-md border border-border px-2.5 disabled:opacity-40" disabled={jobsLoading || (jobPage + 1) * PAGE_SIZE >= jobTotal} onClick={() => setJobPage((page) => page + 1)}>下一頁</button>
          </div>
        </div>
      </div>
      {jobs.length === 0 && !jobsLoading && (
        <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">{jobQuery || status !== 'all' ? '沒有符合的紀錄' : '未有 WP 紀錄。同步之後會顯示。'}</p>
      )}
      <div className="divide-y divide-border/40">
        {jobs.map((job) => {
          const open = openJobId === job.id;
          const title = job.task_name || job.subject || '—';
          const eventHref = portalHref(job.b2b_event_url);
          const taskActivity = job.asana_task_gid ? activity[job.asana_task_gid] : undefined;
          return (
            <article key={job.id} className={`border-l-4 ${jobAccent(job.status)}`}>
              <div className="flex items-stretch">
                <button
                  type="button"
                  className="flex min-h-11 flex-1 items-center gap-2 px-3 py-2 text-left hover:bg-muted/30"
                  aria-expanded={open}
                  onClick={() => void openJob(job)}
                >
                  <ChevronRight size={16} className={`shrink-0 text-muted-foreground ${open ? 'rotate-90' : ''}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                      <time dateTime={job.created_at}>處理 {formatHkt(job.created_at)}</time>
                      {job.received_on && <span>收信 {formatReceived(job.received_on)}</span>}
                      <span className={`rounded px-1.5 py-0.5 ${jobStatusClass(job.status)}`}>{jobStatusLabel(job.status)}</span>
                    </span>
                    <span className="block truncate text-[13px] font-medium text-foreground">{title}</span>
                  </span>
                </button>
                {eventHref && (
                  <a href={eventHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center px-3 text-[12px] text-sky-700 hover:underline">專案頁</a>
                )}
                {job.asana_task_gid && (
                  <a href={`https://app.asana.com/0/0/${job.asana_task_gid}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center px-3 text-[12px] text-teal-700 hover:underline">開啟</a>
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
                      {activityLoading === job.asana_task_gid && <p className="mt-2 text-[13px] text-teal-900">讀取紀錄…</p>}
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
  );
}

function UnmatchedLog({ ruleCode, functionName }: { ruleCode: 'bw' | 'fcc'; functionName: string }) {
  const [jobs, setJobs] = useState<MailJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [ignoring, setIgnoring] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('asana_mail_jobs')
      .select('id, subject, received_on, status, task_name, notes, asana_task_gid, error, created_at, b2b_event_url')
      .eq('rule_code', ruleCode)
      .eq('status', 'unmatched')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) toast.error(error.message);
    setJobs((data || []) as MailJob[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [ruleCode]);

  const ignore = async (job: MailJob) => {
    setIgnoring(job.id);
    try {
      await callFunction(functionName, { action: 'ignore', jobId: job.id });
      toast.success('已略過，之後不會再就這封信開 task');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setIgnoring(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-md border border-rose-300 bg-white">
      <div className="border-b border-rose-200 bg-rose-50 px-4 py-3">
        <p className="text-[14px] font-medium text-rose-950">對不上規則，未有開 task</p>
        <p className="mt-1 text-[14px] leading-6 text-rose-900">這些郵件的主旨對不上現有規則。加一行關鍵字、負責人同專案之後，下一輪檢查會開。如果不需要，按略過。新出現的會寄到日報的同一批收件人。</p>
      </div>
      {loading && <p className="px-4 py-6 text-[14px] text-slate-600">載入中…</p>}
      {!loading && jobs.length === 0 && <p className="px-4 py-6 text-[14px] text-slate-700">未有對不上規則的郵件。</p>}
      <div className="divide-y divide-rose-100">
        {jobs.map((job) => (
          <article key={job.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-slate-600">
                <time dateTime={job.created_at}>處理 {formatHkt(job.created_at)}</time>
                {job.received_on ? ` · 收信 ${formatReceived(job.received_on)}` : ''}
              </p>
              <p className="mt-1 text-[14px] font-medium text-slate-950">{job.subject || job.task_name || '（沒有主旨）'}</p>
              {job.error && <p className="mt-1 text-[13px] text-rose-900">{job.error}</p>}
            </div>
            <button
              type="button"
              disabled={ignoring === job.id}
              onClick={() => void ignore(job)}
              className="inline-flex min-h-11 items-center rounded-md border border-rose-300 bg-white px-3 text-[14px] text-rose-950 hover:bg-rose-50 disabled:opacity-60"
            >
              {ignoring === job.id ? '略過中…' : '略過'}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

export function AsanaInquiryPage() {
  const { systemUser } = useAuth();
  const [dept, setDept] = useState<Dept>('bw');
  const [section, setSection] = useState<Section>('records');

  if (!canAccessSettings(systemUser?.role)) {
    return (
      <div className="space-y-4">
        <h1 className="text-[32px] font-bold tracking-tight">Asana 查詢</h1>
        <p className="text-[14px] text-muted-foreground">此頁面僅限管理層或以上身份存取。</p>
      </div>
    );
  }

  const sections = (dept === 'wp' ? SECTIONS.filter((item) => item.id === 'records' || item.id === 'notify') : SECTIONS);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[32px] font-bold tracking-tight">Asana 查詢</h1>
        <p className="mt-1 max-w-3xl text-[14px] leading-6 text-muted-foreground">BW、FC、WP 的 EmailMeForm 查詢同 Asana task 狀態放在同一頁。通知只設一次，一封電郵包含三個部門當日新開的 task。</p>
      </div>
      {section !== 'notify' && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="部門">
          {DEPTS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={dept === item.id}
              className={`h-11 min-w-16 rounded-md border px-4 text-[14px] font-medium ${dept === item.id ? DEPT_TONE[item.id].on : DEPT_TONE[item.id].off}`}
              onClick={() => {
                setDept(item.id);
                if (item.id === 'wp' && (section === 'rules' || section === 'errors')) setSection('records');
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="頁面">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            className={`h-11 rounded-md border px-4 text-[14px] font-medium ${section === item.id ? SECTION_TONE[item.id].on : SECTION_TONE[item.id].off}`}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {section === 'notify' && (
        <div className="rounded-md border-2 border-sky-300 bg-sky-50 p-4">
          <p className="mb-3 text-[14px] leading-6 text-sky-950">同一份收件人、同一個時間。寄出時 BW、FC、WP 當日新開的 task 放在同一封信。對不上規則的通知也用這份收件人。</p>
          <FccAsanaDigestSettings onChange={() => undefined} />
        </div>
      )}
      {section === 'errors' && dept === 'bw' && <UnmatchedLog ruleCode="bw" functionName="sync-bw-asana-mail" />}
      {section === 'errors' && dept === 'fc' && <UnmatchedLog ruleCode="fcc" functionName="sync-fcc-asana-mail" />}
      {section === 'rules' && dept === 'bw' && <BwAsanaMailSettings key="bw-rules" panel="rules" />}
      {section === 'rules' && dept === 'fc' && <FccAsanaMailSettings key="fc-rules" panel="rules" />}
      {section === 'records' && dept === 'bw' && <BwAsanaMailSettings key="bw-records" panel="records" />}
      {section === 'records' && dept === 'fc' && <FccAsanaMailSettings key="fc-records" panel="records" />}
      {section === 'records' && dept === 'wp' && <WpRecords />}
    </div>
  );
}
