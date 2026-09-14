import { useState } from 'react';
import { CheckCircle2, Mail, RefreshCw, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DEFAULT_TEST_TO } from '@/lib/resend';
import { useResendConnection } from '@/hooks/useResendConnection';

export function EmailConnectionSettings() {
  const { status, loading, sending, error, refresh, sendHelloWorld } = useResendConnection();
  const [to, setTo] = useState(DEFAULT_TEST_TO);

  const handleSend = async () => {
    const recipient = to.trim() || DEFAULT_TEST_TO;
    try {
      const result = await sendHelloWorld(recipient);
      toast.success(`已寄出測試電郵（${result.id || 'ok'}）`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-bold">Resend 電郵連接</h3>
          <p className="text-[13px] text-muted-foreground mt-1">
            所有系統寄信都經 Resend。API key 只存在 Supabase Edge Function，不會寫入前端。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 text-[12px] hover:bg-muted/40 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
          重新檢查
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="bg-white border border-border/50 rounded-md p-4 flex items-center gap-3">
          <div
            className={cn(
              'w-10 h-10 rounded-md flex items-center justify-center',
              status?.configured ? 'bg-teal-50' : 'bg-amber-50',
            )}
          >
            <Mail size={18} className={status?.configured ? 'text-teal-600' : 'text-amber-600'} />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">連接狀態</p>
            {loading && !status ? (
              <p className="text-[14px] font-medium text-muted-foreground">檢查中…</p>
            ) : (
              <p className="text-[14px] font-medium inline-flex items-center gap-1.5">
                {status?.configured ? (
                  <>
                    <CheckCircle2 size={14} className="text-teal-600" />
                    已設定 API key
                  </>
                ) : (
                  <>
                    <XCircle size={14} className="text-amber-600" />
                    尚未設定 API key
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="bg-white border border-border/50 rounded-md p-4">
          <p className="text-[11px] text-muted-foreground">預設寄件者</p>
          <p className="text-[13px] font-mono mt-1 break-all">{status?.from || '—'}</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-[12px] text-blue-800 space-y-2">
        <p className="font-medium">把 `re_xxxxxxxxx` 換成你的正式 API key</p>
        <ol className="list-decimal pl-4 space-y-1 text-blue-700">
          <li>
            到{' '}
            <a
              href="https://resend.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              resend.com/api-keys
            </a>{' '}
            建立金鑰
          </li>
          <li>
            執行{' '}
            <code className="font-mono text-[11px] bg-white/70 px-1 py-0.5 rounded">
              supabase secrets set RESEND_API_KEY=re_你的正式金鑰
            </code>
          </li>
          <li>
            可選：設定已驗證網域寄件者{' '}
            <code className="font-mono text-[11px] bg-white/70 px-1 py-0.5 rounded">
              supabase secrets set RESEND_FROM_EMAIL=&quot;MPS &lt;noreply@your-domain.com&gt;&quot;
            </code>
          </li>
          <li>
            部署{' '}
            <code className="font-mono text-[11px] bg-white/70 px-1 py-0.5 rounded">
              supabase functions deploy send-email
            </code>
          </li>
        </ol>
        <p className="text-blue-700">
          `onboarding@resend.dev` 只能寄到 Resend 帳號電郵。正式寄信前請驗證自己的網域。
        </p>
      </div>

      {error && <p className="text-[13px] text-red-600">{error}</p>}

      <div className="border border-border/50 rounded-md p-4 space-y-3">
        <p className="text-[13px] font-medium">寄出 Hello World 測試信</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={DEFAULT_TEST_TO}
            className="h-9 flex-1 rounded-md border border-border/60 px-3 text-[13px]"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !to.trim()}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-[13px] disabled:opacity-50"
          >
            <Send size={14} />
            {sending ? '寄送中…' : '寄出測試電郵'}
          </button>
        </div>
      </div>
    </div>
  );
}
