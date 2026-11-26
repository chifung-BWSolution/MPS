-- ============================================================
-- 社媒自動化營運 · 平台 OAuth 登入（各平台授權）
--
-- 用途：讓「品牌與帳號」可以按平台走官方 OAuth 授權，
--       由 Edge Function 換取 token、加密存入 content_social_account_credentials，
--       前端只拿非機密鏡像（狀態／到期日／指紋）。
--
-- 安全設計：
--   1. state 由資料庫產生（uuid），一次性、10 分鐘有效、綁定帳號與使用者
--   2. states 表 RLS 開啟 + 0 條 policy + revoke authenticated → 只有 service_role
--   3. 只做加法：不動既有表欄位語義
-- ============================================================

CREATE TABLE IF NOT EXISTS public.content_social_oauth_states (
  state         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL
                  REFERENCES public.content_social_accounts(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('meta', 'threads', 'google')),
  user_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  redirect_uri  text NOT NULL,
  return_origin text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  error         text
);

COMMENT ON TABLE public.content_social_oauth_states IS
  'OAuth 授權 state（一次性、10 分鐘）；只由 Edge Function 以 service_role 讀寫，前端不可見。';

CREATE INDEX IF NOT EXISTS content_social_oauth_states_expires_idx
  ON public.content_social_oauth_states (expires_at);

ALTER TABLE public.content_social_oauth_states ENABLE ROW LEVEL SECURITY;

-- 0 條 policy + revoke = 對 anon／authenticated 全拒（同 credentials 表的封閉手法）
REVOKE ALL ON public.content_social_oauth_states FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.content_social_oauth_states TO service_role;
