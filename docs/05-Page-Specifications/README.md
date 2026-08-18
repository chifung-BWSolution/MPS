# 05 — Page Specifications

## Marketing Project System — 頁面規格文件索引 v2.1

---

## 文件列表

| # | 文件 | 頁面 | 路由 |
|---|------|------|------|
| 1 | [Dashboard.md](./Dashboard.md) | 首頁儀表板 | `/dashboard` |
| 2 | [Day-Report.md](./Day-Report.md) | 工作匯報 | `/day-report` |
| 3 | [Project.md](./Project.md) | 專案策劃 | `/project` |
| 4 | [Website-Detail.md](./Website-Detail.md) | 網站管理（樞紐頁） | `/website/:id` |
| 4b | [Website-Traffic.md](./Website-Traffic.md) | 網站流量（GA4） | `#website/traffic` |
| 5 | [Marketing.md](./Marketing.md) | 行銷管理 | `/marketing` |
| 6 | [Video.md](./Video.md) | 影片製作 | `/video` |
| 7 | [Quotation-Invoice.md](./Quotation-Invoice.md) | 報價與發票 | `/quotation` |
| 8 | [Supplier.md](./Supplier.md) | 供應商 | `/supplier` |
| 9 | [Report.md](./Report.md) | 報表分析 | `/report` |
| 10 | [Tools-Center.md](./Tools-Center.md) | 工具中心 | `/tools-center` |
| 11 | [Finance.md](./Finance.md) | 財務管理 | `/finance` |
| 12 | [Settings.md](./Settings.md) | 系統設定 | `/settings` |

---

## 各文件包含內容

每個頁面規格文件包含：

1. **路由結構** — 主路由 + 子路由
2. **佈局線稿** — ASCII 線稿顯示頁面結構
3. **數據欄位** — 表格列出所有顯示/輸入欄位
4. **組件結構** — Component tree
5. **數據源** — 使用的 Table + 查詢邏輯
6. **交互說明** — 用戶操作流程
7. **驗證規則** — 表單驗證
8. **權限** — 角色可見性

---

## 通用規則

### 所有頁面共同元素

1. **返回 Dashboard 按鈕** — 左上角固定
2. **麵包屑** — 顯示當前位置
3. **公司/品牌上下文** — 頂部顯示當前篩選
4. **響應式** — Desktop → Tablet → Mobile 自適應

### 表格通用功能

- 搜尋
- 排序（點擊表頭）
- 篩選（下拉多選）
- 分頁 (25/50/100 per page)
- 匯出 (CSV)

### Modal/表單通用規則

- 必填欄位標 `*`
- 即時驗證 (onBlur)
- 提交按鈕 disabled until valid
- 成功後 Toast 通知
- 載入中顯示 Spinner
