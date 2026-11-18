-- FCC 只處理這個時間之後的郵件，避免把 FC查詢 舊信一次過開成 task。

ALTER TABLE public.asana_mail_rules
  ADD COLUMN IF NOT EXISTS not_before timestamptz;

UPDATE public.asana_mail_rules
SET not_before = COALESCE(not_before, now()),
    enabled = false,
    updated_at = now()
WHERE code = 'fcc';
