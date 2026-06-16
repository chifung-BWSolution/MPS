# 02 — Database Schema & ERD

## Marketing Project System — 資料庫架構文件 v2.1

---

## 1. 架構概覽 (Schema Overview)

系統採用 **多公司三層架構**：

```
Company (公司) → Brand (品牌) → Project (專案) → Website Profile (網站) → Content Modules
```

共計 **25+ 資料表**，以下為完整 ERD 結構。

---

## 2. Entity Relationship Diagram (ERD)

### 2.1 核心層級關聯 (Core Hierarchy)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CORE HIERARCHY                                    │
│                                                                          │
│  ┌──────────┐    1:N     ┌──────────┐    1:N     ┌──────────────┐      │
│  │companies │ ─────────► │ brands   │ ─────────► │  projects    │      │
│  │          │            │          │            │              │      │
│  └──────────┘            └──────────┘            └──────┬───────┘      │
│                                                         │               │
│                                                    1:N  │               │
│                                                         ▼               │
│                                                  ┌──────────────┐      │
│                                                  │website_      │      │
│                                                  │profiles      │      │
│                                                  └──────┬───────┘      │
│                                                         │               │
│                              ┌───────────────┬──────────┼─────────┐    │
│                              │               │          │         │    │
│                              ▼               ▼          ▼         ▼    │
│                        ┌──────────┐  ┌──────────┐ ┌─────────┐ ┌─────┐│
│                        │web_pages │  │ articles │ │ videos  │ │ ... ││
│                        └──────────┘  └──────────┘ └─────────┘ └─────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 完整 ERD 圖（文字版）

```
┌─────────────┐          ┌─────────────┐          ┌─────────────────┐
│  companies  │ 1      N │   brands    │ 1      N │    projects     │
│─────────────│◄────────►│─────────────│◄────────►│─────────────────│
│ id (PK)     │          │ id (PK)     │          │ id (PK)         │
│ company_code│          │ company_id  │(FK)      │ company_id (FK) │
│ company_name│          │ brand_code  │          │ brand_id (FK)   │
│ br_no       │          │ brand_name  │          │ assigned_pm(FK) │
│ bank_name   │          │ industry    │          │ project_type    │
│ bank_account│          │ primary_clr │          │ status          │
│ address     │          │ is_active   │          │ budget_total    │
│ ...         │          │ ...         │          │ ...             │
└──────┬──────┘          └─────────────┘          └────────┬────────┘
       │                                                    │
       │ 1:N                                           1:N  │
       │                                                    ▼
       │           ┌────────────────────────────────────────────────────┐
       │           │              website_profiles                       │
       │           │────────────────────────────────────────────────────│
       │           │ id (PK)                                            │
       │           │ project_id (FK → projects.id)                      │
       │           │ company_id (FK → companies.id)                     │
       │           │ brand_id (FK → brands.id)                          │
       │           │ website_name, domain_url, platform, status         │
       │           └───────┬───────────┬──────────┬──────────┬─────────┘
       │                   │           │          │          │
       │              1:N  │      1:N  │     1:N  │     1:N  │
       │                   ▼           ▼          ▼          ▼
       │           ┌───────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐
       │           │ web_pages │ │ articles │ │ videos │ │seo_kwds  │
       │           └───────────┘ └──────────┘ └────────┘ └──────────┘
       │
       │ 1:N     ┌──────────────┐        ┌────────────────┐
       ├────────►│ credit_cards │        │  quotations    │
       │         └──────────────┘        │────────────────│
       │                                 │ id (PK)        │
       │ 1:N     ┌──────────────┐        │ company_id(FK) │
       ├────────►│  suppliers   │        │ brand_id (FK)  │
       │         └──────────────┘        │ project_id(FK) │
       │                                 │ snapshots...   │
       │ 1:N     ┌──────────────┐        └───────┬────────┘
       └────────►│   clients    │                │ 1:1
                 └──────────────┘                ▼
                                         ┌────────────────┐
                                         │   invoices     │
                                         │────────────────│
                                         │ quotation_id   │
                                         │ company_id(FK) │
                                         └────────────────┘
```

