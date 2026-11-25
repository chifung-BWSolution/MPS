-- ============================================================
-- 手動回滾：完全移除「跨平台一稿多發」
--
-- 只在確認要移除本插件時手動執行（Supabase SQL Editor）。
-- 故意放在 scripts/ 而不是 supabase/migrations/，避免被 db push 自動套用。
--
-- 影響範圍：
--   - 只刪除 crosspost_sets / crosspost_variants 兩張表
--   - brand_list、users 及其他表完全不動
--   - 已生成的歷史紀錄會一併消失，執行前請先匯出
-- ============================================================

DROP TABLE IF EXISTS public.crosspost_variants;
DROP TABLE IF EXISTS public.crosspost_sets;
