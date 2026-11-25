-- 活動屏風 is a wall-form option, never its own EmailMeForm subject, so that keyword never opens a task.

DELETE FROM public.bw_asana_mail_routes
WHERE keyword = '活動屏風';
