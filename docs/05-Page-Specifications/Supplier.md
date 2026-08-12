# Page Specification — Supplier (供應商管理)

## Route: `/supplier`

### Sub-routes
| Path | Label | Description |
|------|-------|-------------|
| `/supplier/web-suppliers` | 網頁供應商 | 反向連結可購買網站主檔 |

> 一般「供應商列表／評價」模擬頁面已移除。目前僅保留使用 Supabase 的網頁供應商。

---

## Web Page Suppliers (網頁供應商)

> Supabase 表 `web_page_suppliers`（`useWebPageSuppliers`）。供「行銷管理 → 反向連結」選取。

### 欄位

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| 供應商名稱 | Text | ✅ | |
| 購買平台 | Text | | 例如 GuestPost.io |
| 網址 | Text (URL) | ✅ | 可購買外鏈的網站 |
| 購買費用 | Number + 幣別 USD/HKD | | 參考價 |
| 評分 | 1–5 星 | | 單維度評分 |

### 刪除規則
- 若仍有反向連結購買紀錄引用，禁止刪除並提示原因。

---

## 組件結構

```
SupplierModule.tsx
└── WebPageSupplierModule.tsx
```

---

## 數據交互

| 操作 | Source |
|------|--------|
| 列表 / CRUD | `web_page_suppliers` via `useWebPageSuppliers` |
| 刪除前引用檢查 | `backlink_purchases` via `useBacklinkPurchases` |
