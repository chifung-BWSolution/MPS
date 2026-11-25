-- One 寫字樓 row covers「寫字樓 Office工程查詢」and「Project Connect寫字樓」.
-- One Other row covers「其他類別 Other工程查詢」and「Project Connect其他類別」.
-- The capital OTHER row stays separate.

DELETE FROM public.bw_asana_mail_routes
WHERE keyword IN ('Project Connect寫字樓', 'Project Connect其他類別');

DELETE FROM public.bw_asana_mail_routes
WHERE keyword = '寫字樓 Office工程查詢'
  AND EXISTS (SELECT 1 FROM public.bw_asana_mail_routes WHERE keyword = '寫字樓');

DELETE FROM public.bw_asana_mail_routes
WHERE keyword = '其他類別 Other工程查詢'
  AND EXISTS (SELECT 1 FROM public.bw_asana_mail_routes WHERE keyword = 'Other');

UPDATE public.bw_asana_mail_routes
SET keyword = '寫字樓', updated_at = now()
WHERE keyword = '寫字樓 Office工程查詢';

UPDATE public.bw_asana_mail_routes
SET keyword = 'Other', updated_at = now()
WHERE keyword = '其他類別 Other工程查詢';
