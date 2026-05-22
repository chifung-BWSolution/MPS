# 03 — Data Dictionary

## Marketing Project System — 資料字典 v2.1

---

## 1. companies (公司管理)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | 系統自動生成 |
| company_code | VARCHAR(10) | ✅ | — | 公司編碼（唯一） | 全大寫英文，2-10字元，如 BWD, ZF |
| company_name_zh | VARCHAR(100) | ✅ | — | 公司中文名稱 | 不可為空 |
| company_name_en | VARCHAR(200) | ✅ | — | 公司英文名稱 | 不可為空 |
| br_no | VARCHAR(30) | ✅ | — | 商業登記號碼 | 格式: XXXXXXXX-XXX-XX-XX-X |
| bank_name | VARCHAR(50) | ✅ | — | 銀行名稱 | — |
| bank_account | VARCHAR(30) | ✅ | — | 銀行帳號 | 格式: XXX-XXX-XXXXXX-XXX |
| address | TEXT | ✅ | — | 公司地址 | — |
| contact_person | VARCHAR(50) | ✅ | — | 主要聯絡人 | — |
| contact_phone | VARCHAR(20) | ❌ | NULL | 聯絡電話 | 格式: +852 XXXX XXXX |
| contact_email | VARCHAR(100) | ❌ | NULL | 聯絡電郵 | Email格式驗證 |
| logo_url | VARCHAR(500) | ❌ | NULL | 公司Logo URL | 有效URL |
| is_active | BOOLEAN | ✅ | true | 是否啟用 | — |
| created_at | TIMESTAMP | ✅ | NOW() | 建立時間 | 系統自動 |
| updated_at | TIMESTAMP | ✅ | NOW() | 更新時間 | 系統自動 |

**業務規則：**
- 刪除公司前必須確認底下無活躍品牌/項目
- `company_code` 一旦建立不可修改
- 停用公司 (`is_active = false`) 不影響歷史資料

---

## 2. brands (品牌管理)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| company_id | UUID (FK) | ✅ | — | 所屬公司 | 必須存在於 companies 表 |
| brand_code | VARCHAR(10) | ✅ | — | 品牌編碼 | 全大寫英文，2-10字元 |
| brand_name_zh | VARCHAR(100) | ✅ | — | 品牌中文名 | 不可為空 |
| brand_name_en | VARCHAR(200) | ✅ | — | 品牌英文名 | 不可為空 |
| industry | VARCHAR(50) | ❌ | NULL | 行業類別 | 自由輸入 |
| logo_url | VARCHAR(500) | ❌ | NULL | 品牌Logo | 有效URL |
| color_primary | VARCHAR(7) | ✅ | '#0D9488' | 品牌主色 | Hex色碼格式 #XXXXXX |
| description | TEXT | ❌ | NULL | 品牌描述 | — |
| is_active | BOOLEAN | ✅ | true | 是否啟用 | — |
| created_at | TIMESTAMP | ✅ | NOW() | — | — |
| updated_at | TIMESTAMP | ✅ | NOW() | — | — |

**業務規則：**
- 品牌必須歸屬於一間公司
- 同一公司下 `brand_code` 不可重複
- 停用品牌不刪除相關項目資料

---

## 3. projects (主要項目)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| name | VARCHAR(200) | ✅ | — | 項目名稱 | 不可為空 |
| client_name | VARCHAR(100) | ❌ | NULL | 客戶名稱 | 僅 client 類型需要 |
| company_id | UUID (FK) | ✅ | — | 所屬公司 | 必須先選公司 |
| brand_id | UUID (FK) | ✅ | — | 所屬品牌 | 必須是該公司下的品牌 |
| project_type | ENUM | ✅ | — | 項目類型 | 見下方 ENUM 值 |
| project_category | ENUM | ✅ | — | 項目分類 | internal / client |
| status | ENUM | ✅ | 'planning' | 項目狀態 | 見下方 ENUM 值 |
| start_date | DATE | ✅ | — | 開始日期 | 不可晚於 end_date |
| end_date | DATE | ❌ | NULL | 結束日期 | 不可早於 start_date |
| budget_total | DECIMAL(12,2) | ✅ | 0 | 總預算 | ≥ 0 |
| budget_used | DECIMAL(12,2) | ✅ | 0 | 已使用預算 | ≥ 0, ≤ budget_total × 1.5 |
| assigned_pm | UUID (FK) | ❌ | NULL | 負責PM | 必須是活躍用戶 |
| description | TEXT | ❌ | NULL | 項目描述 | — |
| created_at | TIMESTAMP | ✅ | NOW() | — | — |
| updated_at | TIMESTAMP | ✅ | NOW() | — | — |

