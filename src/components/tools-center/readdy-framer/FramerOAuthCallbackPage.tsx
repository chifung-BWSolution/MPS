import { useEffect } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { FRAMER_OAUTH_MESSAGE } from '@/lib/readdyFramerApi';

export function FramerOAuthCallbackPage() {
  const params = new URLSearchParams(window.location.search);
  const ok = params.get('ok') === '1';
  const message =
    params.get('message') ||
    (ok
      ? '已成功授權團隊共用的 Framer MCP 帳號，現在可以同步頁面到 Framer。'
      : 'Framer MCP 授權未完成，請回到 MPS 重試。');

  useEffect(() => {
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          { type: FRAMER_OAUTH_MESSAGE, ok, message },
          window.location.origin,
        );
      }
    } catch {
      // ignore cross-window errors if opener closed
    }

    const timer = window.setTimeout(() => {
      window.close();
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [ok, message]);

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-lg p-7 space-y-4">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#101B2D] text-white text-[11px] font-mono">
            <span
              className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-[#0BB59B]' : 'bg-rose-400'}`}
            />
            mcp.framer.com
          </span>
          {ok ? (
            <CheckCircle2 size={22} className="text-[#0BB59B]" />
          ) : (
            <XCircle size={22} className="text-rose-500" />
          )}
        </div>

        <div className="space-y-1.5">
          <h1 className="text-[18px] font-bold text-[#101B2D]">
            {ok ? 'Framer MCP 授權成功' : 'Framer MCP 授權失敗'}
          </h1>
          <p className="text-[13px] text-slate-600 leading-relaxed">{message}</p>
        </div>

        <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-100">
          <span className="text-[11px] text-slate-400">
            視窗將自動關閉並同步 MPS 工作台狀態…
          </span>
          <button
            type="button"
            onClick={() => window.close()}
            className="px-3 py-1.5 rounded-lg bg-[#101B2D] hover:bg-[#192842] text-white text-[12px] font-medium shrink-0"
          >
            關閉視窗
          </button>
        </div>
      </div>
    </div>
  );
}
