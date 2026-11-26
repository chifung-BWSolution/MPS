import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { describeFccDigestSchedule, normalizeDigestRecipients, type FccDigestCadence } from '@/lib/fccAsanaDigest';
import { supabase } from '@/lib/supabase';

export type FccDigestForm = {
  enabled: boolean;
  recipients: string[];
  sendTime: string;
  cadence: FccDigestCadence;
  weekday: number;
  lastSentOn: string | null;
};

const inputClass = 'h-11 w-full rounded-md border border-border bg-white px-3 text-[13px] text-foreground focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600';

function cadenceOf(value: string | null): FccDigestCadence {
  if (value === 'weekdays' || value === 'weekly') return value;
  return 'daily';
}

export function FccAsanaDigestSettings({ onChange }: { onChange: (form: FccDigestForm) => void }) {
  const [form, setForm] = useState<FccDigestForm | null>(null);
  const [draft, setDraft] = useState('');
  const [testTo, setTestTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('asana_mail_rules')
      .select('digest_enabled, digest_recipients, digest_send_time, digest_cadence, digest_weekday, digest_last_sent_on')
      .eq('code', 'fcc')
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          toast.error(error?.message || '讀取查詢日報設定失敗');
          return;
        }
        const next: FccDigestForm = {
          enabled: data.digest_enabled === true,
          recipients: normalizeDigestRecipients(data.digest_recipients || []),
          sendTime: String(data.digest_send_time || '18:00').slice(0, 5),
          cadence: cadenceOf(data.digest_cadence),
          weekday: Number(data.digest_weekday || 1),
          lastSentOn: data.digest_last_sent_on,
        };
        setForm(next);
        onChange(next);
      });
    return () => {
      cancelled = true;
    };
  }, [onChange]);

  const update = (patch: Partial<FccDigestForm>) => {
    setForm((current) => current ? { ...current, ...patch } : current);
  };

  const addRecipient = () => {
    if (!form) return;
    const recipients = normalizeDigestRecipients([...form.recipients, draft]);
    if (recipients.length === form.recipients.length) {
      toast.error('請輸入有效電郵');
      return;
    }
    update({ recipients });
    setDraft('');
  };

  const callDigest = async (body: Record<string, unknown>) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token || '';
    const res = await fetch(`${supabaseUrl}/functions/v1/fcc-asana-digest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({})) as { error?: string; count?: number };
    if (!res.ok || payload.error) throw new Error(String(payload.error || `${res.status} ${res.statusText}`));
    return payload;
  };

  const save = async () => {
    if (!form) return;
    const recipients = normalizeDigestRecipients(form.recipients);
    if (form.enabled && recipients.length === 0) {
      toast.error('啟用前請先加入至少一個收件人');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('asana_mail_rules').update({
      digest_enabled: form.enabled,
      digest_recipients: recipients,
      digest_send_time: form.sendTime,
      digest_cadence: form.cadence,
      digest_weekday: form.weekday,
      updated_at: new Date().toISOString(),
    }).eq('code', 'fcc');
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const next = { ...form, recipients };
    setForm(next);
    onChange(next);
    try {
      await callDigest({ action: 'reschedule' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '發送時間未更新');
      return;
    }
    toast.success('已儲存查詢日報設定');
  };

  const sendTest = async () => {
    if (normalizeDigestRecipients([testTo]).length === 0) {
      toast.error('請輸入有效的測試電郵');
      return;
    }
    setTesting(true);
    try {
      const result = await callDigest({ action: 'test', to: testTo.trim() });
      toast.success(`已寄出測試信，今日實際新開 ${result.count ?? 0} 個 task`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '測試信寄出失敗');
    } finally {
      setTesting(false);
    }
  };

  if (!form) {
    return <p className="text-[13px] text-muted-foreground">載入查詢日報設定…</p>;
  }

  return (
    <div className="rounded-md border border-teal-200 bg-teal-50/60 p-4 space-y-4">
      <div>
        <p className="text-[14px] font-medium text-teal-950">發送設定</p>
        <p className="text-[13px] leading-6 text-teal-900">
          {describeFccDigestSchedule(form)}
          {form.lastSentOn ? ` 上次寄出：${form.lastSentOn}。` : ' 尚未寄出。'}
        </p>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-foreground">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(event) => update({ enabled: event.target.checked })}
        />
        啟用這封日報
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block text-[12px] font-medium text-muted-foreground">
          幾點寄（香港時間）
          <input className={`${inputClass} mt-1`} type="time" value={form.sendTime} onChange={(event) => update({ sendTime: event.target.value })} />
        </label>
        <label className="block text-[12px] font-medium text-muted-foreground">
          幾耐一次
          <select
            className={`${inputClass} mt-1`}
            value={form.cadence}
            onChange={(event) => update({ cadence: event.target.value as FccDigestCadence })}
          >
            <option value="daily">每日</option>
            <option value="weekdays">星期一至五</option>
            <option value="weekly">每週指定一日</option>
          </select>
        </label>
        {form.cadence === 'weekly' && (
          <label className="block text-[12px] font-medium text-muted-foreground">
            星期幾
            <select
              className={`${inputClass} mt-1`}
              value={form.weekday}
              onChange={(event) => update({ weekday: Number(event.target.value) })}
            >
              {['一', '二', '三', '四', '五', '六', '日'].map((label, index) => (
                <option key={label} value={index + 1}>週{label}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div>
        <p className="text-[12px] font-medium text-muted-foreground">收件人</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {form.recipients.map((email) => (
            <span key={email} className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-[13px]">
              {email}
              <button
                type="button"
                className="inline-flex h-11 w-8 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={`移除 ${email}`}
                onClick={() => update({ recipients: form.recipients.filter((item) => item !== email) })}
              >
                <X size={14} />
              </button>
            </span>
          ))}
          {form.recipients.length === 0 && <span className="text-[13px] text-muted-foreground">未加入收件人</span>}
        </div>
        <div className="mt-2 flex gap-2">
          <label className="min-w-0 flex-1 text-[12px] font-medium text-muted-foreground">
            電郵
            <input
              className={`${inputClass} mt-1`}
              type="email"
              autoComplete="email"
              value={draft}
              placeholder="name@example.com"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addRecipient();
                }
              }}
            />
          </label>
          <button type="button" className="mt-5 h-11 cursor-pointer rounded-md border border-border bg-white px-3 text-[13px] hover:bg-muted/40" onClick={addRecipient}>
            加入
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="inline-flex h-11 cursor-pointer items-center rounded-md bg-teal-600 px-4 text-[13px] font-medium text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {saving ? '儲存中…' : '儲存設定'}
      </button>
      <div className="rounded-md border border-sky-200 bg-white p-3 space-y-2">
        <p className="text-[13px] font-medium text-sky-950">測試信</p>
        <p className="text-[12px] leading-5 text-muted-foreground">用今日實際新開的 task 寄出，不會當作正式日報，也不會改上次寄出日期。</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[240px] flex-1 text-[12px] font-medium text-muted-foreground">
            測試收件人
            <input
              className={`${inputClass} mt-1`}
              type="email"
              autoComplete="email"
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={testing}
            className="inline-flex h-11 cursor-pointer items-center rounded-md border border-sky-300 bg-sky-50 px-4 text-[13px] font-medium text-sky-950 hover:bg-sky-100 disabled:opacity-60"
          >
            {testing ? '寄出中…' : '寄出測試信'}
          </button>
        </div>
      </div>
    </div>
  );
}