### project_type ENUM 值

| 值 | 中文標籤 | 說明 |
|----|----------|------|
| `web_design` | 網站設計 | 新網站建設或改版 |
| `system` | 系統開發 | 後台系統或工具開發 |
| `event` | 活動策劃 | 線上/線下活動 |
| `wine` | 紅酒推廣 | 紅酒品鑑/推廣活動 |
| `branding` | 品牌設計 | VI/CI/品牌識別 |
| `marketing` | 市場推廣 | 綜合營銷活動 |
| `video` | 影片製作 | 影片拍攝/後製 |
| `social_media` | 社交媒體 | 社交平台營運 |
| `edm` | EDM 營銷 | 電郵/短訊營銷 |
| `paid_ads` | 付費廣告 | Google/FB/IG廣告 |
| `seo_upgrade` | SEO 升級 | SEO優化購買 |
| `other` | 其他 | 未分類項目 |

### project_category ENUM 值

| 值 | 說明 |
|----|------|
| `internal` | 內部項目（公司自有品牌） |
| `client` | 客戶項目（需填寫 client_name） |

### status ENUM 值

| 值 | 中文標籤 | 色彩 | 說明 |
|----|----------|------|------|
| `planning` | 規劃中 | 🔵 Blue | 籌備階段 |
| `active` | 進行中 | 🟢 Teal | 正在執行 |
| `on_hold` | 暫停 | 🟡 Amber | 暫時擱置 |
| `completed` | 已完成 | ⚫ Slate | 完成結案 |
| `cancelled` | 已取消 | 🔴 Rose | 已取消 |

**業務規則：**
- 建立項目必須先選公司再選品牌（三步驟流程）
- `brand_id` 必須屬於選擇的 `company_id`
- 預算使用率 ≥ 80% 觸發 Dashboard 警告
- 預算使用率 ≥ 100% 觸發嚴重警告

---

## 4. website_profiles (網站檔案)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| project_id | UUID (FK) | ❌ | NULL | 關聯項目 | — |
| company_id | UUID (FK) | ✅ | — | 所屬公司（冗餘） | — |
| brand_id | UUID (FK) | ✅ | — | 所屬品牌（冗餘） | — |
| website_name | VARCHAR(200) | ✅ | — | 網站名稱 | 不可為空 |
| domain_url | VARCHAR(300) | ❌ | NULL | 網域URL | 有效URL格式 |
| platform | ENUM | ✅ | — | 平台 | wordpress/custom/shopify/wix/other |
| hosting_provider | VARCHAR(100) | ❌ | NULL | 主機供應商 | — |
| status | ENUM | ✅ | 'development' | 網站狀態 | development/live/maintenance/archived |
| dev_progress | ENUM | ✅ | 'planning' | 開發進度 | planning/design/development/testing/launched |
| launch_date | DATE | ❌ | NULL | 上線日期 | — |
| assigned_staff | JSONB | ❌ | '[]' | 指派人員 | `[{userId, role, name}]` |
| external_links | JSONB | ❌ | '[]' | 外部連結 | `[{label, url}]` |
| notes | TEXT | ❌ | NULL | 備註 | — |
| created_at | TIMESTAMP | ✅ | NOW() | — | — |
| updated_at | TIMESTAMP | ✅ | NOW() | — | — |

**業務規則：**
- Website Profile 是所有內容模組的樞紐
- 從 Website 可連結到：文章、影片、社交帖文、EDM、付費廣告、SEO關鍵字、插件等

---

