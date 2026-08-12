# 01 — Technical Architecture Document

## Marketing Project System — 技術架構文件 v2.1

---

## 1. 技術棧 (Technology Stack)

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend Framework** | React | ^18.2.0 | UI Components |
| **Language** | TypeScript | ^5.8.2 | Type Safety |
| **Build Tool** | Vite | ^7.1.12 | Dev Server & Bundling |
| **Styling** | Tailwind CSS | 3.4.1 | Utility-first CSS |
| **UI Library** | ShadCN UI (Radix) | Various | Accessible Components |
| **Routing** | React Router | ^6.23.1 | Client-side Routing |
| **State Management** | React Context + useState | Built-in | Global App State |
| **Charts** | Recharts | ^2.15.4 | Data Visualization |
| **Drag & Drop** | @hello-pangea/dnd | ^18.0.1 | Kanban / Sortable |
| **Animation** | Framer Motion | ^11.18.0 | UI Transitions |
| **Forms** | React Hook Form + Zod | ^7.68.0 / ^3.25.76 | Form Management & Validation |
| **Icons** | Lucide React | ^0.394.0 | Icon System |
| **Date** | date-fns | ^3.6.0 | Date Utilities |
| **Backend** | Supabase | ^2.45.6 | PostgreSQL + Auth + Storage + Edge Functions |
| **Notifications** | Sonner | ^2.0.7 | Toast Notifications |

---

## 2. 專案結構 (Project Structure)

```
src/
├── App.tsx                          # Root router (single "/" → Home)
├── main.tsx                         # Entry point (React DOM, BrowserRouter)
├── index.css                        # Global styles (Tailwind + custom)
├── vite-env.d.ts                    # Vite type declarations
│
├── components/
│   ├── home.tsx                     # Main shell: AppProvider + AppLayout + ModuleRouter
│   ├── layout/
│   │   └── AppLayout.tsx            # Global Shell (Sidebar + TopNav + Content Area)
│   │
│   ├── dashboard/                   # 首頁 Module
│   ├── day-report/                  # 工作匯報 Module
│   ├── quotation/                   # 報價管理 Module
│   ├── project/                     # 專案策劃 Module
│   ├── website/                     # 網站管理 Module
│   ├── articles/                    # 文章管理 Module
│   ├── marketing/                   # 行銷管理 Module (Social, Ads, SEO, Backlink, …)
│   ├── video/                       # 影片製作 Module
│   ├── supplier/                    # 供應商 Module (網頁供應商)
│   ├── report/                      # 報表分析 Module
│   ├── tools-center/                # 工具中心 Module (AI + Training)
│   ├── finance/                     # 財務管理 Module
│   ├── settings/                    # 系統設定 Module
│   ├── crm/                         # CRM Module
│   └── ui/                          # ShadCN Reusable Components
│
├── context/
│   ├── AppContext.tsx               # Global state: user, navigation, company/brand filter
│   └── AuthContext.tsx              # Supabase auth session / system user
│
├── data/
│   ├── mockData.ts                  # Legacy mock helpers (falling back where hooks need them)
│   ├── websiteData.ts              # Static website fallback for useWebsiteProfiles
│   ├── websiteDetailData.ts        # Legacy per-website mock content helpers
│   └── marketingData.ts            # Marketing calendar helper data
│
├── types/
│   ├── app.ts                       # All TypeScript interfaces & type definitions
│   └── supabase.ts                  # Auto-generated Supabase types (from CLI)
│
├── hooks/
│   ├── use-mobile.tsx               # Responsive breakpoint hook
│   ├── useWebsiteProfiles.ts        # Supabase website/system profiles
│   ├── useSocialPosts.ts            # Supabase social posts
│   └── …                            # Other domain hooks (Ads, SEO, backlinks, etc.)
│
├── lib/
│   └── utils.ts                     # Utility functions (cn, formatters)
│
└── stories/                         # ShadCN component Storybook files
```

---

## 3. 路由結構 (Routing Architecture)

### 3.1 Current: Module-based Navigation (Context-driven)

The app uses a **single-page context-based router** pattern:

```
App.tsx
  └── Route "/" → Home
        └── AppProvider (context)
            └── AppLayout (sidebar + topnav)
                └── ModuleRouter (switch on currentModule)
                    ├── case 'dashboard'     → <DashboardModule />
                    ├── case 'day-report'    → <DayReportModule />
                    ├── case 'quotation'     → <QuotationModule />
                    ├── case 'project'       → <ProjectModule />
                    ├── case 'website'       → <WebsiteModule />
                    ├── case 'marketing'     → <MarketingModule />
                    ├── case 'video'         → <VideoModule />
                    ├── case 'supplier'      → <SupplierModule />
                    ├── case 'report'        → <ReportModule />
                    ├── case 'tools-center'  → <ToolsCenterModule />
                    ├── case 'finance'       → <FinanceModule />
                    └── case 'settings'      → <SettingsModule />
```

### 3.2 Target: React Router v6 Nested Routes (Migration Plan)

```
/
├── /login
├── /dashboard
│   ├── /overview
│   ├── /my-projects
│   ├── /messages
│   └── /results-update
├── /day-report
│   ├── /submit
│   ├── /calendar
│   ├── /team
│   ├── /monthly
│   └── /analytics
├── /quotation
│   ├── /list
│   ├── /new
│   └── /:id
├── /project
│   ├── /list
│   ├── /new
│   ├── /:id
│   ├── /:id/gantt
│   ├── /:id/kanban
│   └── /:id/budget
├── /website
│   ├── /list
│   └── /:id (hub page with nested tabs)
├── /marketing
│   ├── /calendar
│   ├── /social
│   ├── /google-ads
│   ├── /seo
│   ├── /backlink
│   └── /google-business
├── /video
│   ├── /list
│   ├── /channels
│   ├── /schedule
│   └── /distribution
├── /supplier
│   └── /web-suppliers
├── /report
│   ├── /performance
│   ├── /manhours
│   ├── /budget
│   └── /year-plan
├── /tools-center
│   ├── /ai-keyword
│   ├── /ai-title
│   ├── /templates
│   ├── /training-modules
│   └── /training-progress
├── /finance
│   ├── /invoices
│   ├── /payments
│   ├── /credit-cards
│   └── /by-company
├── /companies
│   ├── /list
│   ├── /new
│   └── /:id
├── /brands
│   ├── /list
│   └── /:id
└── /settings
    ├── /profile
    ├── /users
    ├── /roles
    ├── /notifications
    └── /login-logs
```

---

## 4. 狀態管理 (State Management)

### 4.1 AppContext (Navigation & User State)

```typescript
interface AppContextType {
  user: User;                              // Current logged-in user
  currentModule: string;                   // Active module ID
  setCurrentModule: (module: string) => void;
  currentSubModule: string;                // Active sub-module ID
  setCurrentSubModule: (subModule: string) => void;
  navigateTo: (module: string, subModule?: string) => void;
  sidebarCollapsed: boolean;               // Sidebar toggle
  setSidebarCollapsed: (collapsed: boolean) => void;
  selectedCompanyId: string | null;        // Global company filter
  setSelectedCompanyId: (id: string | null) => void;
  selectedBrandId: string | null;          // Global brand filter
  setSelectedBrandId: (id: string | null) => void;
}
```

### 4.2 Domain Hooks (Supabase data layer)

The former in-memory `DataStore` context has been removed. Modules load and mutate
domain data through focused hooks that talk to Supabase (with occasional static
fallback only when a query fails or returns empty).

Examples:

| Hook | Domain |
|------|--------|
| `useWebsiteProfiles` | 網站+系統 profiles (`webandsystem_list`) |
| `useSocialPosts` | 社交媒體帖文 |
| `useSeoKeywords` | SEO 關鍵字 / GSC |
| `useWebPageSuppliers` | 網頁供應商 |
| `useBacklinkPurchases` | 反向連結購買紀錄 |
| `useGoogleBusinessRegistrations` | Google Business 登記 |
| `useCompanies` / `useBrands` / `useProjects` | 公司／品牌／專案 |

### 4.3 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    User Interface                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ Sidebar  │  │ TopNav   │  │ Module Content Area   │  │
│  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘  │
│       │              │                    │               │
└───────┼──────────────┼────────────────────┼──────────────┘
        │              │                    │
        ▼              ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│         AppContext + AuthContext (nav / session)          │
│  user, currentModule, selectedCompanyId, selectedBrandId │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Domain hooks (per feature)                   │
│  useWebsiteProfiles, useSocialPosts, useSeoKeywords, …   │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Supabase Backend                             │
│  ┌───────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐  │
│  │PostgreSQL │  │  Auth   │  │ Storage │  │  Edge  │  │
│  │  (DB)     │  │         │  │ (Files) │  │  Func  │  │
│  └───────────┘  └─────────┘  └─────────┘  └────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Supabase 架構 (Backend Architecture)

