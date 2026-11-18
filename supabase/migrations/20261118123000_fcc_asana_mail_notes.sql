-- 最近處理要顯示整理後的郵件內容。

ALTER TABLE public.asana_mail_jobs
  ADD COLUMN IF NOT EXISTS notes text;