### 2.3 日報系統 ERD

```
┌──────────┐    1:N     ┌──────────────────┐    N:1    ┌──────────────┐
│  users   │ ─────────► │   day_reports    │ ◄──────── │ users        │
│          │  user_id   │──────────────────│ reviewer  │ (reviewer)   │
└──────────┘            │ id (PK)          │           └──────────────┘
                        │ user_id (FK)     │
                        │ report_date      │
                        │ status           │
                        └────────┬─────────┘
                                 │
                            1:N  │
                                 ▼
                        ┌──────────────────────┐
                        │  day_report_entries   │
                        │──────────────────────│
                        │ id (PK)              │
                        │ day_report_id (FK)   │
                        │ project_id (FK)      │
                        │ company_id (FK)      │
                        │ brand_id (FK)        │
                        │ website_profile_id   │
                        │ task_category        │
                        │ hours                │
                        └──────────────────────┘
```

### 2.4 影片系統 ERD

```
┌────────────────┐    1:N     ┌──────────────┐    1:N    ┌──────────────┐
│video_channels  │ ─────────► │   videos     │ ────────► │video_uploads │
│────────────────│            │──────────────│           │──────────────│
│ id (PK)        │            │ id (PK)      │           │ id (PK)      │
│ company_id(FK) │            │ channel_id   │           │ video_id(FK) │
│ brand_id (FK)  │            │ website_id   │           │ platform     │
│ importance     │            │ editor_id    │           │ upload_status│
│ device_type    │            │ status       │           │ views        │
└────────────────┘            └──────────────┘           └──────────────┘
```

### 2.5 報價/發票 ERD

```
┌──────────────┐    1:N     ┌────────────────────┐
│  quotations  │ ─────────► │  quotation_items   │
│──────────────│            │────────────────────│
│ id (PK)      │            │ id (PK)            │
│ company_id   │            │ quotation_id (FK)  │
│ brand_id     │            │ item_name          │
│ project_id   │            │ quantity           │
│ client_name  │            │ unit_price         │
│ total        │            │ total_price        │
│ ...snapshots │            └────────────────────┘
└──────┬───────┘
       │ 1:1
       ▼
┌──────────────┐
│   invoices   │
│──────────────│
│ id (PK)      │
│ quotation_id │
│ company_id   │
│ ...snapshots │
└──────────────┘
```

### 2.6 SEO 系統 ERD

```
┌──────────────────┐    1:N     ┌────────────────────────┐
│  seo_keywords    │ ─────────► │  seo_ranking_history   │
│──────────────────│            │────────────────────────│
│ id (PK)          │            │ id (PK)                │
│ website_id (FK)  │            │ keyword_id (FK)        │
│ company_id       │            │ ranking_position       │
│ brand_id         │            │ recorded_date          │
│ level (1/2/3)    │            │ search_engine          │
│ status           │            └────────────────────────┘
└──────────────────┘

┌──────────────────┐
│  seo_upgrades    │
│──────────────────│
│ id (PK)          │
│ website_id (FK)  │
│ company_id (FK)  │
│ supplier_id (FK) │
│ cost, currency   │
│ ranking_before/  │
│ ranking_after    │
└──────────────────┘
```

---

## 3. 完整資料表清單

