-- ============================================================
-- 熱點雷達 · 回滾腳本（手動執行，不在 migration 內）
--
-- 順序固定：① 備份收藏（可選）→ ② unschedule cron → ③ drop functions
--           → ④ 依 FK 順序 drop 5 張表 → ⑤ 刪 schema_migrations 版本記錄
--
-- 警告：④ 會永久刪除已收藏的靈感庫（本期沒有匯出功能）。
--       要保留就先跑 ①，把結果貼到本機檔案。
-- ============================================================

-- ① 備份收藏（可選；跑之前把結果另存）
-- select f.item_id, f.status, f.note, f.created_by, f.created_at, f.updated_at,
--        i.external_id, i.url, i.caption, i.author_handle, i.posted_at
--   from public.hotspot_favorites f
--   join public.hotspot_items i on i.id = f.item_id
--  order by f.updated_at desc;

-- ② 停止每日排程（job 不存在時會拋錯，可先查 cron.job）
do $$
begin
  if exists (select 1 from cron.job where jobname = 'hotspot-radar-daytime') then
    perform cron.unschedule('hotspot-radar-daytime');
    raise notice 'hotspot-radar-daytime unscheduled';
  else
    raise notice 'hotspot-radar-daytime not found — skipped';
  end if;

  if exists (select 1 from cron.job where jobname = 'hotspot-radar-daily') then
    perform cron.unschedule('hotspot-radar-daily');
    raise notice 'hotspot-radar-daily unscheduled';
  else
    raise notice 'hotspot-radar-daily not found — skipped';
  end if;
end
$$;

-- ③ 移除開關 RPC
drop function if exists public.hotspot_radar_set_daily(boolean);
drop function if exists public.hotspot_radar_daily_status();

-- ④ 列表 view 先於底表
drop view if exists public.hotspot_feed;

-- ⑤ 依 FK 順序刪表（favorites → items → targets → runs → settings）
drop table if exists public.hotspot_favorites;
drop table if exists public.hotspot_items;
drop table if exists public.hotspot_targets;
drop table if exists public.hotspot_runs;
drop table if exists public.hotspot_settings;

-- ⑥ 刪版本記錄，否則日後 db push 會跳過這些 migration、重建時缺表
delete from supabase_migrations.schema_migrations
 where version in (
   '20261126150000',
   '20261126151000',
   '20261126152000',
   '20261127183000',
   '20261127220000'
 );

-- ⑦ 前端回滾（手動）：
--    revert src/context/AppContext.tsx、src/components/tools-center/ToolsCenterModule.tsx、
--           src/lib/contentNavigation.ts、src/components/tools-center/content/social/SocialSubNav.tsx、
--           supabase/config.toml、package.json
--    刪除 src/types/hotspotRadar.ts、src/lib/hotspotRadar.ts、src/hooks/useHotspotRadar.ts、
--         src/components/tools-center/hotspot-radar/ 整個目錄
--    npx supabase functions delete hotspot-radar
