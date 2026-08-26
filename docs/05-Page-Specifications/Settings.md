# Page Specification — Settings (系統設定)

## Route: `/settings`

### Sub-routes
| Path | Label | Description |
|------|-------|-------------|
| `/settings/profile` | 個人設定 | 修改個人資料 |
| `/settings/users` | 用戶管理 | CRUD 用戶 |
| `/settings/companies` | 公司管理 | 公司 CRUD |
| `/settings/brands` | 品牌管理 | 品牌 CRUD |
| `/settings/roles` | 角色權限 | 查看權限矩陣 |
| `/settings/options` | 選項設定 | 系統參數 |
| `/settings/credit-cards` | 信用卡管理 | 公司信用卡 |
| `/settings/login-logs` | 登入紀錄 | 歷史記錄 |

---

## Profile Sub-page

### 表單

| 欄位 | 可編輯 |
|------|--------|
| 頭像 | ✅ (上傳) |
| 全名 | ✅ |
| Email | ❌ (顯示) |
| 角色 | ❌ (顯示) |
| 部門 | ✅ |
| 密碼 | ✅ (修改) |

---

## Users Sub-page (僅管理層)

### 用戶列表

```
┌─────────────────────────────────────────────────────────────────┐
│ [搜尋...] [角色▼] [狀態▼]                       [+ 邀請用戶]  │
├─────────────────────────────────────────────────────────────────┤
│ 頭像│ 姓名    │ Email              │ 角色   │ 可存取公司│ 狀態 │
│─────┼─────────┼────────────────────┼────────┼───────────┼──────│
│ 👤  │ 張偉明  │ wm.zhang@...      │ 管理層 │ 全部      │ 🟢   │
│ 👤  │ 陳小華  │ xh.chen@...       │ PM     │ BWD, ZF   │ 🟢   │
│ 👤  │ 李美玲  │ ml.li@...         │ 設計師 │ BWD       │ 🟢   │
│ 👤  │ 朴賢俊  │ hj.park@...       │ 市場   │ BWD, ZF   │ 🟢   │
└─────────────────────────────────────────────────────────────────┘
```

### 操作
- 邀請用戶 (Supabase Auth invite)
- 編輯角色/權限
- 修改 accessible_companies
- 停用用戶

---

## Companies Sub-page (僅管理層)

### 公司管理（同 `/companies`）

| 操作 | 說明 |
|------|------|
| 列表 | 卡片/表格切換 |
| 新增 | 表單: 編碼、名稱、BR、銀行、地址 |
| 編輯 | 所有欄位可修改 |
| 停用 | is_active = false |

---

## Brands Sub-page (僅管理層)

### 品牌管理（同 `/brands`）

- 按公司分組顯示
- 新增時必須選擇公司
- 編輯品牌主色、Logo等

---

## Login Logs Sub-page

### 記錄列表

```
┌─────────────────────────────────────────────────────────────────┐
│ 最近登入記錄                                     [匯出 CSV]    │
├─────────────────────────────────────────────────────────────────┤
│ 時間                │ 用戶     │ Email            │ IP          │
│─────────────────────┼──────────┼──────────────────┼─────────────│
│ 2025-01-15 09:03    │ 張偉明   │ wm.zhang@...    │ 192.168.1.1│
│ 2025-01-15 09:15    │ 陳小華   │ xh.chen@...     │ 192.168.1.2│
│ 2025-01-14 18:30    │ 李美玲   │ ml.li@...       │ 192.168.1.3│
└─────────────────────────────────────────────────────────────────┘
```

---

## 組件結構

```
SettingsModule.tsx
├── ProfileSettings.tsx
├── UserManagement.tsx
├── CompanyManagementSettings.tsx
├── BrandManagementSettings.tsx
├── RolePermissions.tsx
├── SystemOptions.tsx
├── CreditCardSettings.tsx
└── LoginLogs.tsx
```

---

## 權限

| Sub-page | Management | PM | Others |
|----------|:----------:|:--:|:------:|
| Profile | ✅ | ✅ | ✅ |
| Users | ✅ | ❌ | ❌ |
| Companies | ✅ | ❌ | ❌ |
| Brands | ✅ | ❌ | ❌ |
| Roles | ✅ | ❌ | ❌ |
| Options | ✅ | ❌ | ❌ |
| Credit Cards | ✅ | ❌ | ❌ |
| Login Logs | ✅ | ❌ | ❌ |
