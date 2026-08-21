---
name: daily-report
description: Generate today's Traditional Chinese daily work report from git commits and Cursor cloud agents. Use when the user says "daily report skill", "daily report", "/daily-report", "今日報告", "每日報告", or asks for today's standup or status report.
---

# Daily Report

Generate **today's** work report for this repository. Output the report in the chat. Do not write a file unless the user asks.

## When to use

- The user says "daily report skill", "daily report", "今日報告", or "每日報告"
- The user asks for today's standup / status / 今日任務報告

## Hard rules

1. **Today only.** Use the conversation's "Today's date". Treat the business day as **Asia/Hong_Kong (UTC+8)**. Do not reuse or summarize a previous day's report. Only include another day if the user names that date.
2. **Traditional Chinese only.** Module names, titles, and descriptions must be 繁體中文. Do not use Simplified Chinese. English is allowed only for product codes, route hashes, and model names (e.g. `Facebook Ads`, `#marketing/facebook-ads`, `Cursor Grok 4.6`).
3. **Outcomes, not actions.** Each item is the user-facing result, in one short sentence. Do not list implementation steps, table/column names, file paths, API details, or per-commit diffs.
4. **One block per module.** After every `{模組}（N 項）` line, start a new paragraph (blank line) before the numbered item. Never put the module name and `1.` / `2.` / `3.` on the same line.

## Gather sources

Collect work that landed **today** (Hong Kong calendar day):

1. `git fetch origin main` then `git log origin/main` for commits whose author date falls on today in `Asia/Hong_Kong`.
2. Cursor Cloud MCP `list-cloud-agents` with `createdAfter` / `createdBefore` covering that same Hong Kong day (convert to UTC). Include archived agents. Page if `hasMore`.
3. Use agent `name` + commit subject to group work. Read commit bodies only when the subject is too vague to name the outcome.
4. Optional: `batch-fetch-details` when several agents look related and you need to merge them into one outcome.

Exclude:

- This daily-report run itself
- Agents with no user-visible outcome (questions, cancelled, no commit and no shipped change)
- Merge commits that only replay a change already listed
- Work that belongs to another calendar day

If both git and cloud agents are empty, say so in 繁體中文 and stop. Do not invent items.

## Group and merge

Group items by product module. Infer the module from the UI / nav name, not from the git path. Typical modules:

- 行銷管理
- 專案策劃
- 平面設計
- 影片製作
- 網站系統
- 工時匯報
- 提案
- BWA
- General（跨模組、登入、git 政策、文件）

Merge related commits or agents into **one** item when they serve the same outcome (e.g. a page plus a small follow-up on that page). Split only when the user-facing results are different.

## Output format

Match this template. No extra commentary before or after, except a one-line empty-day note when needed.

Chat Markdown **merges the next line into the module name** when an ordered item does not start at `1.` (so `2.` / `3.` after `客戶報價（1 項）` becomes one cluttered line). Prevent that with a **bold module line**, then a **blank line**, then the item.

```
今日任務報告（YYYY-MM-DD）

**{模組}（N 項）**

1. [類型 · complete] 繁中成果標題
一句話說明使用者現在能做什麼，或畫面上有什麼改變。
（模型名稱）

**{下一模組}（N 項）**

2. [類型 · complete] 繁中成果標題
一句話說明使用者現在能做什麼，或畫面上有什麼改變。
（模型名稱）
```

Rules for the template:

- Start at `1.` and number continuously across modules.
- `{模組}（N 項）` uses the count of items in that module only.
- **Layout (required).** Write `**{模組}（N 項）**` on its own line. Put a blank line after every module header before the first `N.` item. Put a blank line before every later module header. Never write the module name and `N.` on the same line. Do not skip the blank line after the first module either.
- **類型** is one of: `frontend` / `bugfix` / `chore` / `backend`. Default to `frontend` for UI work, `bugfix` for a broken behavior that was fixed, `chore` for cleanup / policy / login / docs, `backend` for API or data-only work with no UI.
- Status is `complete` only when the change is on `origin/main` (or the user said it is done). Use `in progress` if it did not land.
- Title: short Traditional Chinese outcome, not the raw commit subject.
- Description: one sentence, outcome only. No "how".
- Model line: map `originalModelName` (or commit author context) to a short label:
  - `cursor-grok-4.6…` → `Cursor Grok 4.6`
  - `cursor-grok-4.5…` → `Cursor Grok 4.5`
  - otherwise use the family name the user would recognize
- If one item used more than one model, keep the latest.
- After the last item, add a single footer line: `HEAD：{short SHA}` for today's latest `origin/main` commit. Do not invent a separate "push to main" chore unless that was itself a requested task.

## Style examples

Good (two modules — note the blank line after each module name):

```
**行銷管理（1 項）**

1. [frontend · complete] Facebook 廣告活動詳情
列表可點進活動詳情，查看成效與拆解。
（Cursor Grok 4.6）

**客戶報價（1 項）**

2. [frontend · complete] Pitching 與 Project 可編輯並綁定客戶
列表可開啟編輯，儲存時會記下所選客戶。
（Cursor Grok 4.6）
```

Bad (module name and `2.` on one line — chat Markdown does this if the blank line is missing):

```
客戶報價（1 項） 2. [frontend · complete] Pitching 與 Project 可編輯並綁定客戶 列表可開啟編輯，儲存時會記下所選客戶。 （Cursor Grok 4.6）
```

Bad (too detailed / English title / implementation):

```
1. [frontend · complete] Add Facebook Ads campaign detail page with live Meta breakdowns
Clicking a row opens a detail view that reuses the Google Ads shell; daily metrics come from the warehouse; Ad Sets are fetched from the Meta Marketing API.
```

## Do not

- Do not create a branch or pull request for this skill
- Do not commit the generated report
- Do not ask the user to pick a date when "today" is already known
- Do not pad the report with process notes, tool logs, or source lists
