-- Video production login methods (影片製作 → 設定 → 登入方式)

CREATE TABLE IF NOT EXISTS public.video_login_methods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login_method    text NOT NULL
                  CHECK (login_method IN (
                    'account_password',
                    'email_password',
                    'phone',
                    'google',
                    'wechat_scan'
                  )),
  display_name    text NOT NULL,
  account_name    text,
  phone_number    text,
  email           text,
  password        text,
  two_fa_methods  text[] NOT NULL DEFAULT '{}'::text[],
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_login_methods_two_fa_valid CHECK (
    two_fa_methods <@ ARRAY['email', 'sms', 'authenticator', 'mobile_app', 'na']::text[]
  ),
  CONSTRAINT video_login_methods_two_fa_na_exclusive CHECK (
    NOT ('na' = ANY (two_fa_methods) AND cardinality(two_fa_methods) > 1)
  )
);

CREATE INDEX IF NOT EXISTS video_login_methods_login_method_idx
  ON public.video_login_methods (login_method);

CREATE INDEX IF NOT EXISTS video_login_methods_display_name_idx
  ON public.video_login_methods (display_name);

CREATE INDEX IF NOT EXISTS video_login_methods_updated_at_idx
  ON public.video_login_methods (updated_at DESC);

ALTER TABLE public.video_login_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on video_login_methods" ON public.video_login_methods;
CREATE POLICY "Allow select on video_login_methods"
  ON public.video_login_methods FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert on video_login_methods" ON public.video_login_methods;
CREATE POLICY "Allow insert on video_login_methods"
  ON public.video_login_methods FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update on video_login_methods" ON public.video_login_methods;
CREATE POLICY "Allow update on video_login_methods"
  ON public.video_login_methods FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete on video_login_methods" ON public.video_login_methods;
CREATE POLICY "Allow delete on video_login_methods"
  ON public.video_login_methods FOR DELETE TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_login_methods TO anon, authenticated;
GRANT ALL ON public.video_login_methods TO service_role;