### 5.1 Database (PostgreSQL)

- **21+ tables** with full FK relationships
- Multi-company architecture: `companies → brands → projects → website_profiles → content`
- Row Level Security (RLS) for role-based access
- JSONB fields for flexible data (assigned_staff, engagement_data, etc.)

### 5.2 Authentication

- **Email/Password** login
- **Magic Link** option
- Role-based session with `users.role` field
- `accessible_companies` JSONB for company-level access control

### 5.3 Storage Buckets

| Bucket | Purpose |
|--------|---------|
| `avatars` | User profile images |
| `company-logos` | Company & brand logos |
| `attachments` | Day report attachments |
| `video-thumbnails` | Video thumbnail images |
| `invoices` | Invoice PDF / receipt uploads |

### 5.4 Edge Functions

| Function | Purpose |
|----------|---------|
| `ai-keyword-generator` | OpenAI integration for SEO keyword generation |
| `ai-title-generator` | OpenAI integration for SEO title suggestions |
| `notification-scheduler` | Cron-triggered alerts (credit card expiry, plugin expiry) |
| `send-email` | Transactional email via Resend (`RESEND_API_KEY`) |
| `report-generator` | Automated performance report PDF generation |

### 5.5 Realtime Subscriptions

- `notifications` table — live bell badge updates
- `day_reports` — PM sees new submissions immediately
- `projects` — task status changes reflected in Kanban

---

## 6. UI Shell 結構 (Global Layout)

```
┌─────────────────────────────────────────────────────────────────┐
│ Top Header Bar                                                   │
│ [Company/Brand Switcher] [Global Search ⌘K] [🔔 3] [Avatar+Role]│
│ [+ New]                                                          │
├───────┬─────────────────────────────────────────────────────────┤
│       │ Breadcrumb: Dashboard > Overview                         │
│       ├─────────────────────────────────────────────────────────┤
│ Side  │                                                          │
│ bar   │                                                          │
│ 240px │              Module Content Area                         │
│       │                                                          │
│ (col- │              (Rendered by ModuleRouter)                  │
│ laps- │                                                          │
│ ible  │                                                          │
│ 60px) │                                                          │
│       │                                                          │
├───────┴─────────────────────────────────────────────────────────┤
│ Footer (optional)                                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. 設計系統 (Design Tokens)

| Token | Value |
|-------|-------|
| Background | `#f5f8fc` |
| Card | `#ffffff` |
| Primary (Teal) | `#0D9488` |
| Text Dark | `#0d1a2d` |
| On Track | `#0D9488` |
| At Risk / OT | `#F59E0B` |
| Delayed | `#F43F5E` |
| Completed | `#64748B` |
| Font | Space Grotesk (400, 500, 700, 800) |
| Border Radius | 4px |
| Box Shadow | `0 2px 6px rgba(0,20,40,0.05)` |
| Sidebar Width | 240px (collapsed: 60px) |
| Animation | 200ms ease |

---

## 8. 部署架構 (Deployment)

```
Developer → Git Push → Vite Build → Static Hosting (Vercel / Netlify)
                                          │
                                          ▼
                                    Supabase Cloud
                                    ├── Database (PostgreSQL)
                                    ├── Auth Service
                                    ├── Storage CDN
                                    └── Edge Functions (Deno)
```

---

## 9. 環境變數 (Environment Variables)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project API URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable anon key |
| `SUPABASE_SERVICE_KEY` | Server-side service role key (Edge Functions only) |
| `OPENAI_API_KEY` | For AI keyword/title generation (Edge Functions only) |
| `RESEND_API_KEY` | Resend API key for transactional email (Edge Function `send-email` only) |
| `RESEND_FROM_EMAIL` | Optional default From address (e.g. `MPS <noreply@your-domain.com>`) |

---

## 10. 安全考量 (Security Considerations)

1. **RLS (Row Level Security)** — All tables enforce role-based access
2. **Company Isolation** — Users only see data from `accessible_companies`
3. **JWT Verification** — Edge functions verify auth headers
4. **Input Validation** — Zod schemas on all form submissions
5. **No secrets in client** — API keys stored as Edge Function env vars only
6. **Snapshot Pattern** — Quotation/Invoice save company data at time of creation
