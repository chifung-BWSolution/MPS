-- One Clinic row covers both「醫療中心 Clinic工程查詢」and「Project Connect醫療中心 Clinic」.

UPDATE public.bw_asana_mail_routes
SET keyword = 'Clinic', updated_at = now()
WHERE keyword = 'Clinic工程';
