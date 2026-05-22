# 04 — Role & Permission Matrix + RLS Policies

## Marketing Project System — 角色權限與 RLS 政策文件 v2.1

---

## 1. 角色概覽 (Role Overview)

| # | 角色 ID | 中文名稱 | 英文名稱 | 人數預估 |
|---|---------|----------|----------|----------|
| 1 | `management` | 管理層 | Management | 1-3 |
| 2 | `project_manager` | 項目經理 | Project Manager (PM) | 2-4 |
| 3 | `designer` | 設計師/內容人員 | Designer | 3-6 |
| 4 | `accountant` | 會計 | Accountant | 1-2 |
| 5 | `copywriter` | 文案同事 | Copywriter | 2-4 |
| 6 | `video_editor` | 影片剪輯 | Video Editor | 1-3 |
| 7 | `marketing` | 市場推廣 | Marketing | 2-4 |

---

## 2. 模組存取權限矩陣 (Module Access Matrix)

| 模組 | Management | PM | Designer | Accountant | Copywriter | Video Editor | Marketing |
|------|:----------:|:--:|:--------:|:----------:|:----------:|:------------:|:---------:|
| Dashboard | ✅ Full | ✅ Full | ✅ Limited | ✅ Finance | ✅ Limited | ✅ Limited | ✅ Limited |
| Day Report | ✅ All | ✅ Team | ✅ Own | ❌ | ✅ Own | ✅ Own | ✅ Own |
| Quotation | ✅ All | ✅ Create+View | ❌ | ✅ View | ❌ | ❌ | ❌ |
| Project | ✅ All | ✅ Assigned | ❌ | ❌ | ❌ | ❌ | ❌ |
| Website | ✅ All | ✅ Assigned | ❌ | ❌ | ❌ | ❌ | ❌ |
| Marketing | ✅ All | ✅ View | ✅ Assigned | ❌ | ✅ Social/Content | ❌ | ✅ Full |
| Video | ✅ All | ✅ View | ✅ Assigned | ❌ | ❌ | ✅ Full | ❌ |
| Supplier | ✅ All | ✅ View+Review | ❌ | ✅ View | ❌ | ❌ | ❌ |
| Report | ✅ All | ✅ Limited | ❌ | ✅ Finance | ❌ | ❌ | ❌ |
| Tools Center | ✅ All | ✅ All | ✅ Training | ❌ | ✅ AI Tools | ❌ | ✅ AI+SEO |
| Finance | ✅ All | ❌ | ❌ | ✅ Full | ❌ | ❌ | ❌ |
| Companies | ✅ Full | ❌ | ❌ | ✅ View | ❌ | ❌ | ❌ |
| Brands | ✅ Full | ✅ View | ❌ | ❌ | ❌ | ❌ | ❌ |
| Settings | ✅ Full | ✅ Profile | ✅ Profile | ✅ Profile | ✅ Profile | ✅ Profile | ✅ Profile |

---

## 3. 操作權限細節 (CRUD Permissions)

### 3.1 Companies (公司管理)

| 操作 | Management | PM | Designer | Accountant | Copywriter | Video Editor | Marketing |
|------|:----------:|:--:|:--------:|:----------:|:----------:|:------------:|:---------:|
| 列表查看 | ✅ All | ✅ Accessible | ❌ | ✅ Accessible | ❌ | ❌ | ❌ |
| 查看詳情 | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 新增 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 編輯 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 停用/刪除 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 3.2 Projects (項目管理)

| 操作 | Management | PM | Designer | Accountant | Copywriter | Video Editor | Marketing |
|------|:----------:|:--:|:--------:|:----------:|:----------:|:------------:|:---------:|
| 列表查看 | ✅ All | ✅ Assigned | ❌ | ❌ | ❌ | ❌ | ❌ |
| 查看詳情 | ✅ | ✅ Assigned | ❌ | ❌ | ❌ | ❌ | ❌ |
| 新增 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 編輯 | ✅ | ✅ Assigned | ❌ | ❌ | ❌ | ❌ | ❌ |
| 刪除 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 預算管理 | ✅ | ✅ Assigned | ❌ | ✅ View | ❌ | ❌ | ❌ |

