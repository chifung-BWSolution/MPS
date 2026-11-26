-- ============================================================
-- 社媒自動化營運 · 社群帳號登入憑證（半自動，M4-03）
--
-- 目的：讓「品牌與帳號」能記錄平台登入憑證與到期日，
--       由系統判斷「有效／7 天內到期／已過期／已失效」，不需呼叫平台 API，
--       也不需要 Meta App Review（真 API 發佈仍屬第二期）。
--
-- 設計原則：
--   1. 密文與機密指紋只放在 content_social_account_credentials，
--      該表 RLS 開啟 + 0 條 policy + revoke authenticated → 只有 service_role 可讀寫
--   2. content_social_accounts 只放「非機密鏡像」（狀態／到期日／指紋），前端可安全顯示
--   3. 只做加法：不 drop、不 delete、不 truncate、不改既有欄位
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1) 憑證密文表（service_role only，deny all for authenticated）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_social_account_credentials (
  account_id       uuid PRIMARY KEY
                     REFERENCES public.content_social_accounts(id) ON DELETE CASCADE,
  kind             text NOT NULL DEFAULT 'oauth_token'
                     CHECK (kind IN ('oauth_token', 'app_password', 'manual_note')),
  ciphertext       text NOT NULL,
  fingerprint      text,
  expires_at       timestamptz,
  status           text NOT NULL DEFAULT 'untested'
                     CHECK (status IN ('active', 'expired', 'invalid', 'untested')),
  last_checked_at  timestamptz,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.content_social_account_credentials IS
  '社群帳號登入憑證密文（AES-256-GCM）。authenticated 無任何 policy，只能由 Edge Function 以 service_role 讀寫；前端永遠拿不到明文。';

ALTER TABLE public.content_social_account_credentials ENABLE ROW LEVEL SECURITY;

-- RLS 開啟 + 0 條 policy = 對 authenticated／anon 全拒（PRD §6.4 規則 2 同一手法）
REVOKE ALL ON public.content_social_account_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.content_social_account_credentials TO service_role;

DROP TRIGGER IF EXISTS content_social_account_credentials_touch_updated_at
  ON public.content_social_account_credentials;
CREATE TRIGGER content_social_account_credentials_touch_updated_at
  BEFORE UPDATE ON public.content_social_account_credentials
  FOR EACH ROW EXECUTE FUNCTION public.content_touch_updated_at();

-- ------------------------------------------------------------
-- 2) 帳號上的非機密鏡像欄位（前端可直接讀，用於顯示與到期提醒）
--    NULL = 未設定憑證（不給 DEFAULT，避免誤把既有帳號標成有憑證）
-- ------------------------------------------------------------
ALTER TABLE public.content_social_accounts
  ADD COLUMN IF NOT EXISTS credential_status      text
    CHECK (credential_status IS NULL OR credential_status IN ('active', 'expiring', 'expired', 'invalid')),
  ADD COLUMN IF NOT EXISTS credential_kind        text,
  ADD COLUMN IF NOT EXISTS credential_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS credential_fingerprint text,
  ADD COLUMN IF NOT EXISTS credential_updated_at  timestamptz;

COMMENT ON COLUMN public.content_social_accounts.credential_status IS
  '非機密封印：active=有效、expiring=7 天內到期、expired=已過期、invalid=無法解密/已標記失效；NULL=未設定憑證';
COMMENT ON COLUMN public.content_social_accounts.credential_expires_at IS
  '憑證到期日（可空＝長效 token）。前端據此顯示「剩 N 天」與批次檢測。';
COMMENT ON COLUMN public.content_social_accounts.credential_fingerprint IS
  '只顯示尾碼，供人核對是哪一組憑證；永不存明文。';

-- 到期提醒查詢（只索引有憑證的列）
CREATE INDEX IF NOT EXISTS content_social_accounts_credential_expires_idx
  ON public.content_social_accounts (credential_expires_at)
  WHERE credential_expires_at IS NOT NULL;