| # | Table Name | Description | Key FKs |
|---|-----------|-------------|---------|
| 1 | `companies` | 公司（最頂層） | — |
| 2 | `brands` | 品牌 | company_id |
| 3 | `projects` | 主要項目 | company_id, brand_id, assigned_pm |
| 4 | `website_profiles` | 網站檔案 | project_id, company_id, brand_id |
| 5 | `web_pages` | 網頁管理 | website_profile_id, assigned_to |
| 6 | `day_reports` | 每日工作匯報 | user_id, reviewer_id |
| 7 | `day_report_entries` | 匯報明細 | day_report_id, project_id, company_id, brand_id |
| 8 | `report_templates` | 匯報範本 | user_id, website_profile_id |
| 9 | `articles` | 文章管理 | website_profile_id, author_id, company_id, brand_id |
| 10 | `content_entries` | 內容計劃 | website_profile_id, company_id, brand_id |
| 11 | `videos` | 影片管理 | website_profile_id, video_channel_id, editor_id |
| 12 | `video_channels` | 影片頻道 | company_id, brand_id |
| 13 | `video_uploads` | 影片上傳記錄 | video_id |
| 14 | `social_posts` | 社交媒體帖文 | website_profile_id, linked_article_id, linked_video_id |
| 15 | `edm_campaigns` | EDM 電郵/短訊 | website_profile_id, template_id, linked_article_id |
| 16 | `edm_templates` | EDM 模板 | company_id |
| 17 | `seo_keywords` | SEO 關鍵字 | website_profile_id, assigned_article_id |
| 18 | `seo_ranking_history` | SEO 排名歷史 | keyword_id |
| 19 | `seo_upgrades` | SEO 升級記錄 | website_profile_id, supplier_id, assigned_staff_id |
| 20 | `paid_ads` | 付費廣告 | website_profile_id, project_id, credit_card_id |
| 21 | `suppliers` | 供應商 | company_id |
| 22 | `supplier_reviews` | 供應商評價 | supplier_id, reviewer_id |
| 23 | `quotations` | 報價單 | company_id, brand_id, project_id, approved_by |
| 24 | `quotation_items` | 報價單項目 | quotation_id |
| 25 | `invoices` | 發票 | company_id, brand_id, quotation_id |
| 26 | `clients` | 客戶 | company_id |
| 27 | `client_projects` | 客戶項目 | client_id, company_id |
| 28 | `users` | 用戶 | — |
| 29 | `training_modules` | 培訓模組 | — |
| 30 | `training_progress` | 培訓進度 | user_id, module_id |
| 31 | `plugins` | 網站插件/工具訂閱 | website_profile_id, company_id, brand_id |
| 32 | `credit_cards` | 信用卡 | company_id |
| 33 | `notifications` | 通知 | user_id, company_id |
| 34 | `notification_preferences` | 通知偏好 | user_id |
| 35 | `app_config` | 系統設定 | — |
| 36 | `login_requests` | 登入請求 | processed_by |
| 37 | `login_logs` | 登入記錄 | user_id |
| 38 | `year_plans` | 年度計劃 | company_id, brand_id |

---

## 4. Junction Tables / 多對多關係

| Junction Table | Connects | Purpose |
|---------------|----------|---------|
| `day_report_entries` | day_reports ↔ projects | 每條匯報可關聯不同項目 |
| `quotation_items` | quotations ↔ items | 報價單含多個項目明細 |
| `video_uploads` | videos ↔ platforms | 每支影片可上傳多個平台 |
| `supplier_reviews` | suppliers ↔ users | 多位用戶可評價同一供應商 |
| `client_projects` | clients ↔ companies | 客戶可有多個不同公司承接的項目 |
| `training_progress` | users ↔ training_modules | 多對多培訓進度追蹤 |

---

## 5. 冗餘欄位說明

以下表格包含 `company_id` 和 `brand_id` 冗餘欄位，用於避免 JOIN 並加速篩選查詢：

| Table | Redundant Fields | Source |
|-------|-----------------|--------|
| `website_profiles` | company_id, brand_id | 從 projects 繼承 |
| `articles` | company_id, brand_id | 從 website_profiles 繼承 |
| `videos` | company_id, brand_id | 從 website_profiles 繼承 |
| `social_posts` | company_id, brand_id | 從 website_profiles 繼承 |
| `edm_campaigns` | company_id, brand_id | 從 website_profiles 繼承 |
| `seo_keywords` | company_id, brand_id | 從 website_profiles 繼承 |
| `paid_ads` | company_id, brand_id | 從 website_profiles 繼承 |
| `day_report_entries` | company_id, brand_id | 從 projects 繼承 |