## 5. day_reports (每日工作匯報)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| user_id | UUID (FK) | ✅ | — | 提交者 | 活躍用戶 |
| report_date | DATE | ✅ | — | 匯報日期 | 不可是未來日期 |
| total_hours | DECIMAL(4,1) | ✅ | 0 | 總工時 | 自動加總各 entries |
| is_half_day_leave | BOOLEAN | ✅ | false | 半日假 | — |
| is_leave | BOOLEAN | ✅ | false | 全日假 | — |
| leave_type | ENUM | ❌ | NULL | 假期類型 | 僅當 is_leave/is_half_day_leave = true |
| clock_in_time | TIME | ❌ | NULL | 上班時間 | — |
| clock_out_time | TIME | ❌ | NULL | 下班時間 | 必須 > clock_in_time |
| is_overtime | BOOLEAN | ✅ | false | 是否超時 | total_hours > 8 自動標記 |
| status | ENUM | ✅ | 'draft' | 狀態 | draft/submitted/approved/rejected |
| reviewer_id | UUID (FK) | ❌ | NULL | 審批者 | — |
| reviewer_comment | TEXT | ❌ | NULL | 審批意見 | — |
| submitted_at | TIMESTAMP | ❌ | NULL | 提交時間 | — |
| reviewed_at | TIMESTAMP | ❌ | NULL | 審批時間 | — |

### leave_type ENUM 值

| 值 | 說明 |
|----|------|
| `annual` | 年假 |
| `sick` | 病假 |
| `public_holiday` | 公眾假期 |
| `compensatory` | 補假 |
| `other` | 其他 |

**業務規則：**
- 正常工作日：total_hours ≥ 8 才可提交
- 半日假：total_hours ≥ 4 才可提交
- 全日假：免除工時要求
- total_hours > 8 自動標記 is_overtime = true（橙色）
- 同一用戶同一日期只能有一份 day_report

---

## 6. day_report_entries (匯報明細)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| day_report_id | UUID (FK) | ✅ | — | 所屬匯報 | — |
| project_id | UUID (FK) | ✅ | — | 關聯項目 | — |
| company_id | UUID (FK) | ❌ | NULL | 公司（冗餘） | 從 project 帶入 |
| brand_id | UUID (FK) | ❌ | NULL | 品牌（冗餘） | 從 project 帶入 |
| website_profile_id | UUID (FK) | ❌ | NULL | 關聯網站 | — |
| task_category | ENUM | ✅ | — | 任務類別 | 見下方 |
| task_description | TEXT | ✅ | — | 任務描述 | 不可為空 |
| hours | DECIMAL(4,1) | ✅ | — | 工時 | > 0, ≤ 24 |
| start_time | TIME | ❌ | NULL | 開始時間 | — |
| end_time | TIME | ❌ | NULL | 結束時間 | 必須 > start_time |
| output_type | ENUM | ❌ | NULL | 輸出類型 | article/video/graphic/code/report/other |
| output_url | VARCHAR(500) | ❌ | NULL | 輸出連結 | 有效URL |
| attachments | JSONB | ❌ | '[]' | 附件 | `[{name, url, type}]` |

### task_category ENUM 值（13種）

| 值 | 中文標籤 | 日曆顏色 |
|----|----------|----------|
| `website_build` | 網站建設 | #0D9488 (Teal) |
| `article` | 文章撰寫 | #3B82F6 (Blue) |
| `video_shoot` | 影片拍攝/剪輯 | #8B5CF6 (Purple) |
| `social_media` | 社交媒體 | #EC4899 (Pink) |
| `edm` | EDM 營銷 | #F59E0B (Amber) |
| `seo` | SEO 工作 | #10B981 (Green) |
| `ads_management` | 廣告管理 | #EF4444 (Red) |
| `meeting` | 會議 | #6366F1 (Indigo) |
| `training` | 培訓學習 | #14B8A6 (Cyan) |
| `office_skill` | 行政工作 | #78716C (Stone) |
| `leave` | 請假 | #9CA3AF (Gray) |
| `holiday` | 公眾假期 | #D1D5DB (Light Gray) |
| `other` | 其他 | #64748B (Slate) |

---

