# Page Specification — Finance (會計財務)

## Route: `/finance`

### Sub-routes
| Path | Label | Description |
|------|-------|-------------|
| `/finance/recurring` | 自動續訂管理 | 列出所有 `recurring_expenses` |

Legacy hashes `#finance/invoices`, `#finance/payments`, `#finance/credit-cards`, and `#finance/by-company` redirect to `/finance/recurring`. Company credit cards live under 系統設定 → 信用卡管理.

---

## Recurring expenses

Sortable list of credit-card auto-renewal schedules. Default sort is `next_occurrence_date` oldest → newest.

---

## 組件結構

```
FinanceModule.tsx
└── RecurringExpensesPage.tsx
```