### 3.3 Day Reports (工作匯報)

| 操作 | Management | PM | Designer | Accountant | Copywriter | Video Editor | Marketing |
|------|:----------:|:--:|:--------:|:----------:|:----------:|:------------:|:---------:|
| 查看所有 | ✅ | ✅ Team | ❌ | ❌ | ❌ | ❌ | ❌ |
| 查看自己 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| 提交匯報 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| 審批匯報 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 退回匯報 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 工時統計 | ✅ All | ✅ Team | ✅ Own | ❌ | ✅ Own | ✅ Own | ✅ Own |

### 3.4 Quotations (報價管理)

| 操作 | Management | PM | Designer | Accountant | Copywriter | Video Editor | Marketing |
|------|:----------:|:--:|:--------:|:----------:|:----------:|:------------:|:---------:|
| 列表查看 | ✅ All | ✅ Own | ❌ | ✅ All | ❌ | ❌ | ❌ |
| 建立報價 | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 審批報價 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 發送客戶 | ✅ | ✅ Own | ❌ | ❌ | ❌ | ❌ | ❌ |
| 生成發票 | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |

### 3.5 Finance (財務管理)

| 操作 | Management | PM | Designer | Accountant | Copywriter | Video Editor | Marketing |
|------|:----------:|:--:|:--------:|:----------:|:----------:|:------------:|:---------:|
| 發票列表 | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 記錄付款 | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 信用卡管理 | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 按公司財報 | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 匯出報告 | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |

### 3.6 Video (影片管理)

| 操作 | Management | PM | Designer | Accountant | Copywriter | Video Editor | Marketing |
|------|:----------:|:--:|:--------:|:----------:|:----------:|:------------:|:---------:|
| 影片列表 | ✅ All | ✅ View | ✅ Assigned | ❌ | ❌ | ✅ All | ❌ |
| 新增影片 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 編輯影片 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ Own | ❌ |
| 頻道管理 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 發佈追蹤 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## 4. Company-Level Access Control (公司級存取控制)

### 4.1 存取邏輯

```
用戶可見數據 = 
  IF role == 'management' THEN
    所有公司數據
  ELSE
    users.accessible_companies 中列出的公司數據
  END IF
```

### 4.2 accessible_companies 範例

```json
// Management (全存取)
{ "accessible_companies": ["c1", "c2", "c3"] }

// PM (只看 BWD 和 ZF 的項目)
{ "accessible_companies": ["c1", "c2"] }

// Designer (只看 BWD)
{ "accessible_companies": ["c1"] }
```

### 4.3 Dashboard 篩選規則

- **Management**: 可切換查看任何公司/品牌/全部
- **其他角色**: 只能看到 `accessible_companies` 中的公司選項
- **全局篩選器**: Top Header 的 Company/Brand Switcher 受此規則約束

---

## 5. Row Level Security (RLS) Policies

### 5.1 前提：啟用 RLS

```sql
-- 對所有需要存取控制的表啟用 RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_report_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE edm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugins ENABLE ROW LEVEL SECURITY;
```

### 5.2 Helper Functions

```sql
-- 獲取當前用戶角色
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 獲取當前用戶可存取的公司列表
CREATE OR REPLACE FUNCTION get_accessible_companies()
RETURNS JSONB AS $$
  SELECT COALESCE(accessible_companies, '[]'::jsonb)
  FROM public.users 
  WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 檢查是否為管理層
CREATE OR REPLACE FUNCTION is_management()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'management'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 檢查是否有公司存取權
CREATE OR REPLACE FUNCTION has_company_access(company_id UUID)
RETURNS BOOLEAN AS $$
  SELECT 
    is_management() OR 
    get_accessible_companies() ? company_id::text;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### 5.3 Companies Table Policies

```sql
-- SELECT: 管理層和會計可看所有，其他角色看 accessible_companies
DROP POLICY IF EXISTS "companies_select" ON companies;
CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (
    is_management() OR
    get_user_role() = 'accountant' OR
    id::text IN (SELECT jsonb_array_elements_text(get_accessible_companies()))
  );

