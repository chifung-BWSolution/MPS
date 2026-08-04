# Multi-project env / secrets reset guide

Projects:

| App | Stack | Supabase project | URL |
|-----|-------|------------------|-----|
| **MPS** | Vite | MPS - Marketing Project System | `https://kwcevjcmdjadhrygjyfp.supabase.co` |
| **PMS** | Next.js (master SSO) | PMS v3 [Tempo Next.JS] | `https://kqwktnplkqucsbasyfjl.supabase.co` |
| **Furniture 1000** | Vite | Furniture 1000 | `https://riaubhtruisbwdlwjzur.supabase.co` |

PMS is the master login and shares SSO with Furniture 1000 (`PMS_SSO_SHARED_SECRET`).

---

## What you deleted (and what it was)

These were almost certainly **Furniture 1000** Vite credentials (verified earlier in Cloud Agents):

```bash
# OLD (deleted) — these pointed at Furniture, NOT MPS
VITE_SUPABASE_URL=https://riaubhtruisbwdlwjzur.supabase.co
VITE_SUPABASE_ANON_KEY=<Furniture anon key from Supabase → Furniture 1000 → Settings → API>
```

Do **not** recreate shared `VITE_SUPABASE_*` under “All repositories”. That is what caused MPS agents to hit Furniture.

---

## Naming rules (after reset)

1. **Never** put `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` on **All repositories**.
2. Use **prefixed** secrets for shared Cursor “My Secrets”.
3. Scope Vite/Next public keys to **one repo** when Cursor allows “Apply to”.
4. Get keys from each Supabase project → **Settings → API**:
   - `anon` `public` → browser / Vite / Next public
   - `service_role` → server / Edge / agent only (Runtime Secret; never `VITE_` / `NEXT_PUBLIC_`)

---

## Step 1 — Remove everything in Cursor “My Secrets”

Delete all current secrets, then add **only** the list in Step 2.

---

## Step 2 — Cursor Cloud Agents secrets (paste / recreate)

### A. Global (Apply to: **All repositories**) — safe shared names only

```bash
# Supabase personal access token (Management API) — optional but useful for agents
SUPABASE_ACCESS_TOKEN=PASTE_YOUR_SUPABASE_PERSONAL_ACCESS_TOKEN

# --- MPS (prefixed) ---
MPS_SUPABASE_URL=https://kwcevjcmdjadhrygjyfp.supabase.co
MPS_SUPABASE_ANON_KEY=PASTE_MPS_ANON_PUBLIC_KEY
MPS_SUPABASE_SERVICE_ROLE_KEY=PASTE_MPS_SERVICE_ROLE_KEY

# Aliases used by current MPS repo sync script (keep until script is updated)
MPS_URL=https://kwcevjcmdjadhrygjyfp.supabase.co
MPS_ANON=PASTE_MPS_ANON_PUBLIC_KEY
MPS_SERVICE=PASTE_MPS_SERVICE_ROLE_KEY

# --- Furniture 1000 (prefixed) ---
FURNITURE_SUPABASE_URL=https://riaubhtruisbwdlwjzur.supabase.co
FURNITURE_SUPABASE_ANON_KEY=PASTE_FURNITURE_ANON_PUBLIC_KEY
FURNITURE_SUPABASE_SERVICE_ROLE_KEY=PASTE_FURNITURE_SERVICE_ROLE_KEY

# Legacy BWF aliases (optional; only if some code still reads BWF_*)
BWF_SUPABASE_URL=https://riaubhtruisbwdlwjzur.supabase.co
BWF_SUPABASE_SERVICE_KEY=PASTE_FURNITURE_SERVICE_ROLE_KEY

# --- PMS / master SSO (prefixed) ---
PMS_SUPABASE_URL=https://kqwktnplkqucsbasyfjl.supabase.co
PMS_SUPABASE_ANON_KEY=PASTE_PMS_ANON_PUBLIC_KEY
PMS_SUPABASE_SERVICE_ROLE_KEY=PASTE_PMS_SERVICE_ROLE_KEY
PMS_SSO_SHARED_SECRET=PASTE_SAME_SSO_SECRET_USED_BY_PMS_AND_FURNITURE

# Legacy MASTER aliases (optional; only if PMS/agent code still reads MASTER_*)
MASTER_SUPABASE_URL=https://kqwktnplkqucsbasyfjl.supabase.co
MASTER_SERVICE_ROLE_KEY=PASTE_PMS_SERVICE_ROLE_KEY
VITE_MASTER_SUPABASE_ANON_KEY=PASTE_PMS_ANON_PUBLIC_KEY
```

