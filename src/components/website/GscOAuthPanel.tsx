import { Copy, Eye, EyeOff, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useGscOAuth } from '@/hooks/useGscOAuth';
import { useGscSync } from '@/hooks/useGscSync';
import { GSC_OAUTH_LOGIN_HINT } from '@/lib/gscOAuth';
import { gscRunProgressPct, gscRunRecentErrors, gscRunStatusLabel } from '@/lib/gscSync';

type GscOAuthPanelProps = {
  compact?: boolean;
};

export function GscOAuthPanel({ compact = false }: GscOAuthPanelProps) {
  const oauth = useGscOAuth();
  const sync = useGscSync();
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

  const runStatus = gscRunStatusLabel(sync.run);
  const pct = gscRunProgressPct(sync.run);
  const recentErrors = gscRunRecentErrors(sync.run);
  const dateFrom = sync.run?.meta?.date_from;
  const dateTo = sync.run?.meta?.date_to;
  const panelError = sync.error || oauth.error;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[16px] font-bold tracking-tight">Google Search Console</h2>
          <span className={`inline-flex px-2.5 py-1 rounded border text-[12px] font-medium ${runStatus.className}`}>
            {runStatus.text}
          </span>
          <span className={`inline-flex px-2.5 py-1 rounded border text-[12px] font-medium ${badge.className}`}>
            {badge.text}
          </span>
          {sync.working ? (
            <span className="text-[12px] text-emerald-700">同步中…請保持此分頁開啟</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void oauth.refreshStatus();
              void sync.refreshRun();
            }}
            disabled={oauth.loading || sync.loading}
          >
            <RefreshCw size={14} className="mr-1.5" /> 重新整理
          </Button>
          <Button
            size="sm"
            disabled={sync.working}
            onClick={async () => {
              const r = await sync.start();
              if (r.ok && 'pending' in r && r.pending) toast.message('已開始 GSC 同步');
              else if (!r.ok && r.error === '同步進行中') toast.error(r.error);
            }}
          >
            {sync.working ? <Loader2 size={14} className="animate-spin" /> : null}
            開始同步
          </Button>
          <Button
            variant="outline"
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
      {panelError ? <div className="text-[12px] text-red-600">{panelError}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card p-5 space-y-4">
          <h3 className="text-[15px] font-bold">進度</h3>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full bg-teal-600 transition-all duration-300 ${sync.working ? 'animate-pulse' : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-[13px] text-muted-foreground">
            {sync.run
              ? sync.run.meta?.incomplete
                ? `部分完成，尚餘 ${sync.run.meta.sites_remaining ?? '—'} 站，再按開始同步會繼續`
                : sync.run.status === 'success'
                  ? '最近一次同步已完成'
                  : sync.run.status === 'running'
                    ? '同步執行中'
                    : '最近一次同步未完成'
              : '尚無任務'}
          </div>
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <div className="text-muted-foreground text-[11px]">資料起訖</div>
              <div className="font-medium">
                {dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : '最近 28 日'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">可見 / 已同步站點</div>
              <div className="font-medium">
                {sync.run
                  ? `${sync.run.meta?.sites_listed ?? status?.sites_listed ?? '—'} / ${
                      sync.run.meta?.processed_site_urls?.length ?? sync.run.sites_synced
                    }`
                  : (status?.sites_listed ?? '—')}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">已寫入列數</div>
              <div className="font-medium">
                {sync.run ? sync.run.rows_upserted.toLocaleString() : '—'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">關鍵字</div>
              <div className="font-medium">
                {sync.run ? sync.run.keywords_upserted.toLocaleString() : '—'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">Token 來源</div>
              <div className="font-medium">{status?.source || '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">錯誤數</div>
              <div className="font-medium">{recentErrors.length}</div>
            </div>
          </div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            GSC 資料約落後 2–3 日，每次同步拉最近 <strong>28 日</strong>查詢與排名，並寫入 SEO 關鍵字。
            日常增量由每日 cron（22:45 UTC）與本頁「開始同步」處理。請先用 {GSC_OAUTH_LOGIN_HINT} 完成 Search Console 授權。
          </p>
        </div>

        <div className="bg-white border border-[rgba(13,26,45,0.08)] rounded-md shadow-card p-5 space-y-3">
          <h3 className="text-[15px] font-bold">最近錯誤 / 日誌</h3>
          {sync.loading ? (
            <div className="text-[13px] text-muted-foreground">載入中…</div>
          ) : recentErrors.length === 0 ? (
            <div className="text-[13px] text-muted-foreground">尚無錯誤記錄</div>
          ) : (
            <ul className="space-y-2 max-h-[320px] overflow-y-auto text-[12px]">
              {recentErrors.map((e, i) => (
                <li key={`${i}-${e.slice(0, 24)}`} className="border border-slate-100 rounded px-2 py-1.5 bg-slate-50">
                  {e}
                </li>
              ))}
            </ul>
          )}
          {sync.run?.started_at ? (
            <div className="text-[11px] text-muted-foreground pt-2 border-t">
              開始：{new Date(sync.run.started_at).toLocaleString()}
              {sync.run.finished_at ? ` · 結束：${new Date(sync.run.finished_at).toLocaleString()}` : ''}
            </div>
          ) : null}
        </div>
      </div>

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
