-- ============================================================
-- Development Plan (development_plan)
-- 規劃中心 → 開發計劃：管理 PRD / 方案 HTML 文檔列表
-- ============================================================

CREATE TABLE IF NOT EXISTS public.development_plan (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_date  date NOT NULL,
  title          text NOT NULL,
  owner          text NOT NULL,
  document_path  text NOT NULL,
  file_name      text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS development_plan_planning_date_idx
  ON public.development_plan (planning_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS development_plan_document_path_uidx
  ON public.development_plan (document_path);

ALTER TABLE public.development_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated users"
  ON public.development_plan FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert for authenticated users"
  ON public.development_plan FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update for authenticated users"
  ON public.development_plan FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated users"
  ON public.development_plan FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow anon select on development_plan"
  ON public.development_plan FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert on development_plan"
  ON public.development_plan FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update on development_plan"
  ON public.development_plan FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon delete on development_plan"
  ON public.development_plan FOR DELETE TO anon USING (true);

-- 首期種子：工作匯報自動關聯 v2.0
INSERT INTO public.development_plan (
  planning_date,
  title,
  owner,
  document_path,
  file_name
) VALUES (
  '2025-06-29',
  'PRD-工作匯報自動關聯-v2.0',
  'Dylan',
  'docs/development_plan/2025-06-29/PRD-工作匯報自動關聯-v2.0.html',
  'PRD-工作匯報自動關聯-v2.0.html'
)
ON CONFLICT (document_path) DO NOTHING;
