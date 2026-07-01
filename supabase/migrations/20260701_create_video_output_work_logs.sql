-- Video output work logs — multi-segment hours per video_output row

CREATE TABLE IF NOT EXISTS public.video_output_work_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_output_id   uuid NOT NULL REFERENCES public.video_output(id) ON DELETE CASCADE,
  staff_id          text NOT NULL,
  staff_name        text,
  work_date         date NOT NULL,
  hours             numeric(4,1) NOT NULL CHECK (hours > 0),
  work_type         text NOT NULL DEFAULT 'editing'
                    CHECK (work_type IN ('editing', 'color', 'subtitle', 'shoot', 'other')),
  notes             text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_output_work_logs_video
  ON public.video_output_work_logs (video_output_id);

CREATE INDEX IF NOT EXISTS idx_video_output_work_logs_staff_date
  ON public.video_output_work_logs (staff_id, work_date);

ALTER TABLE public.video_output_work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read video_output_work_logs for authenticated"
  ON public.video_output_work_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert video_output_work_logs for authenticated"
  ON public.video_output_work_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update video_output_work_logs for authenticated"
  ON public.video_output_work_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete video_output_work_logs for authenticated"
  ON public.video_output_work_logs FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow anon select on video_output_work_logs"
  ON public.video_output_work_logs FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on video_output_work_logs"
  ON public.video_output_work_logs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on video_output_work_logs"
  ON public.video_output_work_logs FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on video_output_work_logs"
  ON public.video_output_work_logs FOR DELETE TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_output_work_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_output_work_logs TO anon;
GRANT ALL ON public.video_output_work_logs TO service_role;
