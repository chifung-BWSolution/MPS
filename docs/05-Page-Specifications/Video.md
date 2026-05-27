# Page Specification — Video (影片製作)

## Route: `/video`

### Sub-routes
| Path | Label | Description |
|------|-------|-------------|
| `/video/list` | 影片列表 | 所有影片 CRUD |
| `/video/channels` | 影片頻道 | 頻道管理 |
| `/video/schedule` | 拍攝排期 | 拍攝時間表 |
| `/video/distribution` | 發佈追蹤 | 多平台發佈狀態 |

---

## Video List Sub-page

### 篩選列

```
[公司▼] [品牌▼] [網站▼] [頻道▼] [狀態▼] [類型▼] [搜尋...]  [+新增]
```

### 卡片視圖

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ 📹 縮圖          │  │ 📹 縮圖          │  │ 📹 縮圖          │
│                   │  │                   │  │                   │
│ BW品牌形象片      │  │ ACI頒獎典禮      │  │ FCC品酒教學      │
│ BWD • BW          │  │ BWD • ACI         │  │ ZF • FCC          │
│ 🎬 後製中         │  │ ✅ 已發佈         │  │ 📋 規劃中         │
│ 3:45 | 陳小華     │  │ 5:30 | 李美玲    │  │ — | 待指派        │
│ 拍攝: 01-10      │  │ 發佈: 01-05      │  │ 拍攝: 01-20      │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### 狀態進度條 (5 階段)

```
[Planning] → [Shooting] → [Post-Production] → [Completed] → [Published]
   📋            🎬              ✂️                 ✅            🌐
```

### 新增影片表單

| 欄位組 | 欄位 |
|--------|------|
| 基本 | title*, video_type*, description |
| 歸屬 | company_id*, brand_id*, website_profile_id, video_channel_id |
| 製作 | shoot_date, editor_id, editing_hours |
| 檔案 | thumbnail_url, file_url, duration_seconds |
| 團隊 | crew[]: {userId, role} |
| 發佈 | publish_date, platforms[] |

---

## Video Channels Sub-page

### 頻道列表

```
┌─────────────────────────────────────────────────────────────────┐
│ [公司▼] [品牌▼] [重要性▼] [狀態▼]                [+新增頻道]  │
├─────────────────────────────────────────────────────────────────┤
│ # │ 內部名稱    │ 公開名稱     │ 品牌 │ 重要性│ 裝置 │影片數│狀態│
│───┼─────────────┼──────────────┼──────┼───────┼──────┼──────┼────│
│ 1 │ BW-Main     │ BWDesign官方 │ BW   │ ⭐A1  │ Both │ 24   │ 🟢 │
│ 2 │ ACI-Events  │ ACI活動紀錄 │ ACI  │ ⭐A2  │ Both │ 12   │ 🟢 │
│ 3 │ FCC-Wine    │ 品酒天地     │ FCC  │ ⭐A3  │ Mobile│ 6   │ 🟢 │
│ 4 │ BW-Tutorial │ BW教學頻道  │ BW   │ ⭐A4  │ Desktop│ 8  │ ⏸️ │
└─────────────────────────────────────────────────────────────────┘
```

### 重要性等級說明

| 等級 | 星級 | 建議更新頻率 | 顏色 |
|------|------|-------------|------|
| A1 | ⭐⭐⭐⭐⭐ | 每週 | Red |
| A2 | ⭐⭐⭐⭐ | 每2週 | Orange |
| A3 | ⭐⭐⭐ | 每月 | Yellow |
| A4 | ⭐⭐ | 按需 | Blue |
| A5 | ⭐ | 不定期 | Gray |

### 新增頻道表單

| 欄位 | 類型 | 必填 |
|------|------|------|
| 頻道編號 | Text (如 CH-001) | ✅ |
| 內部名稱 | Text | ✅ |
| 公開名稱 | Text | ✅ |
| 公司 | Select | ✅ |
| 品牌 | Select (級聯) | ✅ |
| 重要性 | Select (A1-A5) | ✅ |
| 裝置類型 | Select (desktop/mobile/both) | ✅ |

---

## Shooting Schedule Sub-page

### 時間軸視圖

```
January 2025
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │ Sun │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│     │     │  1  │  2  │  3  │     │     │
│     │     │     │     │     │     │     │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│  6  │  7  │  8  │  9  │ 10  │     │     │
│     │     │     │ 🎬  │ 🎬  │     │     │
│     │     │     │ BW  │ BW  │     │     │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│ 13  │ 14  │ 15  │ 16  │ 17  │     │     │
│     │     │ 🎬  │     │     │     │     │
│     │     │ ACI │     │     │     │     │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┘
```

- 點擊拍攝日可看詳情
- 顯示：拍攝項目名稱、團隊、地點
- 即將到來的拍攝高亮

---

## Distribution Tracking Sub-page

### 發佈狀態追蹤

```
┌─────────────────────────────────────────────────────────────────┐
│ 影片: BW品牌形象片                                               │
├─────────────────────────────────────────────────────────────────┤
│ Platform    │ 狀態      │ 發佈日期   │ URL          │ Views    │
│─────────────┼───────────┼────────────┼──────────────┼──────────│
│ 🎬 YouTube │ ✅ 已上傳  │ 2025-01-10│ youtu.be/... │ 1,500    │
│ 📘 Facebook│ ✅ 已上傳  │ 2025-01-11│ fb.com/...   │ 800      │
│ 📷 Instagram│ ⏳ 排期中 │ 2025-01-15│ —            │ —        │
│ 🎵 TikTok  │ ⏳ 待上傳  │ —         │ —            │ —        │
│ 📕 小紅書   │ ❌ 未計劃  │ —         │ —            │ —        │
└─────────────────────────────────────────────────────────────────┘
```

- 可 inline 更新上傳狀態
- 輸入 views 數據
- 點擊 URL 直接跳轉

---

## 組件結構

```
VideoModule.tsx
├── VideoListModule.tsx          // 影片列表
├── VideoChannelsModule.tsx      // 頻道管理
│   └── VideoChannelsList.tsx    // 頻道列表
├── ShootingScheduleModule.tsx   // 拍攝排期
├── VideoDistribution.tsx        // 發佈追蹤
└── DistributionTrackingModule.tsx
```

---

## 數據交互

| 操作 | Table(s) |
|------|----------|
| 影片列表 | videos JOIN website_profiles, companies, brands |
| 頻道列表 | video_channels JOIN companies, brands |
| 新增影片 | INSERT videos |
| 更新狀態 | UPDATE videos.status |
| 發佈追蹤 | video_uploads WHERE video_id |
| 記錄上傳 | INSERT/UPDATE video_uploads |
| 拍攝排期 | SELECT videos WHERE shoot_date BETWEEN ... |