-- INSERT: 僅管理層
DROP POLICY IF EXISTS "companies_insert" ON companies;
CREATE POLICY "companies_insert" ON companies
  FOR INSERT WITH CHECK (
    is_management()
  );

-- UPDATE: 僅管理層
DROP POLICY IF EXISTS "companies_update" ON companies;
CREATE POLICY "companies_update" ON companies
  FOR UPDATE USING (
    is_management()
  );

-- DELETE: 僅管理層
DROP POLICY IF EXISTS "companies_delete" ON companies;
CREATE POLICY "companies_delete" ON companies
  FOR DELETE USING (
    is_management()
  );
```

### 5.4 Brands Table Policies

```sql
-- SELECT: 按公司存取權篩選
DROP POLICY IF EXISTS "brands_select" ON brands;
CREATE POLICY "brands_select" ON brands
  FOR SELECT USING (
    has_company_access(company_id)
  );

-- INSERT/UPDATE: 管理層
DROP POLICY IF EXISTS "brands_insert" ON brands;
CREATE POLICY "brands_insert" ON brands
  FOR INSERT WITH CHECK (
    is_management()
  );

DROP POLICY IF EXISTS "brands_update" ON brands;
CREATE POLICY "brands_update" ON brands
  FOR UPDATE USING (
    is_management()
  );
```

### 5.5 Projects Table Policies

```sql
-- SELECT: 公司存取權 + PM看指派的項目
DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (
    is_management() OR
    (has_company_access(company_id) AND (
      get_user_role() = 'project_manager' AND assigned_pm = auth.uid()
    )) OR
    (has_company_access(company_id) AND get_user_role() IN ('project_manager'))
  );

-- INSERT: 管理層 + PM
DROP POLICY IF EXISTS "projects_insert" ON projects;
CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (
    is_management() OR
    get_user_role() = 'project_manager'
  );

-- UPDATE: 管理層 + 指派的PM
DROP POLICY IF EXISTS "projects_update" ON projects;
CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (
    is_management() OR
    (get_user_role() = 'project_manager' AND assigned_pm = auth.uid())
  );

-- DELETE: 僅管理層
DROP POLICY IF EXISTS "projects_delete" ON projects;
CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (
    is_management()
  );
```

### 5.6 Day Reports Table Policies

```sql
-- SELECT: 自己的報告 + PM看團隊 + 管理層看全部
DROP POLICY IF EXISTS "day_reports_select" ON day_reports;
CREATE POLICY "day_reports_select" ON day_reports
  FOR SELECT USING (
    is_management() OR
    user_id = auth.uid() OR
    (get_user_role() = 'project_manager' AND reviewer_id = auth.uid())
  );

-- INSERT: 所有活躍用戶可提交自己的
DROP POLICY IF EXISTS "day_reports_insert" ON day_reports;
CREATE POLICY "day_reports_insert" ON day_reports
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

-- UPDATE: 自己的(draft狀態) + PM審批 + 管理層
DROP POLICY IF EXISTS "day_reports_update" ON day_reports;
CREATE POLICY "day_reports_update" ON day_reports
  FOR UPDATE USING (
    is_management() OR
    (user_id = auth.uid() AND status = 'draft') OR
    (get_user_role() = 'project_manager' AND status = 'submitted')
  );
```

### 5.7 Quotations Table Policies

```sql
-- SELECT: 管理層全部 + PM看自建 + 會計全部
DROP POLICY IF EXISTS "quotations_select" ON quotations;
CREATE POLICY "quotations_select" ON quotations
  FOR SELECT USING (
    is_management() OR
    get_user_role() = 'accountant' OR
    (get_user_role() = 'project_manager' AND has_company_access(company_id))
  );

-- INSERT: 管理層 + PM
DROP POLICY IF EXISTS "quotations_insert" ON quotations;
CREATE POLICY "quotations_insert" ON quotations
  FOR INSERT WITH CHECK (
    is_management() OR
    get_user_role() = 'project_manager'
  );

-- UPDATE: 管理層(審批) + PM(draft狀態)
DROP POLICY IF EXISTS "quotations_update" ON quotations;
CREATE POLICY "quotations_update" ON quotations
  FOR UPDATE USING (
    is_management() OR
    (get_user_role() = 'project_manager' AND status = 'draft')
  );