> **設計原則**：以 Dashboard 和 Report 頁面的篩選效能為優先，接受適度的資料冗餘。寫入時由應用層保證一致性。

---

## 6. Snapshot 模式（報價/發票）

報價單和發票在確認時會 **快照** 公司資料：

```
quotations / invoices:
├── company_name_snapshot
├── company_br_no_snapshot
├── company_bank_snapshot
├── company_bank_account_snapshot
└── company_address_snapshot
```

**目的**：防止公司修改基本資料後影響已發出的歷史文件。

---

## 7. 索引建議 (Index Recommendations)

```sql
-- 核心層級查詢
CREATE INDEX idx_brands_company ON brands(company_id);
CREATE INDEX idx_projects_company ON projects(company_id);
CREATE INDEX idx_projects_brand ON projects(brand_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_pm ON projects(assigned_pm);

-- 網站內容查詢
CREATE INDEX idx_website_profiles_project ON website_profiles(project_id);
CREATE INDEX idx_website_profiles_company ON website_profiles(company_id);
CREATE INDEX idx_articles_website ON articles(website_profile_id);
CREATE INDEX idx_videos_website ON videos(website_profile_id);
CREATE INDEX idx_videos_channel ON videos(video_channel_id);

-- 日報查詢
CREATE INDEX idx_day_reports_user_date ON day_reports(user_id, report_date);
CREATE INDEX idx_day_reports_status ON day_reports(status);
CREATE INDEX idx_day_report_entries_report ON day_report_entries(day_report_id);

-- 財務查詢
CREATE INDEX idx_quotations_company ON quotations(company_id);
CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_status ON invoices(payment_status);
CREATE INDEX idx_paid_ads_company ON paid_ads(company_id);

-- SEO 查詢
CREATE INDEX idx_seo_keywords_website ON seo_keywords(website_profile_id);
CREATE INDEX idx_seo_ranking_keyword ON seo_ranking_history(keyword_id);
```

---

## 8. dbdiagram.io DSL（可匯入生成圖形 ERD）

