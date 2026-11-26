/**
 * 平台 OAuth 回呼頁（`/social-oauth-callback`）
 *
 * provider 授權完成後會把瀏覽器導回這裡，帶上 `code` 與 `state`。
 * 本頁：
 *   1. 呼叫 `content-social` 的 `oauth_callback`（用目前登入者的 JWT）
 *   2. 成功 → postMessage 給 opener（主視窗）後自動關閉
 *   3. 失敗 → 顯示原因，讓使用者知道要重新按「平台登入」還是補 secrets
 *
 * 由 App.tsx 的 AuthGuard 包住，因此一定有登入 session 才拿得到 JWT。
 */

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { contentErrorMessage } from '@/lib/contentApi.ts';
import { completeSocialOAuth } from '@/lib/contentSocialApi.ts';
import { SOCIAL_OAUTH_MESSAGE } from '@/lib/contentSocialOAuth.ts';

type Phase = 'working' | 'ok' | 'error';

export function SocialOAuthCallbackPage() {
  const [phase, setPhase] = useState<Phase>('working');
  const [message, setMessage] = useState('正在完成平台授權…');
  const [accountId, setAccountId] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code') || '';
    const state = params.get('state') || '';
    const providerError = params.get('error_description') || params.get('error');

    const finish = (nextPhase: Phase, nextMessage: string, nextAccountId: string | null) => {
      setPhase(nextPhase);
      setMessage(nextMessage);
      setAccountId(nextAccountId);
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              type: SOCIAL_OAUTH_MESSAGE,
              ok: nextPhase === 'ok',
              message: nextMessage,
              accountId: nextAccountId,
            },
            window.location.origin,
          );
        }
      } catch {
        // opener 已關閉時忽略
      }
      if (nextPhase !== 'working') {
        window.setTimeout(() => {
          try {
            window.close();
          } catch {
            // 瀏覽器不允許由腳本關閉時，留在頁面顯示結果
          }
        }, 1200);
      }
    };

    if (providerError) {
      finish('error', `平台回報授權失敗：${providerError}`, null);
      return;
    }
    if (!code || !state) {
      finish('error', '授權回呼缺少 code／state，請回 MPS 重新按「平台登入」。', null);
      return;
    }

    void (async () => {
      try {
        const result = await completeSocialOAuth(code, state);
        const label = result.provider_label || result.provider;
        finish(
          'ok',
          `已完成 ${label} 授權並加密儲存（${result.credential_expires_at ? '已記錄到期日' : '長效 token'}）。`,
          result.account_id,
        );
      } catch (thrown) {
        finish('error', contentErrorMessage(thrown), null);
      }
    })();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f8fc] p-6">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-[rgba(13,26,45,0.08)] bg-white p-7 shadow-card">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[#0d1a2d] px-2.5 py-1 text-[11px] font-semibold text-white">
            <span
              className={
                'h-1.5 w-1.5 rounded-full ' +
                (phase === 'ok' ? 'bg-teal-300' : phase === 'error' ? 'bg-rose-400' : 'animate-pulse bg-amber-300')
              }
            />
            平台 OAuth
          </span>
          {phase === 'working' ? (
            <Loader2 size={22} className="animate-spin text-teal-600" />
          ) : phase === 'ok' ? (
            <CheckCircle2 size={22} className="text-teal-600" />
          ) : (
            <XCircle size={22} className="text-rose-500" />
          )}
        </div>

        <div className="space-y-1.5">
          <h1 className="text-[18px] font-bold text-[#0d1a2d]">
            {phase === 'working' ? '正在完成授權' : phase === 'ok' ? '授權成功' : '授權未完成'}
          </h1>
          <p className="text-[13px] leading-relaxed text-slate-600">{message}</p>
          {accountId && (
            <p className="text-[11px] text-slate-400">帳號 ID：{accountId}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
          <span className="text-[11px] text-slate-400">此視窗會自動關閉並同步回 MPS。</span>
          <button
            type="button"
            onClick={() => {
              if (window.opener && !window.opener.closed) window.close();
              else window.location.href = '/#tools-center/social-automation?zone=social&page=accounts';
            }}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            關閉 / 回到品牌與帳號
          </button>
        </div>
      </div>
    </div>
  );
}
