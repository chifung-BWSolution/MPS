-- 修復：建立時被寫成 ???? 的熱點，以及種子資料裡不存在的示範原文連結
-- 只影響示範資料，不動其他站點／文章。

-- 1) 修復被 PowerShell 編碼破壞的熱點（AI 稿件本身是正常的，不用重生成）
UPDATE public.content_hot_events
SET title = '秋冬轉季護膚品點樣換？',
    summary = '由夏天轉到秋天，潔面與精華的選擇要跟著濕度與皮脂變化調整；一次過全換反而最容易出事。',
    url = NULL
WHERE id = '878f5e3d-bba9-4189-9a72-0b4d0f1f7be7';

-- 2) 使用者只貼標題的「美妆」：補一句可讀摘要，取代先前用正文回填的片段
UPDATE public.content_hot_events
SET summary = '美妝入門：由清潔、保濕到防曬的基本選擇與常見問題整理。'
WHERE id = '970371f2-169a-40a0-8f3e-c1cc711698c2';

-- 3) 種子資料的 /hot/ 連結在 beauty100 官網不存在，點開會 404；一律移除
UPDATE public.content_hot_events
SET url = NULL
WHERE url LIKE 'https://www.beauty100-magazine.com/hot/%';
