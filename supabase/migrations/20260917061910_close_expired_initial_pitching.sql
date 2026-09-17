-- Close 初步提案 rows whose 45-day follow-up window has already elapsed.
-- Remaining days = 45 - (today - inquiry_date); expired when that is <= 0.
UPDATE public.quotation_client_project
SET
  status = 'closed',
  updated_at = now()
WHERE status = 'initial'
  AND inquiry_date <= ((timezone('Asia/Hong_Kong', now()))::date - 45);
