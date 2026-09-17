-- Hours live on video_output.production_progress. This table was a rewrite-on-save
-- shadow copy and is no longer read or written by the app.

DROP TABLE IF EXISTS public.video_output_work_logs CASCADE;

NOTIFY pgrst, 'reload schema';