## 7. articles (文章管理)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| website_profile_id | UUID (FK) | ❌ | NULL | 所屬網站 | — |
| company_id | UUID (FK) | ❌ | NULL | 所屬公司 | — |
| brand_id | UUID (FK) | ❌ | NULL | 所屬品牌 | — |
| title | VARCHAR(500) | ✅ | — | 文章標題 | 不可為空 |
| slug | VARCHAR(300) | ❌ | NULL | URL Slug | 小寫+連字號 |
| channel | ENUM | ✅ | 'website_article' | 發佈渠道 | — |
| content_status | ENUM | ✅ | 'draft' | 內容狀態 | draft/writing/review/published |
| author_id | UUID (FK) | ❌ | NULL | 作者 | — |
| word_count | INTEGER | ❌ | 0 | 字數 | ≥ 0 |
| hours_spent | DECIMAL(5,1) | ❌ | 0 | 投入工時 | ≥ 0 |
| target_keywords | JSONB | ❌ | '[]' | 目標關鍵字 | `[{keyword, level}]` |
| other_tags | JSONB | ❌ | '[]' | 其他標籤 | `["tag1", "tag2"]` |
| publish_date | DATE | ❌ | NULL | 發佈日期 | — |
| url | VARCHAR(500) | ❌ | NULL | 文章URL | 有效URL |
| seo_score | INTEGER | ❌ | NULL | SEO 分數 | 0-100 |

### channel ENUM 值

| 值 | 說明 |
|----|------|
| `website_article` | 網站文章 |
| `youtube` | YouTube 描述文字 |
| `facebook` | Facebook 帖文 |
| `instagram` | Instagram Caption |
| `xiaohongshu` | 小紅書筆記 |
| `other_video` | 其他影片文案 |

---

## 8. videos (影片管理)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| website_profile_id | UUID (FK) | ❌ | NULL | 所屬網站 | — |
| video_channel_id | UUID (FK) | ❌ | NULL | 所屬頻道 | — |
| company_id | UUID (FK) | ✅ | — | 所屬公司 | — |
| brand_id | UUID (FK) | ✅ | — | 所屬品牌 | — |
| title | VARCHAR(300) | ✅ | — | 影片標題 | 不可為空 |
| description | TEXT | ❌ | NULL | 描述 | — |
| video_type | ENUM | ✅ | — | 影片類型 | promo/tutorial/testimonial/event/social_clip |
| status | ENUM | ✅ | 'planning' | 製作狀態 | 5 階段 |
| shoot_date | DATE | ❌ | NULL | 拍攝日期 | — |
| publish_date | DATE | ❌ | NULL | 發佈日期 | — |
| duration_seconds | INTEGER | ❌ | NULL | 影片長度(秒) | ≥ 0 |
| thumbnail_url | VARCHAR(500) | ❌ | NULL | 縮圖URL | — |
| file_url | VARCHAR(500) | ❌ | NULL | 檔案URL | — |
| editor_id | UUID (FK) | ❌ | NULL | 剪輯師 | — |
| editing_hours | DECIMAL(5,1) | ❌ | 0 | 剪輯工時 | ≥ 0 |
| platforms | JSONB | ❌ | '[]' | 平台發佈記錄 | `[{platform, url, views, publishDate, status}]` |
| crew | JSONB | ❌ | '[]' | 拍攝團隊 | `[{userId, role}]` |
| notes | TEXT | ❌ | NULL | 備註 | — |

### video status ENUM（5階段）

| 值 | 中文 | 說明 |
|----|------|------|
| `planning` | 規劃中 | 腳本/計劃階段 |
| `shooting` | 拍攝中 | 正在拍攝 |
| `post_production` | 後製中 | 剪輯/調色/音效 |
| `completed` | 已完成 | 製作完成待發佈 |
| `published` | 已發佈 | 已上線 |

---

## 9. video_channels (影片頻道)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| company_id | UUID (FK) | ✅ | — | 所屬公司 | — |
| brand_id | UUID (FK) | ✅ | — | 所屬品牌 | — |
| channel_number | VARCHAR(20) | ✅ | — | 頻道編號 | — |
| internal_name | VARCHAR(100) | ✅ | — | 內部名稱 | — |
| public_name | VARCHAR(100) | ✅ | — | 公開名稱 | — |
| importance | ENUM | ✅ | 'A3' | 重要性等級 | A1(最高)-A5(最低) |
| device_type | ENUM | ✅ | 'both' | 裝置類型 | desktop/mobile/both |
| status | ENUM | ✅ | 'active' | 頻道狀態 | active/paused/archived |
| video_count | INTEGER | ✅ | 0 | 影片數量 | ≥ 0, 自動計算 |

### importance ENUM

| 值 | 說明 | 更新頻率建議 |
|----|------|-------------|
| `A1` | 最重要 | 每週更新 |
| `A2` | 重要 | 每2週更新 |
| `A3` | 一般 | 每月更新 |
| `A4` | 次要 | 按需更新 |
| `A5` | 低優先 | 不定期更新 |