```dbml
// 複製以下內容到 https://dbdiagram.io 生成視覺化 ERD

Table companies {
  id uuid [pk]
  company_code varchar [unique]
  company_name_zh varchar
  company_name_en varchar
  br_no varchar
  bank_name varchar
  bank_account varchar
  address text
  contact_person varchar
  contact_phone varchar
  contact_email varchar
  logo_url varchar
  is_active boolean [default: true]
  created_at timestamp
  updated_at timestamp
}

Table brands {
  id uuid [pk]
  company_id uuid [ref: > companies.id]
  brand_code varchar
  brand_name_zh varchar
  brand_name_en varchar
  industry varchar
  logo_url varchar
  color_primary varchar
  description text
  is_active boolean [default: true]
  created_at timestamp
  updated_at timestamp
}

Table projects {
  id uuid [pk]
  name varchar
  client_name varchar
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  project_type varchar
  project_category varchar
  status varchar
  start_date date
  end_date date
  budget_total decimal
  budget_used decimal
  assigned_pm uuid [ref: > users.id]
  description text
  created_at timestamp
  updated_at timestamp
}

Table website_profiles {
  id uuid [pk]
  project_id uuid [ref: > projects.id]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  website_name varchar
  domain_url varchar
  platform varchar
  hosting_provider varchar
  status varchar
  dev_progress varchar
  launch_date date
  assigned_staff jsonb
  external_links jsonb
  notes text
  created_at timestamp
  updated_at timestamp
}

Table web_pages {
  id uuid [pk]
  website_profile_id uuid [ref: > website_profiles.id]
  page_name varchar
  page_url varchar
  status varchar
  assigned_to uuid [ref: > users.id]
  hours_spent decimal
  notes text
  sort_order integer
  created_at timestamp
  updated_at timestamp
}

Table users {
  id uuid [pk]
  email varchar [unique]
  full_name varchar
  role varchar
  department varchar
  avatar_url varchar
  is_active boolean
  hired_date date
  accessible_companies jsonb
  created_at timestamp
  updated_at timestamp
}

Table day_reports {
  id uuid [pk]
  user_id uuid [ref: > users.id]
  report_date date
  total_hours decimal
  is_half_day_leave boolean
  is_leave boolean
  leave_type varchar
  clock_in_time time
  clock_out_time time
  is_overtime boolean
  status varchar
  reviewer_id uuid [ref: > users.id]
  reviewer_comment text
  submitted_at timestamp
  reviewed_at timestamp
  created_at timestamp
  updated_at timestamp
}

Table day_report_entries {
  id uuid [pk]
  day_report_id uuid [ref: > day_reports.id]
  project_id uuid [ref: > projects.id]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  website_profile_id uuid [ref: > website_profiles.id]
  task_category varchar
  task_description text
  hours decimal
  start_time time
  end_time time
  output_type varchar
  output_url varchar
  attachments jsonb
  created_at timestamp
  updated_at timestamp
}

Table articles {
  id uuid [pk]
  website_profile_id uuid [ref: > website_profiles.id]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  title varchar
  slug varchar
  channel varchar
  content_status varchar
  author_id uuid [ref: > users.id]
  word_count integer
  hours_spent decimal
  target_keywords jsonb
  other_tags jsonb
  publish_date date
  url varchar
  seo_score integer
  created_at timestamp
  updated_at timestamp
}

Table videos {
  id uuid [pk]
  website_profile_id uuid [ref: > website_profiles.id]
  video_channel_id uuid [ref: > video_channels.id]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  title varchar
  description text
  video_type varchar
  status varchar
  shoot_date date
  publish_date date
  duration_seconds integer
  thumbnail_url varchar
  file_url varchar
  editor_id uuid [ref: > users.id]
  editing_hours decimal
  platforms jsonb
  crew jsonb
  notes text
  created_at timestamp
  updated_at timestamp
}

Table video_channels {
  id uuid [pk]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  channel_number varchar
  internal_name varchar
  public_name varchar
  importance varchar
  device_type varchar
  status varchar
  video_count integer
  created_at timestamp
  updated_at timestamp
}

Table video_uploads {
  id uuid [pk]
  video_id uuid [ref: > videos.id]
  platform varchar
  upload_status varchar
  upload_date date
  video_url varchar
  views integer
  created_at timestamp
  updated_at timestamp
}

Table social_posts {
  id uuid [pk]
  website_profile_id uuid [ref: > website_profiles.id]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  platform varchar
  post_type varchar
  content text
  media_urls jsonb
  scheduled_date timestamp
  published_date timestamp
  status varchar
  engagement_data jsonb
  linked_article_id uuid [ref: > articles.id]
  linked_video_id uuid [ref: > videos.id]
  author_id uuid [ref: > users.id]
  hours_spent decimal
  post_url varchar
  tags jsonb
  created_at timestamp
  updated_at timestamp
}

Table seo_keywords {
  id uuid [pk]
  website_profile_id uuid [ref: > website_profiles.id]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  keyword varchar
  level varchar
  search_volume integer
  current_ranking integer
  target_ranking integer
  target_page varchar
  difficulty_score integer
  assigned_article_id uuid [ref: > articles.id]
  status varchar
  ai_generated boolean
  created_at timestamp
  updated_at timestamp
}

Table seo_ranking_history {
  id uuid [pk]
  keyword_id uuid [ref: > seo_keywords.id]
  ranking_position integer
  recorded_date date
  search_engine varchar
  created_at timestamp
  updated_at timestamp
}

Table seo_upgrades {
  id uuid [pk]
  website_profile_id uuid [ref: > website_profiles.id]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  upgrade_type varchar
  supplier_id uuid [ref: > suppliers.id]
  tool_name varchar
  service_description text
  cost decimal
  currency varchar
  start_date date
  end_date date
  completion_date date
  assigned_staff_id uuid [ref: > users.id]
  hours_spent decimal
  ranking_before jsonb
  ranking_after jsonb
  status varchar
  notes text
  created_at timestamp
  updated_at timestamp
}

Table paid_ads {
  id uuid [pk]
  website_profile_id uuid [ref: > website_profiles.id]
  project_id uuid [ref: > projects.id]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  campaign_name varchar
  platform varchar
  ad_type varchar
  budget decimal
  actual_spend decimal
  currency varchar
  start_date date
  end_date date
  status varchar
  target_audience text
  impressions integer
  clicks integer
  conversions integer
  cpc decimal
  ctr decimal
  roas decimal
  credit_card_id uuid [ref: > credit_cards.id]
  notes text
  created_at timestamp
  updated_at timestamp
}

Table edm_campaigns {
  id uuid [pk]
  website_profile_id uuid [ref: > website_profiles.id]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  campaign_type varchar
  subject varchar
  template_id uuid [ref: > edm_templates.id]
  template_name varchar
  recipient_list varchar
  recipient_count integer
  send_date timestamp
  status varchar
  hours_spent decimal
  open_rate decimal
  click_rate decimal
  bounce_rate decimal
  linked_article_id uuid [ref: > articles.id]
  notes text
  created_at timestamp
  updated_at timestamp
}

Table edm_templates {
  id uuid [pk]
  company_id uuid [ref: > companies.id]
  template_name varchar
  template_type varchar
  subject_template varchar
  content_template text
  created_at timestamp
  updated_at timestamp
}

Table suppliers {
  id uuid [pk]
  company_id uuid [ref: > companies.id]
  name varchar
  category varchar
  contact_person varchar
  email varchar
  phone varchar
  website varchar
  contract_status varchar
  service_type varchar
  fee_range varchar
  average_rating decimal
  is_recommended boolean
  total_spend decimal
  notes text
  created_at timestamp
  updated_at timestamp
}

Table supplier_reviews {
  id uuid [pk]
  supplier_id uuid [ref: > suppliers.id]
  reviewer_id uuid [ref: > users.id]
  quality_score integer
  timeliness_score integer
  communication_score integer
  price_score integer
  reliability_score integer
  overall_score decimal
  comment text
  review_date date
  created_at timestamp
  updated_at timestamp
}

Table quotations {
  id uuid [pk]
  quote_number varchar [unique]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  project_id uuid [ref: > projects.id]
  client_name varchar
  project_type varchar
  status varchar
  subtotal decimal
  tax decimal
  total decimal
  currency varchar
  valid_until date
  approved_by uuid [ref: > users.id]
  notes text
  company_name_snapshot varchar
  company_br_no_snapshot varchar
  company_bank_snapshot varchar
  company_bank_account_snapshot varchar
  company_address_snapshot text
  created_at timestamp
  updated_at timestamp
}

Table quotation_items {
  id uuid [pk]
  quotation_id uuid [ref: > quotations.id]
  item_name varchar
  description text
  quantity integer
  unit_price decimal
  total_price decimal
  sort_order integer
  created_at timestamp
  updated_at timestamp
}

Table invoices {
  id uuid [pk]
  invoice_number varchar [unique]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  quotation_id uuid [ref: > quotations.id]
  client_name varchar
  amount decimal
  tax decimal
  total decimal
  currency varchar
  due_date date
  payment_status varchar
  paid_amount decimal
  paid_date date
  receipt_url varchar
  notes text
  company_name_snapshot varchar
  company_br_no_snapshot varchar
  company_bank_snapshot varchar
  company_bank_account_snapshot varchar
  company_address_snapshot text
  created_at timestamp
  updated_at timestamp
}

Table clients {
  id uuid [pk]
  company_id uuid [ref: > companies.id]
  company_name_zh varchar
  company_name_en varchar
  brand_name varchar
  industry varchar
  contact_person varchar
  phone varchar
  whatsapp varchar
  email varchar
  address text
  inquiry_date date
  status varchar
  notes text
  created_at timestamp
  updated_at timestamp
}

Table client_projects {
  id uuid [pk]
  client_id uuid [ref: > clients.id]
  company_id uuid [ref: > companies.id]
  project_name varchar
  description text
  status varchar
  start_date date
  end_date date
  budget decimal
  currency varchar
  notes text
  created_at timestamp
  updated_at timestamp
}

Table plugins {
  id uuid [pk]
  website_profile_id uuid [ref: > website_profiles.id]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  plugin_name varchar
  description text
  cost decimal
  currency varchar
  billing_cycle varchar
  expiry_date date
  status varchar
  auto_renew boolean
  notes text
  created_at timestamp
  updated_at timestamp
}

Table credit_cards {
  id uuid [pk]
  company_id uuid [ref: > companies.id]
  company_name varchar
  last_four_digits varchar
  cvs varchar
  expiry_date date
  bank varchar
  purpose varchar
  card_holder varchar
  custodian varchar
  is_active boolean
  notes text
  created_at timestamp
  updated_at timestamp
}

Table notifications {
  id uuid [pk]
  user_id uuid [ref: > users.id]
  company_id uuid [ref: > companies.id]
  notification_type varchar
  title varchar
  description text
  severity varchar
  is_read boolean
  action_url varchar
  created_at timestamp
  updated_at timestamp
}

Table training_modules {
  id uuid [pk]
  title varchar
  description text
  category varchar
  resource_type varchar
  content_url varchar
  duration_minutes integer
  required_for_roles jsonb
  is_recommended boolean
  sort_order integer
  is_active boolean
  created_at timestamp
  updated_at timestamp
}

Table training_progress {
  id uuid [pk]
  user_id uuid [ref: > users.id]
  module_id uuid [ref: > training_modules.id]
  status varchar
  started_at timestamp
  completed_at timestamp
  score integer
  created_at timestamp
  updated_at timestamp
}

Table year_plans {
  id uuid [pk]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  year integer
  target_revenue decimal
  target_projects integer
  target_articles integer
  target_videos integer
  target_social_posts integer
  notes text
  created_at timestamp
  updated_at timestamp
}

Table app_config {
  id uuid [pk]
  config_key varchar [unique]
  config_value jsonb
  is_default boolean
  created_at timestamp
  updated_at timestamp
}

Table login_requests {
  id uuid [pk]
  requester_name varchar
  requester_email varchar
  department varchar
  role varchar
  reason text
  status varchar
  processed_by uuid [ref: > users.id]
  processed_at timestamp
  created_at timestamp
  updated_at timestamp
}

Table login_logs {
  id uuid [pk]
  user_id uuid [ref: > users.id]
  user_name varchar
  user_email varchar
  login_at timestamp
  created_at timestamp
  updated_at timestamp
}

Table report_templates {
  id uuid [pk]
  user_id uuid [ref: > users.id]
  template_name varchar
  task_category varchar
  website_profile_id uuid [ref: > website_profiles.id]
  task_description text
  hours decimal
  start_time time
  end_time time
  created_at timestamp
  updated_at timestamp
}

Table content_entries {
  id uuid [pk]
  website_profile_id uuid [ref: > website_profiles.id]
  company_id uuid [ref: > companies.id]
  brand_id uuid [ref: > brands.id]
  title varchar
  content_type varchar
  planned_date date
  status varchar
  notes text
  ai_generated boolean
  created_at timestamp
  updated_at timestamp
}

Table notification_preferences {
  id uuid [pk]
  user_id uuid [ref: > users.id]
  credit_card_expiry_enabled boolean
  plugin_expiry_enabled boolean
  login_request_enabled boolean
  advance_days integer [default: 30]
  email_recipients jsonb
  created_at timestamp
  updated_at timestamp
}
```

> 📌 將以上 DBML 複製到 [dbdiagram.io](https://dbdiagram.io) 即可生成完整 ERD 圖形。