```

### 5.8 Finance Tables (Invoices, Credit Cards) Policies

```sql
-- Invoices: 管理層 + 會計
DROP POLICY IF EXISTS "invoices_select" ON invoices;
CREATE POLICY "invoices_select" ON invoices
  FOR SELECT USING (
    is_management() OR
    get_user_role() = 'accountant'
  );

DROP POLICY IF EXISTS "invoices_insert" ON invoices;
CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT WITH CHECK (
    is_management() OR
    get_user_role() = 'accountant'
  );

DROP POLICY IF EXISTS "invoices_update" ON invoices;
CREATE POLICY "invoices_update" ON invoices
  FOR UPDATE USING (
    is_management() OR
    get_user_role() = 'accountant'
  );

-- Credit Cards: 管理層 + 會計
DROP POLICY IF EXISTS "credit_cards_select" ON credit_cards;
CREATE POLICY "credit_cards_select" ON credit_cards
  FOR SELECT USING (
    is_management() OR
    (get_user_role() = 'accountant' AND has_company_access(company_id))
  );

DROP POLICY IF EXISTS "credit_cards_manage" ON credit_cards;
CREATE POLICY "credit_cards_manage" ON credit_cards
  FOR ALL USING (
    is_management()
  );
```

### 5.9 Content Tables (Articles, Videos, Social Posts) Policies

```sql
-- Articles: 按公司存取權 + 角色限制
DROP POLICY IF EXISTS "articles_select" ON articles;
CREATE POLICY "articles_select" ON articles
  FOR SELECT USING (
    is_management() OR
    has_company_access(company_id) AND get_user_role() IN (
      'project_manager', 'copywriter', 'marketing', 'designer'
    )
  );

DROP POLICY IF EXISTS "articles_insert" ON articles;
CREATE POLICY "articles_insert" ON articles
  FOR INSERT WITH CHECK (
    is_management() OR
    get_user_role() IN ('project_manager', 'copywriter', 'marketing')
  );

DROP POLICY IF EXISTS "articles_update" ON articles;
CREATE POLICY "articles_update" ON articles
  FOR UPDATE USING (
    is_management() OR
    author_id = auth.uid() OR
    get_user_role() = 'project_manager'
  );

-- Videos: 影片角色 + PM + 管理層
DROP POLICY IF EXISTS "videos_select" ON videos;
CREATE POLICY "videos_select" ON videos
  FOR SELECT USING (
    is_management() OR
    has_company_access(company_id) AND get_user_role() IN (
      'project_manager', 'video_editor', 'designer'
    )
  );

DROP POLICY IF EXISTS "videos_insert" ON videos;
CREATE POLICY "videos_insert" ON videos
  FOR INSERT WITH CHECK (
    is_management() OR
    get_user_role() IN ('project_manager', 'video_editor')
  );

DROP POLICY IF EXISTS "videos_update" ON videos;
CREATE POLICY "videos_update" ON videos
  FOR UPDATE USING (
    is_management() OR
    editor_id = auth.uid() OR
    get_user_role() = 'project_manager'
  );

-- Social Posts
DROP POLICY IF EXISTS "social_posts_select" ON social_posts;
CREATE POLICY "social_posts_select" ON social_posts
  FOR SELECT USING (
    is_management() OR
    has_company_access(company_id) AND get_user_role() IN (
      'project_manager', 'copywriter', 'marketing', 'designer'
    )
  );

DROP POLICY IF EXISTS "social_posts_manage" ON social_posts;
CREATE POLICY "social_posts_manage" ON social_posts
  FOR ALL USING (
    is_management() OR
    author_id = auth.uid() OR
    get_user_role() IN ('project_manager', 'marketing')
  );
```

### 5.10 Notifications Policies

```sql
-- 用戶只能看自己的通知
DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (
    user_id = auth.uid() OR
    (user_id IS NULL AND (
      company_id IS NULL OR has_company_access(company_id)
    ))
  );

-- 用戶可標記自己通知為已讀
DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (
    user_id = auth.uid()
  ) WITH CHECK (
    user_id = auth.uid()
  );