---

## 10. social_posts (社交媒體帖文)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| website_profile_id | UUID (FK) | ✅ | — | 所屬網站 | — |
| company_id | UUID (FK) | ✅ | — | 公司 | — |
| brand_id | UUID (FK) | ✅ | — | 品牌 | — |
| platform | ENUM | ✅ | — | 平台 | facebook/instagram/xiaohongshu/linkedin/youtube/twitter/other |
| post_type | ENUM | ✅ | 'image' | 帖文類型 | image/video/carousel/story/reel |
| content | TEXT | ✅ | — | 帖文內容 | 不可為空 |
| media_urls | JSONB | ❌ | '[]' | 媒體檔案 | `["url1", "url2"]` |
| scheduled_date | TIMESTAMP | ❌ | NULL | 排期日期 | — |
| published_date | TIMESTAMP | ❌ | NULL | 實際發佈日期 | — |
| publish_time | TIME | ❌ | NULL | 發佈時間 | — |
| status | ENUM | ✅ | 'draft' | 狀態 | draft/scheduled/published/archived |
| engagement_data | JSONB | ❌ | NULL | 互動數據 | `{likes, comments, shares, reach, impressions}` |
| linked_article_id | UUID (FK) | ❌ | NULL | 關聯文章 | — |
| linked_video_id | UUID (FK) | ❌ | NULL | 關聯影片 | — |
| author_id | UUID (FK) | ❌ | NULL | 作者 | — |
| hours_spent | DECIMAL(5,1) | ❌ | 0 | 投入工時 | ≥ 0 |
| post_url | VARCHAR(500) | ❌ | NULL | 帖文URL | — |
| tags | JSONB | ❌ | '[]' | 標籤 | `["tag1", "tag2"]` |

---

## 11. seo_keywords (SEO 關鍵字)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| website_profile_id | UUID (FK) | ✅ | — | 所屬網站 | — |
| company_id | UUID (FK) | ✅ | — | 公司 | — |
| brand_id | UUID (FK) | ✅ | — | 品牌 | — |
| keyword | VARCHAR(200) | ✅ | — | 關鍵字 | 不可為空 |
| level | ENUM | ✅ | — | 關鍵字等級 | level_1/level_2/level_3 |
| search_volume | INTEGER | ❌ | NULL | 搜尋量 | ≥ 0 |
| current_ranking | INTEGER | ❌ | NULL | 當前排名 | 1-100, NULL=未上榜 |
| target_ranking | INTEGER | ❌ | NULL | 目標排名 | 1-100 |
| target_page | VARCHAR(300) | ❌ | NULL | 目標頁面URL | — |
| difficulty_score | INTEGER | ❌ | NULL | 競爭難度 | 0-100 |
| assigned_article_id | UUID (FK) | ❌ | NULL | 關聯文章 | — |
| status | ENUM | ✅ | 'monitoring' | 狀態 | monitoring/optimizing/achieved/paused |
| ai_generated | BOOLEAN | ✅ | false | 是否AI生成 | — |

### SEO Level 說明

| Level | 中文 | 說明 | 搜尋量範圍 |
|-------|------|------|-----------|
| `level_1` | S1 核心字 | 品牌核心關鍵字 | > 1000 |
| `level_2` | S2 目標字 | 服務/產品相關 | 100 - 1000 |
| `level_3` | S3 長尾字 | 長尾關鍵字 | < 100 |

---

