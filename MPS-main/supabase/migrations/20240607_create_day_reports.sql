CREATE TABLE IF NOT EXISTS public.day_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id TEXT NOT NULL,
  report_date DATE NOT NULL,
  total_hours NUMERIC(4,1) NOT NULL DEFAULT 0,
  target_hours NUMERIC(4,1) NOT NULL DEFAULT 8,
  ot_hours NUMERIC(4,1) NOT NULL DEFAULT 0,
  is_leave BOOLEAN NOT NULL DEFAULT false,
  is_half_day BOOLEAN NOT NULL DEFAULT false,
  leave_type TEXT,
  office_location TEXT NOT NULL DEFAULT 'hk',
  is_holiday BOOLEAN NOT NULL DEFAULT false,
  is_weekend BOOLEAN NOT NULL DEFAULT false,
  under_hours_reason TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  reviewer_id TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, report_date)
);

CREATE TABLE IF NOT EXISTS public.day_report_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_report_id UUID NOT NULL REFERENCES public.day_reports(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL,
  category TEXT NOT NULL,
  related_id TEXT,
  related_name TEXT,
  title TEXT NOT NULL DEFAULT '',
  hours NUMERIC(4,1) NOT NULL DEFAULT 0,
  outcome_type TEXT,
  outcome_url TEXT,
  outcome_images JSONB,
  growth_experience TEXT,
  is_ai_assisted BOOLEAN NOT NULL DEFAULT false,
  ai_tools JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_day_reports_staff_id ON public.day_reports(staff_id);
CREATE INDEX IF NOT EXISTS idx_day_reports_report_date ON public.day_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_day_reports_status ON public.day_reports(status);
CREATE INDEX IF NOT EXISTS idx_day_report_entries_report_id ON public.day_report_entries(day_report_id);
CREATE INDEX IF NOT EXISTS idx_day_report_entries_staff_id ON public.day_report_entries(staff_id);
CREATE INDEX IF NOT EXISTS idx_day_report_entries_category ON public.day_report_entries(category);

DROP POLICY IF EXISTS "Allow authenticated full access day_reports" ON public.day_reports;
CREATE POLICY "Allow authenticated full access day_reports"
  ON public.day_reports
  FOR ALL
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.day_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access day_report_entries" ON public.day_report_entries;
CREATE POLICY "Allow authenticated full access day_report_entries"
  ON public.day_report_entries
  FOR ALL
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.day_report_entries ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION supabase_realtime ADD TABLE public.day_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.day_report_entries;
