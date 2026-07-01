-- Video output table (Excel: 影片 Video輸出(改）)
-- Maps to MPS 影片管理 module

CREATE TABLE IF NOT EXISTS public.video_output (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vchannel_id           uuid NOT NULL REFERENCES public.vchannels(id) ON DELETE RESTRICT,
  production_year       smallint,
  video_code            varchar(60) NOT NULL UNIQUE,
  title                 text NOT NULL,
  asana_task_id         text,
  asana_url             text,
  shoot_sz              boolean NOT NULL DEFAULT false,
  shoot_hk              boolean NOT NULL DEFAULT false,
  raw_footage_done      boolean NOT NULL DEFAULT false,
  needs_editing         boolean,
  demo_done             boolean NOT NULL DEFAULT false,
  shoot_at              date,
  planned_publish_date  date,
  published_date        date,
  platform_publish      jsonb NOT NULL DEFAULT '{}',
  storage_path          text,
  project_category      text NOT NULL DEFAULT 'client'
                        CHECK (project_category IN ('internal', 'client')),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_output_vchannel ON public.video_output (vchannel_id);
CREATE INDEX IF NOT EXISTS idx_video_output_year ON public.video_output (production_year);
CREATE INDEX IF NOT EXISTS idx_video_output_category ON public.video_output (project_category);
CREATE INDEX IF NOT EXISTS idx_video_output_published ON public.video_output (published_date);
CREATE INDEX IF NOT EXISTS idx_video_output_platform ON public.video_output USING gin (platform_publish);

ALTER TABLE public.video_output ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read video_output for authenticated"
  ON public.video_output FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert video_output for authenticated"
  ON public.video_output FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update video_output for authenticated"
  ON public.video_output FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete video_output for authenticated"
  ON public.video_output FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow anon select on video_output"
  ON public.video_output FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert on video_output"
  ON public.video_output FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update on video_output"
  ON public.video_output FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on video_output"
  ON public.video_output FOR DELETE TO anon USING (true);