```

### 5.11 Suppliers Policies

```sql
-- SELECT: 管理層 + PM + 會計
DROP POLICY IF EXISTS "suppliers_select" ON suppliers;
CREATE POLICY "suppliers_select" ON suppliers
  FOR SELECT USING (
    is_management() OR
    get_user_role() IN ('project_manager', 'accountant') OR
    (company_id IS NULL)  -- 共用供應商所有人可見
  );

-- INSERT/UPDATE: 管理層 + PM
DROP POLICY IF EXISTS "suppliers_manage" ON suppliers;
CREATE POLICY "suppliers_manage" ON suppliers
  FOR ALL USING (
    is_management() OR
    get_user_role() = 'project_manager'
  );
```

---

## 6. Sidebar / Navigation 角色過濾

### 6.1 可見模組映射

```typescript
const roleModuleAccess: Record<UserRole, string[]> = {
  management: ['dashboard', 'day-report', 'quotation', 'project', 'website', 
               'marketing', 'video', 'supplier', 'report', 'tools-center', 
               'finance', 'settings'],
  
  project_manager: ['dashboard', 'day-report', 'quotation', 'project', 'website', 
                    'marketing', 'video', 'supplier', 'tools-center', 'settings'],
  
  designer: ['dashboard', 'day-report', 'video', 'marketing', 'tools-center', 'settings'],
  
  accountant: ['dashboard', 'finance', 'report', 'supplier', 'settings'],
  
  copywriter: ['dashboard', 'day-report', 'marketing', 'tools-center', 'settings'],
  
  video_editor: ['dashboard', 'day-report', 'video', 'settings'],
  
  marketing: ['dashboard', 'day-report', 'marketing', 'tools-center', 'settings'],
};
```

### 6.2 子模組過濾

```typescript
const roleSubModuleAccess: Record<UserRole, Record<string, string[]>> = {
  management: {
    // 全部子模組
  },
  project_manager: {
    dashboard: ['overview', 'my-projects', 'messages', 'updates'],
    'day-report': ['submit', 'calendar', 'team-view', 'monthly', 'analytics'],
    // ...
  },
  designer: {
    dashboard: ['overview', 'updates'],
    'day-report': ['submit', 'calendar'],
    video: ['list'],
    marketing: ['social'],
    'tools-center': ['training-modules', 'training-progress'],
  },
  // ... 其他角色
};
```

---

## 7. 審批流程權限 (Approval Workflows)

### 7.1 日報審批

```
同事提交 → PM 審批 (approve/reject) → 完成
                  ↑ 管理層可直接審批任何日報
```

### 7.2 報價審批

```
PM 建立報價 → 管理層審批 → 發送客戶 → 客戶回覆 → 生成發票
```

### 7.3 審批權限表

| 審批類型 | 可審批角色 | 觸發條件 |
|---------|----------|---------|
| 日報審批 | management, project_manager | status = 'submitted' |
| 報價審批 | management | status = 'draft' → 'sent' |
| 登入請求 | management | status = 'pending' |
| 影片上傳 | management, project_manager | — |

---

## 8. 數據隔離規則摘要

| 場景 | 規則 |
|------|------|
| 管理層 | 可見/可操作所有公司所有數據 |
| PM | 只看 accessible_companies 中的公司 + 被指派的項目 |
| 一般員工 | 只看 accessible_companies + 自己相關的數據 |
| 會計 | 可看 accessible_companies 的所有財務數據 |
| 共用供應商 | company_id = NULL 的供應商所有有權角色可見 |
| 通知 | 只看自己的 + 全域通知(user_id = NULL) |

---

## 9. 安全注意事項

1. **永遠不要在前端信任角色判斷** — RLS 是最後防線
2. **Service Role Key 僅用於 Edge Functions** — 永不暴露給前端
3. **JSONB accessible_companies 的修改** — 只有管理層可透過 Settings 修改
4. **信用卡 CVV** — 必須使用 `pgcrypto` 或 Supabase Vault 加密
5. **Snapshot 欄位** — 一旦報價/發票確認，快照欄位不可被普通 UPDATE 修改
