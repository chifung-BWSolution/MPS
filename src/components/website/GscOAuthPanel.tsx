import { Copy, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useGscOAuth } from '@/hooks/useGscOAuth';
import { GSC_OAUTH_LOGIN_HINT } from '@/lib/gscOAuth';

type GscOAuthPanelProps = {
  compact?: boolean;
};

export function GscOAuthPanel({ compact = false }: GscOAuthPanelProps) {
  const oauth = useGscOAuth();
  const status = oauth.status;

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`已複製${label}`);
  };

  const ready = Boolean(status?.has_webmasters_scope);
  const badge = ready
    ? { text: '已授權 Search Console', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : status?.connected
      ? { text: '已連線但缺少 GSC scope', className: 'bg-amber-50 text-amber-700 border-amber-200' }
      : { text: '尚未授權', className: 'bg-slate-50 text-slate-600 border-slate-200' };

  if (compact) {
    return (
      <button
        type="button"
        disabled={oauth.working}
        onClick={async () => {
          const r = await oauth.startConsent();
          if (!r.ok) toast.error(r.error || '無法開啟授權視窗');
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-[12px] font-medium hover:bg-muted transition-colors disabled:opacity-50"
      >
        {oauth.working ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
        {ready ? '更新 GSC 授權' : '授權 GSC'}
      </button>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[16px] font-bold tracking-tight">Google Search Console</h2>
          <span className={`inline-flex px-2.5 py-1 rounded border text-[12px] font-medium ${badge.className}`}>
            {badge.text}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void oauth.refreshStatus()} disabled={oauth.loading}>
            重新整理狀態
          </Button>
          <Button
            size="sm"
            disabled={oauth.working}
            onClick={async () => {
              const r = await oauth.startConsent();
              if (!r.ok) toast.error(r.error || '無法開啟授權視窗');
              else toast.message(`請用 ${GSC_OAUTH_LOGIN_HINT} 登入並同意 Search Console`);
            }}
          >
            {oauth.working ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
            {ready ? '更新授權' : '一鍵授權 Search Console'}
          </Button>
        </div>
      </div>
      {oauth.error ? <div className="text-[12px] text-red-600">{oauth.error}</div> : null}

      <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card p-5 space-y-4">
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          用與 GA4 同一個 Google Cloud OAuth client 開啟同意視窗（帳號 {GSC_OAUTH_LOGIN_HINT}），
          補上 Search Console 唯讀權限。不要用 OAuth Playground 的預設 App。
        </p>
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <div className="text-muted-foreground text-[11px]">Token 來源</div>
            <div className="font-medium">{status?.source || '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-[11px]">可見 properties</div>
            <div className="font-medium">{status?.sites_listed ?? '—'}</div>
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground text-[11px]">Refresh token</div>
            <div className="font-mono text-[12px] break-all">
              {oauth.revealedToken || status?.token_preview || '—'}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={oauth.working || !status?.connected}
            onClick={async () => {
              if (oauth.revealedToken) {
                oauth.hideToken();
                return;
              }
              const r = await oauth.revealToken();
              if (!r.ok) toast.error(r.error || '無法顯示 token');
            }}
          >
            {oauth.revealedToken ? <EyeOff size={14} /> : <Eye size={14} />}
            {oauth.revealedToken ? '隱藏 token' : '顯示 refresh token'}
          </Button>
          {oauth.revealedToken ? (
            <Button variant="outline" size="sm" onClick={() => void copy(oauth.revealedToken || '', ' refresh token')}>
              <Copy size={14} /> 複製
            </Button>
          ) : null}
        </div>
        {status?.redirect_uri ? (
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            第一次請到 Google Cloud Console → 這個 OAuth client（Desktop 請另建 <strong>Web</strong> client，並把 Client ID/Secret 設成{' '}
            <code className="text-[11px]">GOOGLE_GSC_CLIENT_ID</code> / <code className="text-[11px]">GOOGLE_GSC_CLIENT_SECRET</code>
            ）→ Authorized redirect URIs 加入：
            <br />
            <button
              type="button"
              className="font-mono text-[11px] text-teal-700 hover:underline"
              onClick={() => void copy(status.redirect_uri, ' redirect URI')}
            >
              {status.redirect_uri}
            </button>
          </p>
        ) : null}
        {status?.probe_error ? (
          <p className="text-[12px] text-amber-700">探測失敗：{status.probe_error}</p>
        ) : null}
      </div>
    </section>
  );
}