### B. Repo-scoped only (Apply to: **that one repository**)

#### MPS repo `chifung-bwsolution/mps`

```bash
VITE_SUPABASE_URL=https://kwcevjcmdjadhrygjyfp.supabase.co
VITE_SUPABASE_ANON_KEY=PASTE_MPS_ANON_PUBLIC_KEY
```

#### Furniture 1000 repo (whatever its GitHub name is)

```bash
VITE_SUPABASE_URL=https://riaubhtruisbwdlwjzur.supabase.co
VITE_SUPABASE_ANON_KEY=PASTE_FURNITURE_ANON_PUBLIC_KEY
```

#### PMS repo

```bash
NEXT_PUBLIC_SUPABASE_URL=https://kqwktnplkqucsbasyfjl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=PASTE_PMS_ANON_PUBLIC_KEY
# If PMS Edge/server needs it in that environment:
SUPABASE_SERVICE_ROLE_KEY=PASTE_PMS_SERVICE_ROLE_KEY
```

> If Cursor cannot scope by repo yet for a secret, **do not** recreate bare `VITE_SUPABASE_*` globally. Use only prefixed names + per-repo sync (MPS already has `scripts/sync-mps-env.mjs`).

---

## Step 3 — Local / Vercel templates (per project)

### MPS — `.env.local` (Vite) + Vercel

```bash
# MPS
VITE_SUPABASE_URL=https://kwcevjcmdjadhrygjyfp.supabase.co
VITE_SUPABASE_ANON_KEY=PASTE_MPS_ANON_PUBLIC_KEY

# Optional for local scripts / agents
MPS_URL=https://kwcevjcmdjadhrygjyfp.supabase.co
MPS_ANON=PASTE_MPS_ANON_PUBLIC_KEY
MPS_SERVICE=PASTE_MPS_SERVICE_ROLE_KEY
```

### Furniture 1000 — `.env.local` (Vite) + Vercel

```bash
# Furniture 1000
VITE_SUPABASE_URL=https://riaubhtruisbwdlwjzur.supabase.co
VITE_SUPABASE_ANON_KEY=PASTE_FURNITURE_ANON_PUBLIC_KEY

# Prefixed (for agents / future sync)
FURNITURE_SUPABASE_URL=https://riaubhtruisbwdlwjzur.supabase.co
FURNITURE_SUPABASE_ANON_KEY=PASTE_FURNITURE_ANON_PUBLIC_KEY
FURNITURE_SUPABASE_SERVICE_ROLE_KEY=PASTE_FURNITURE_SERVICE_ROLE_KEY

# SSO shared with PMS (server-only; do not expose as VITE_)
PMS_SSO_SHARED_SECRET=PASTE_SAME_SSO_SECRET_USED_BY_PMS_AND_FURNITURE
```

### PMS — `.env.local` (Next.js) + Vercel

```bash
# PMS (master login)
NEXT_PUBLIC_SUPABASE_URL=https://kqwktnplkqucsbasyfjl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=PASTE_PMS_ANON_PUBLIC_KEY
SUPABASE_SERVICE_ROLE_KEY=PASTE_PMS_SERVICE_ROLE_KEY

# Prefixed
PMS_SUPABASE_URL=https://kqwktnplkqucsbasyfjl.supabase.co
PMS_SUPABASE_ANON_KEY=PASTE_PMS_ANON_PUBLIC_KEY
PMS_SUPABASE_SERVICE_ROLE_KEY=PASTE_PMS_SERVICE_ROLE_KEY
PMS_SSO_SHARED_SECRET=PASTE_SAME_SSO_SECRET_USED_BY_PMS_AND_FURNITURE

# Legacy aliases if code still uses MASTER_*
MASTER_SUPABASE_URL=https://kqwktnplkqucsbasyfjl.supabase.co
MASTER_SERVICE_ROLE_KEY=PASTE_PMS_SERVICE_ROLE_KEY
```