## 12. paid_ads (付費廣告)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| website_profile_id | UUID (FK) | ❌ | NULL | 所屬網站 | — |
| project_id | UUID (FK) | ❌ | NULL | 關聯項目 | — |
| company_id | UUID (FK) | ✅ | — | 廣告費歸屬公司 | — |
| brand_id | UUID (FK) | ✅ | — | 品牌 | — |
| campaign_name | VARCHAR(200) | ✅ | — | 廣告系列名稱 | 不可為空 |
| platform | ENUM | ✅ | — | 廣告平台 | google_ads/facebook/instagram/xiaohongshu/other |
| ad_type | ENUM | ✅ | — | 廣告類型 | search/display/video/shopping/social |
| budget | DECIMAL(12,2) | ✅ | 0 | 預算 | ≥ 0 |
| actual_spend | DECIMAL(12,2) | ✅ | 0 | 實際花費 | ≥ 0 |
| currency | ENUM | ✅ | 'HKD' | 貨幣 | HKD/USD/CNY |
| start_date | DATE | ✅ | — | 開始日期 | — |
| end_date | DATE | ❌ | NULL | 結束日期 | — |
| status | ENUM | ✅ | 'planning' | 廣告狀態 | planning/active/paused/completed |
| impressions | INTEGER | ❌ | 0 | 曝光次數 | ≥ 0 |
| clicks | INTEGER | ❌ | 0 | 點擊次數 | ≥ 0 |
| conversions | INTEGER | ❌ | 0 | 轉換次數 | ≥ 0 |
| cpc | DECIMAL(8,2) | ❌ | NULL | 每次點擊成本 | 自動計算 actual_spend / clicks |
| ctr | DECIMAL(5,2) | ❌ | NULL | 點擊率% | 自動計算 clicks / impressions × 100 |
| roas | DECIMAL(8,2) | ❌ | NULL | 廣告回報率 | — |
| credit_card_id | UUID (FK) | ❌ | NULL | 付款信用卡 | — |
| notes | TEXT | ❌ | NULL | 備註 | — |

---

## 13. quotations (報價單)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| quote_number | VARCHAR(30) | ✅ | — | 報價單號(唯一) | 格式: QT-YYYYMMDD-XXX |
| company_id | UUID (FK) | ✅ | — | 發出公司 | 必須選擇 |
| brand_id | UUID (FK) | ✅ | — | 所屬品牌 | — |
| project_id | UUID (FK) | ❌ | NULL | 關聯項目 | — |
| client_name | VARCHAR(200) | ✅ | — | 客戶名稱 | 不可為空 |
| project_type | ENUM | ✅ | — | 項目類型 | 同 projects.project_type |
| status | ENUM | ✅ | 'draft' | 報價狀態 | draft/sent/approved/rejected/expired |
| subtotal | DECIMAL(12,2) | ✅ | 0 | 小計 | 自動加總 items |
| tax | DECIMAL(12,2) | ✅ | 0 | 稅額 | ≥ 0 |
| total | DECIMAL(12,2) | ✅ | 0 | 總額 | subtotal + tax |
| currency | ENUM | ✅ | 'HKD' | 貨幣 | HKD/USD/CNY |
| valid_until | DATE | ✅ | — | 有效期限 | 不可早於今天 |
| approved_by | UUID (FK) | ❌ | NULL | 審批者 | — |
| approved_at | TIMESTAMP | ❌ | NULL | 審批時間 | — |
| notes | TEXT | ❌ | NULL | 備註 | — |
| company_name_snapshot | VARCHAR(200) | ❌ | NULL | 公司名稱快照 | 確認時自動填入 |
| company_br_no_snapshot | VARCHAR(30) | ❌ | NULL | BR號快照 | 確認時自動填入 |
| company_bank_snapshot | VARCHAR(50) | ❌ | NULL | 銀行名快照 | 確認時自動填入 |
| company_bank_account_snapshot | VARCHAR(30) | ❌ | NULL | 帳號快照 | 確認時自動填入 |
| company_address_snapshot | TEXT | ❌ | NULL | 地址快照 | 確認時自動填入 |

**業務規則：**
- 報價確認/發送時自動保存公司資料快照
- 報價過期自動更新 status = 'expired'
- 審批通過後可一鍵生成發票

---

## 14. credit_cards (信用卡管理)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| company_id | UUID (FK) | ✅ | — | 所屬公司 | — |
| company_name | VARCHAR(100) | ✅ | — | 公司名稱（顯示用） | — |
| last_four_digits | VARCHAR(4) | ✅ | — | 卡號末四碼 | 4位數字 |
| cvs | VARCHAR | ❌ | NULL | CVV（加密） | 3-4位數字，加密存儲 |
| expiry_date | DATE | ✅ | — | 到期日 | — |
| bank | VARCHAR(50) | ✅ | — | 發卡銀行 | — |
| purpose | VARCHAR(200) | ✅ | — | 用途 | — |
| card_holder | VARCHAR(50) | ✅ | — | 持卡人 | — |
| custodian | VARCHAR(50) | ✅ | — | 保管人 | — |
| is_active | BOOLEAN | ✅ | true | 是否啟用 | — |
| notes | TEXT | ❌ | NULL | 備註 | — |

