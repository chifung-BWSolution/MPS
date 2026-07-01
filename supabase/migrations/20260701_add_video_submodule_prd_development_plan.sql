-- Register: 影片製作模塊 — 子模塊重構方案 v1.0
INSERT INTO public.development_plan (
  planning_date,
  title,
  owner,
  document_path,
  file_name
) VALUES (
  '2026-07-01',
  'PRD-影片製作模塊-子模塊重構方案-v1.0',
  'Dylan',
  'docs/development_plan/2026-07-01/PRD-影片製作模塊-子模塊重構方案-v1.0.html',
  'PRD-影片製作模塊-子模塊重構方案-v1.0.html'
)
ON CONFLICT (document_path) DO NOTHING;