---

## Step 4 — Where to copy each key

| Placeholder | Supabase dashboard |
|-------------|--------------------|
| `PASTE_MPS_*` | Project **MPS - Marketing Project System** → Settings → API |
| `PASTE_FURNITURE_*` | Project **Furniture 1000** → Settings → API |
| `PASTE_PMS_*` | Project **PMS v3** → Settings → API |
| `PMS_SSO_SHARED_SECRET` | Reuse the **same** value already configured in PMS + Furniture SSO (Vercel/env) — do not invent a new one unless you rotate both sides together |
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens |

---

## Step 5 — After reset checklist

- [ ] No global `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- [ ] MPS agent: `MPS_URL`/`MPS_ANON` (or `MPS_SUPABASE_*`) work; marketing tables resolve
- [ ] Furniture Vercel still has Furniture `VITE_SUPABASE_*`
- [ ] PMS Vercel still has PMS `NEXT_PUBLIC_SUPABASE_*` + SSO secret
- [ ] Furniture + PMS SSO still login against each other
- [ ] Start a **new** Cloud Agent run after changing secrets (old runs keep old env)

---

## Prompt for Furniture 1000 project AI

Copy-paste this into the Furniture 1000 Cloud Agent / chat:

```text
We are resetting shared Cursor Cloud Agent secrets so MPS / PMS / Furniture no longer collide on VITE_SUPABASE_*.

Furniture 1000 Supabase project:
- URL: https://riaubhtruisbwdlwjzur.supabase.co
- Prefixed secrets (available in Cloud Agents):
  - FURNITURE_SUPABASE_URL
  - FURNITURE_SUPABASE_ANON_KEY
  - FURNITURE_SUPABASE_SERVICE_ROLE_KEY
  - Optional legacy: BWF_SUPABASE_URL, BWF_SUPABASE_SERVICE_KEY
  - PMS_SSO_SHARED_SECRET (SSO with PMS — server only, never VITE_)

Please:
1. Audit this repo for env usage (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, BWF_*, SUPABASE_*, SSO).
2. Keep production/Vercel using VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY pointing at Furniture (riaubhtruisbwdlwjzur) — set in Vercel and/or Furniture-repo-scoped Cursor secrets only (NOT global).
3. Add a small sync (like MPS): if FURNITURE_SUPABASE_URL + FURNITURE_SUPABASE_ANON_KEY are set, write/override .env.local VITE_SUPABASE_* for local/dev and Cloud Agents so shared global VITE_* is not required.
4. Update .env.example to document FURNITURE_* + VITE_* + PMS_SSO_SHARED_SECRET.
5. Do NOT point anything at MPS (kwcevjcmdjadhrygjyfp) or PMS DB URL except SSO-related server config that already talks to PMS.
6. Summarize files changed and any remaining hardcoded env names.

Do not commit real keys. Do not expose service_role as VITE_*.
```

---

## Prompt for PMS project AI (optional)

```text
We are resetting shared Cursor secrets. PMS is the master login (Next.js) at:
https://kqwktnplkqucsbasyfjl.supabase.co

Prefixed secrets:
- PMS_SUPABASE_URL / PMS_SUPABASE_ANON_KEY / PMS_SUPABASE_SERVICE_ROLE_KEY
- PMS_SSO_SHARED_SECRET (shared with Furniture 1000)
- Legacy aliases may still exist: MASTER_SUPABASE_URL, MASTER_SERVICE_ROLE_KEY, VITE_MASTER_SUPABASE_ANON_KEY

Please audit env usage, keep NEXT_PUBLIC_SUPABASE_* for the PMS app (PMS project only), document prefixed names in .env.example, and ensure SSO secret stays server-only. Do not use Furniture or MPS Supabase URLs for the main PMS database client.
```