**業務規則：**
- 到期前30天觸發系統通知
- CVV 必須加密存儲（Supabase Vault 或 pgcrypto）
- 按公司分開管理

---

## 15. users (用戶管理)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | 對應 auth.users.id |
| email | VARCHAR(200) | ✅ | — | 電郵（唯一） | Email格式 |
| full_name | VARCHAR(100) | ✅ | — | 全名 | 不可為空 |
| role | ENUM | ✅ | — | 角色 | 7種角色 |
| department | VARCHAR(50) | ❌ | NULL | 部門 | — |
| avatar_url | VARCHAR(500) | ❌ | NULL | 頭像URL | — |
| is_active | BOOLEAN | ✅ | true | 是否啟用 | — |
| hired_date | DATE | ❌ | NULL | 入職日期 | — |
| accessible_companies | JSONB | ❌ | '[]' | 可存取公司列表 | `["company_id_1", "company_id_2"]` |

### role ENUM 值

| 值 | 中文名稱 |
|----|----------|
| `management` | 管理層 |
| `project_manager` | 項目經理 |
| `designer` | 設計師/內容人員 |
| `accountant` | 會計 |
| `copywriter` | 文案同事 |
| `video_editor` | 影片剪輯 |
| `marketing` | 市場推廣 |

---

## 16. year_plans (年度計劃)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| company_id | UUID (FK) | ✅ | — | 公司 | — |
| brand_id | UUID (FK) | ✅ | — | 品牌 | — |
| year | INTEGER | ✅ | — | 年度 | 2020-2099 |
| target_revenue | DECIMAL(12,2) | ✅ | 0 | 目標營收 | ≥ 0 |
| target_projects | INTEGER | ✅ | 0 | 目標項目數 | ≥ 0 |
| target_articles | INTEGER | ✅ | 0 | 目標文章數 | ≥ 0 |
| target_videos | INTEGER | ✅ | 0 | 目標影片數 | ≥ 0 |
| target_social_posts | INTEGER | ✅ | 0 | 目標社交帖數 | ≥ 0 |
| notes | TEXT | ❌ | NULL | 備註 | — |

**業務規則：**
- 同一公司+品牌+年度只能有一個年度計劃（UNIQUE constraint）
- Dashboard 顯示實際 vs 目標的達成率進度條
- 績效報告會對比此數據

---

## 17. edm_campaigns (EDM 電郵/短訊)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| website_profile_id | UUID (FK) | ✅ | — | 所屬網站 | — |
| company_id | UUID (FK) | ✅ | — | 公司 | — |
| brand_id | UUID (FK) | ✅ | — | 品牌 | — |
| campaign_type | ENUM | ✅ | 'email' | 類型 | email/sms |
| subject | VARCHAR(300) | ✅ | — | 主題 | 不可為空 |
| template_id | UUID (FK) | ❌ | NULL | 使用模板 | — |
| template_name | VARCHAR(100) | ❌ | NULL | 模板名稱 | — |
| recipient_list | VARCHAR(100) | ❌ | NULL | 收件人名單 | — |
| recipient_type | VARCHAR(50) | ❌ | NULL | 收件人類型 | — |
| recipient_count | INTEGER | ❌ | 0 | 收件人數 | ≥ 0 |
| send_date | TIMESTAMP | ❌ | NULL | 發送日期 | — |
| status | ENUM | ✅ | 'draft' | 狀態 | draft/scheduled/sent/cancelled |
| hours_spent | DECIMAL(5,1) | ❌ | 0 | 投入工時 | ≥ 0 |
| open_rate | DECIMAL(5,2) | ❌ | NULL | 開信率% | 0-100 |
| click_rate | DECIMAL(5,2) | ❌ | NULL | 點擊率% | 0-100 |
| bounce_rate | DECIMAL(5,2) | ❌ | NULL | 退回率% | 0-100 |
| unsubscribe_count | INTEGER | ❌ | 0 | 退訂數 | ≥ 0 |
| linked_article_id | UUID (FK) | ❌ | NULL | 關聯文章 | — |
| notes | TEXT | ❌ | NULL | 備註 | — |

---

