import { useEffect, useState } from 'react';
import { CheckCircle2, Mail, RefreshCw, Save, XCircle } from 'lucide-react';
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
  error: string | null;
  created_at: string;
};

type GmailStatus = {
  connected?: boolean;
  login_hint?: string;
  redirect_uri?: string;
  error?: string;
};

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

const inputClass =
  'w-full text-[13px] border border-border rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500';

export function FccAsanaMailSettings() {
  const [rule, setRule] = useState<MailRule | null>(null);
  const [collaborators, setCollaborators] = useState('');
  const [jobs, setJobs] = useState<MailJob[]>([]);
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, jobRes, status] = await Promise.all([
      supabase.from('asana_mail_rules').select('*').eq('code', 'fcc').maybeSingle(),
      supabase.from('asana_mail_jobs').select('id, subject, received_on, status, task_name, error, created_at').eq('rule_code', 'fcc').order('created_at', { ascending: false }).limit(12),
      callFunction<GmailStatus>('gmail-fcc-oauth', { action: 'status' }).catch((e: Error) => ({ error: e.message })),
    ]);
    if (error) toast.error(error.message);
    if (data) {
      const next = data as MailRule;
      setRule(next);
      setCollaborators((next.collaborator_gids || []).join('\n'));
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
    const collaborator_gids = collaborators.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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
          <label className="block text-[12px] text-muted-foreground">
            負責人 Asana ID
            <input className={`${inputClass} mt-1`} value={rule.assignee_gid} onChange={(e) => setRule({ ...rule, assignee_gid: e.target.value })} />
          </label>
          <label className="block text-[12px] text-muted-foreground sm:row-span-2">
            協作者 Asana ID（每行一個）
            <textarea className={`${inputClass} mt-1 min-h-[96px]`} value={collaborators} onChange={(e) => setCollaborators(e.target.value)} />
          </label>
          <label className="block text-[12px] text-muted-foreground">
            Lunch Box 專案 ID
            <input className={`${inputClass} mt-1`} value={rule.lunch_project_gid} onChange={(e) => setRule({ ...rule, lunch_project_gid: e.target.value })} />
          </label>
          <label className="block text-[12px] text-muted-foreground">
            Lunch Box 標題
            <input className={`${inputClass} mt-1`} value={rule.lunch_title_prefix} onChange={(e) => setRule({ ...rule, lunch_title_prefix: e.target.value })} />
          </label>
          <label className="block text-[12px] text-muted-foreground">
            Catering 專案 ID
            <input className={`${inputClass} mt-1`} value={rule.catering_project_gid} onChange={(e) => setRule({ ...rule, catering_project_gid: e.target.value })} />
          </label>
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
        <div className="px-4 py-3 text-[13px] font-medium border-b border-border/50">最近處理</div>
        <table className="w-full">
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-border/40">
                <td className="px-4 py-2 text-[12px] text-muted-foreground whitespace-nowrap">{job.received_on || job.created_at.slice(0, 10)}</td>
                <td className="px-4 py-2 text-[13px]">{job.task_name || job.subject || '—'}</td>
                <td className="px-4 py-2 text-[12px] whitespace-nowrap">{job.status}</td>
                <td className="px-4 py-2 text-[12px] text-muted-foreground">{job.error || ''}</td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-[13px] text-muted-foreground">未有處理紀錄</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
