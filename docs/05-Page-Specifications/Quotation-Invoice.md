# Page Specification — Quotation & Invoice (報價與發票)

## Route: `/quotation`

### Sub-routes
| Path | Label | Description |
|------|-------|-------------|
| `/quotation/list` | 報價單列表 | 所有報價單 |
| `/quotation/new` | 新建報價單 | 多步驟建立 |
| `/quotation/:id` | 報價詳情 | 查看/編輯/審批 |

---

## Quotation List

### 表格欄位

| 欄位 | 說明 | 寬度 |
|------|------|------|
| 報價單號 | quote_number (QT-YYYYMMDD-XXX) | 15% |
| 客戶 | client_name | 15% |
| 發出公司 | companies.company_name_zh | 12% |
| 項目類型 | project_type label | 10% |
| 金額 | total + currency | 12% |
| 狀態 | status badge | 10% |
| 有效期 | valid_until | 10% |
| 建立日期 | created_at | 10% |
| 操作 | 查看/編輯/複製 | 6% |

### 狀態 Pipeline 視圖

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  草稿    │ → │  已發送  │ → │  已批准  │    │  已拒絕  │    │  已過期  │
│  Draft   │    │   Sent   │    │ Approved │    │ Rejected │    │ Expired  │
│   (5)    │    │   (3)    │    │   (12)   │    │   (2)    │    │   (1)    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

---

## Quotation New (新建報價單)

### 流程步驟

```
Step 1: 選擇發出公司
  ┌─────────────────────────────────────────────────────┐
  │ 請選擇報價單發出公司：                              │
  │                                                      │
  │ ● BWDesign Centre Limited                           │
  │   BR: 12345678-000-01-25-0                          │
  │   恒生銀行 024-123-456789-001                       │
  │   香港九龍觀塘開源道62號...                         │
  │                                                      │
  │ ○ 志豐國際貿易有限公司                              │
  │   BR: 98765432-000-02-25-0                          │
  │   中國銀行(香港) 012-987-654321-002                 │
  │   香港灣仔軒尼詩道288號...                          │
  │                                                      │
  │ ⚠️ 公司資料將在確認時快照保存                        │
  └─────────────────────────────────────────────────────┘

Step 2: 客戶 & 項目資料
  ┌─────────────────────────────────────────────────────┐
  │ 客戶名稱*:    [環球貿易公司              ]          │
  │ 品牌:         [BW 志豐企業 ▼]                       │
  │ 關聯項目:     [BW 官網重建 ▼] (可選)                │
  │ 項目類型*:    [網站設計 ▼]                          │
  │ 貨幣:         [HKD ▼]                               │
  │ 有效期:       [2025-02-15]                          │
  │ 備註:         [                           ]         │
  └─────────────────────────────────────────────────────┘

Step 3: 報價項目明細
  ┌─────────────────────────────────────────────────────┐
  │ 使用模板: [無 / 網站設計標準 / 品牌設計包 ▼]       │
  │                                                      │
  │ # │ 項目名稱        │ 描述    │ 數量 │ 單價   │ 總價│
  │───┼────────────────┼─────────┼──────┼────────┼──────│
  │ 1 │ 網站設計        │ 首頁設計│  1   │ 15,000 │15000│
  │ 2 │ 切版開發        │ RWD開發 │  5   │  3,000 │15000│
  │ 3 │ 內容撰寫        │ 中英文  │ 10   │  1,000 │10000│
  │ 4 │ SEO 基礎設定    │ On-page │  1   │  5,000 │ 5000│
  │                                                      │
  │ [+ 新增項目]  [從模板插入]                          │
  │                                                      │
  │                              小計: $45,000           │
  │                              稅額: $0                │
  │                              總計: $45,000 HKD       │
  └─────────────────────────────────────────────────────┘

Step 4: 預覽確認
  ┌─────────────────────────────────────────────────────┐
  │ ═══════════════ 報價單預覽 ═══════════════          │
  │                                                      │
  │ BWDesign Centre Limited                              │
  │ BR No.: 12345678-000-01-25-0                        │
  │ 恒生銀行 024-123-456789-001                         │
  │ 香港九龍觀塘開源道62號...                           │
  │                                                      │
  │ 報價單號: QT-20250115-001                           │
  │ 日期: 2025-01-15                                    │
  │ 有效至: 2025-02-15                                  │
  │                                                      │
  │ 致: 環球貿易公司                                    │
  │ 項目: 網站設計                                      │
  │                                                      │
  │ [...項目明細表格...]                                │
  │                                                      │
  │ 總計: HKD $45,000                                   │
  │                                                      │
  │ [儲存草稿] [提交審批] [發送給客戶]                  │
  └─────────────────────────────────────────────────────┘
```

### 快照邏輯

當報價單從 `draft` 變更為 `sent` 或 `approved` 時：
```typescript
// 自動保存快照
quotation.company_name_snapshot = company.companyNameZh + ' ' + company.companyNameEn;
quotation.company_br_no_snapshot = company.brNo;
quotation.company_bank_snapshot = company.bankName;
quotation.company_bank_account_snapshot = company.bankAccount;
quotation.company_address_snapshot = company.address;
```

---

## Invoice (發票) — via Finance Module

### 生成邏輯

- 從已批准的報價單一鍵生成
- 繼承所有快照資料
- 自動生成 invoice_number: INV-YYYYMMDD-XXX

### 發票狀態流程

```
未付款 (unpaid) → 部分付款 (partial) → 已付款 (paid)
                                         ↓
                                    上傳收據 (receipt_url)

逾期規則: due_date < today AND status != 'paid' → 標記 overdue
```

---

## 組件結構

```
QuotationModule.tsx
├── QuotationList.tsx            // 列表
├── QuotationPipeline.tsx        // Pipeline 視圖
├── QuotationNew.tsx             // 新建
│   ├── StepCompanySelect.tsx    // Step 1 選擇公司
│   ├── StepClientInfo.tsx       // Step 2 客戶資料
│   ├── StepLineItems.tsx        // Step 3 項目明細
│   └── StepPreview.tsx          // Step 4 預覽
├── QuotationDetail.tsx          // 詳情/編輯
└── QuotationTemplates.tsx       // 模板管理
```

---

## 數據交互

| 操作 | API | Table |
|------|-----|-------|
| 列表 | SELECT | quotations JOIN companies |
| 新建 | INSERT | quotations + quotation_items |
| 審批 | UPDATE | quotations (status, approved_by, approved_at) |
| 快照 | UPDATE | quotations (snapshot fields) |
| 生成發票 | INSERT | invoices (from quotation data) |
| 模板 | SELECT/INSERT | (app_config or dedicated templates table) |