## 18. suppliers (供應商)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| company_id | UUID (FK) | ❌ | NULL | 所屬公司 | NULL = 共用供應商 |
| name | VARCHAR(200) | ✅ | — | 供應商名稱 | 不可為空 |
| category | ENUM | ✅ | — | 分類 | 見下方 |
| contact_person | VARCHAR(50) | ✅ | — | 聯絡人 | — |
| email | VARCHAR(100) | ❌ | NULL | 電郵 | Email格式 |
| phone | VARCHAR(20) | ❌ | NULL | 電話 | — |
| website | VARCHAR(300) | ❌ | NULL | 網站 | URL格式 |
| contract_status | ENUM | ✅ | 'active' | 合約狀態 | active/expired/pending |
| service_type | VARCHAR(200) | ❌ | NULL | 服務類型 | — |
| fee_range | VARCHAR(50) | ❌ | NULL | 費用範圍 | — |
| average_rating | DECIMAL(3,1) | ✅ | 0 | 平均評分 | 0.0-5.0 |
| is_recommended | BOOLEAN | ✅ | false | 是否推薦 | — |
| total_spend | DECIMAL(12,2) | ✅ | 0 | 總花費 | ≥ 0 |
| notes | TEXT | ❌ | NULL | 備註 | — |

### supplier category ENUM

| 值 | 說明 |
|----|------|
| `seo` | SEO 服務 |
| `advertising` | 廣告服務 |
| `printing` | 印刷 |
| `photography` | 攝影 |
| `videography` | 攝像 |
| `development` | 開發 |
| `hosting` | 主機 |
| `backlink` | 外鏈 |
| `content_marketing` | 內容營銷 |
| `technical_seo` | 技術SEO |
| `keyword_research` | 關鍵字研究 |
| `google_business` | Google 商家 |
| `comprehensive_seo` | 綜合SEO |
| `other` | 其他 |

---

## 19. notifications (通知系統)

| 欄位 | 類型 | 必填 | 預設值 | 說明 | 驗證規則 |
|------|------|------|--------|------|----------|
| id | UUID | ✅ | gen_random_uuid() | 主鍵 | — |
| user_id | UUID (FK) | ❌ | NULL | 目標用戶 | NULL = 全域通知 |
| company_id | UUID (FK) | ❌ | NULL | 相關公司 | — |
| notification_type | ENUM | ✅ | — | 通知類型 | 見下方 |
| title | VARCHAR(200) | ✅ | — | 標題 | — |
| description | TEXT | ❌ | NULL | 內容 | — |
| severity | ENUM | ✅ | 'info' | 嚴重程度 | info/warning/critical |
| is_read | BOOLEAN | ✅ | false | 是否已讀 | — |
| action_url | VARCHAR(500) | ❌ | NULL | 操作連結 | — |

### notification_type ENUM

| 值 | 說明 | 嚴重程度 |
|----|------|----------|
| `credit_card_expiry` | 信用卡即將到期 | warning |
| `plugin_expiry` | 插件訂閱即將到期 | warning |
| `login_request` | 新用戶登入請求 | info |
| `day_report_pending` | 日報待審批 | info |
| `budget_warning` | 預算超過80% | warning |
| `task_overdue` | 任務逾期 | critical |
| `invoice_overdue` | 發票逾期未付 | critical |

---

## 20. JSONB 欄位結構說明

### assigned_staff (website_profiles)
```json
[
  { "userId": "uuid", "role": "developer", "name": "陳小華" },
  { "userId": "uuid", "role": "designer", "name": "李美玲" }
]
```

### engagement_data (social_posts)
```json
{
  "likes": 120,
  "comments": 15,
  "shares": 8,
  "reach": 5000,
  "impressions": 12000
}
```

### target_keywords (articles)
```json
[
  { "keyword": "品牌設計", "level": "level_1" },
  { "keyword": "香港網站設計公司", "level": "level_2" }
]
```

### platforms (videos)
```json
[
  { "platform": "youtube", "url": "https://...", "views": 1500, "publishDate": "2025-01-15", "status": "uploaded" },
  { "platform": "facebook", "url": "https://...", "views": 800, "publishDate": "2025-01-16", "status": "uploaded" }
]
```

### accessible_companies (users)
```json
["c1", "c2"]  // 管理層可存取所有公司
```

### ranking_before / ranking_after (seo_upgrades)
```json
{
  "keywords": [
    { "keyword": "品牌設計", "position": 25 },
    { "keyword": "網站設計", "position": 18 }
  ],
  "date": "2025-01-01"
}
```
