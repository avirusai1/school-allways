# School All Ways — Product Manager Verification Pack

**Document type:** End-to-end delivery status for PM review  
**Date:** 10 August 2026  
**Scope:** Work delivered through **build/15 (Web Surfaces)** + local production-style build + Android APKs + demo school seed  
**Audience:** Product Manager (verification, not engineering deep-dive)  
**Status:** Ready for local verification · **Not yet live on Oracle / school.techallways.com**

---

## 1. Executive summary

School All Ways is a multi-tenant K–12 school management SaaS for Indian schools. Over the recent build arc we completed the MVP product spine and then the **web surfaces**, then prepared a **local “as if production” stack** so Android apps and web consoles can be tested before any Oracle subdomain or Cloudflare cutover.

| Area | Outcome for PM |
|---|---|
| Backend modules (fees, exams, books, transport, platform) | Previously delivered; API builds and runs locally |
| Design system + Flutter foundation + Family + Admin apps | Previously delivered; Android **release APKs** now built |
| Web (admin / family / control / marketing) | **Scaffolded, builds cleanly**, wired to shared UI + types |
| Local infra (Postgres + Redis + migrate + RLS + seed) | **Working on this machine** |
| Demo school data | **Seeded and login-verified** against the API |
| Live deployment (`school.techallways.com`) | **Not started** — intentionally deferred until PM/local sign-off |

**Bottom line for the PM:** You can verify the product locally today (API + web + Android APKs + demo logins). Going live on Oracle/Cloudflare is a separate, gated step after this pack is signed off.

---

## 2. Product principles that still govern everything

These are non-negotiable product/security rules already enforced in architecture and code review:

1. **Tenant isolation is absolute** — school data is never selected by a spoofable header; JWT + RLS.
2. **Scope before query** — empty teacher/parent scope matches *nothing*, never everything.
3. **Money is integer paise** — ₹1,250.50 → `125050`.
4. **Academic sessions, not “current”** — year data is not overwritten in place.
5. **Under-18 = child under DPDP** — no behavioural/ad analytics SDKs.

Web frontends are **static on Cloudflare Pages** by design; only the API (and worker) run on the Oracle Always Free VM. That keeps the 2 vCPU / 12 GB box viable.

---

## 3. What existed before this verification pack (context)

Earlier build orders already delivered substantial product surface. This section is context so the PM sees “0 → 100” without treating web/local work as the whole product.

| Build | Theme | PM-visible outcome |
|---|---|---|
| 01–05 | Auth, core SIS, attendance, communications, onboarding | API spine + onboarding wizard contracts |
| 06 | Fees | Collect fees, invoices, daybook; money in paise |
| 07 | Exams | Marks / publish path for results |
| 08 | Books + sync | Offline-first sync architecture for books |
| 09 | Transport + safety | Bus / gate / pickup APIs |
| 10 | Platform console (API) | Fleet metrics from **rollups only** — cannot query student tables |
| 11 | Design system | Shared Flutter + React tokens/components |
| 12 | Flutter foundation | Drift offline DB, outbox, 401 refresh, nav manifest |
| 13 | Family app | Parent home, fees, leave, results, books, bus link, privacy |
| 14 | Admin app | Take attendance (offline outbox), collect fee, daybook, teacher/principal homes |

Known **deferred** items from mobile (still true): full Hindi ARB coverage, OSM live bus map on web, some admin screens (timetable UI, approvals swipe, real QR camera), Play Store signing keystore.

---

## 4. Build/15 — Web Surfaces (delivered)

**Spec:** `build/15-web.md`  
**Infra rule:** four static sites; nothing web-related runs on Oracle except via the API.

### 4.1 Shared foundation

| Package | Purpose |
|---|---|
| `packages/ui` (`@saw/ui`) | React design system (Button, DataTable, MoneyText, etc.), CSS tokens, hooks |
| `packages/shared-types` (`@saw/shared-types`) | Zod schemas for auth session + student list (API ↔ web contract) |

### 4.2 Four web apps

| App | Package | Local port | Intended production host | What you can verify now |
|---|---|---|---|---|
| Admin console | `@saw/web-admin` | 5173 | `admin.school.techallways.com` | Login, shell from `navManifest`, dashboard, **Students** table (virtualised) |
| Family portal | `@saw/web-family` | 5174 | `app.school.techallways.com` | OTP login, home / fees / results / leave / books / bus / privacy |
| Platform control | `@saw/web-control` | 5175 | IP-restricted Pages project | Fleet, schools grid, flags (aggregate APIs only) |
| Marketing | `@saw/web-marketing` | 3000 | `school.techallways.com` | Static pages: `/`, `/pricing`, `/apaar`, `/signup`, `/security` |

**Stack (SPAs):** React 19 + Vite + TanStack Query + React Router + `@saw/ui`  
**Stack (marketing):** Next.js 15 App Router, `output: 'export'` (static), Cloudflare Pages–ready  
**Deploy configs:** `wrangler.toml` + SPA `_redirects` on each app

### 4.3 Marketing product constraints (anti-brief)

- Grey/25 surface + **amber CTA** (no purple / gradient-mesh “AI look”)
- Brand name is a hero-level signal
- Transparent pricing page (differentiator vs quote-only ERPs)
- APAAR free-tool landing (GTM wedge)
- Security page states: platform console cannot open student records

### 4.4 Web acceptance vs remaining gaps

| Acceptance item (from build/15) | Status |
|---|---|
| Four apps build as static artifacts | Done |
| Cloudflare Pages configs present | Done (not deployed yet) |
| Admin DataTable virtualises large lists | Done (component + students page) |
| Family portal usable without installing app | Core routes done; not every mobile feature mirrored |
| Visually aligned with design system | Shared `@saw/ui` tokens/components |
| Full Hindi UI on every surface | **Not done** |
| Marketing Lighthouse ≥ 95 mobile | **Not measured yet** |
| All 38 admin routes fully implemented | Nav + placeholders; bulk tools TBD |

---

## 5. Local production-style environment (delivered)

Goal: exercise the product **as operators will**, without creating DNS or Oracle subdomains yet.

### 5.1 What was set up

| Piece | Detail |
|---|---|
| Local Docker stack | `infra/docker-compose.local.yml` — Postgres 16 + Redis only (no Oracle `/mnt/blockvol` paths) |
| One-command bootstrap | `pnpm local:setup` → `scripts/local-up.sh` |
| Env | Root `.env` created from template (secrets local-only; **never commit**) |
| Migrations | Drizzle migrations applied |
| RLS / sync SQL | `001`, `002`, plus new `003_auth_acting_user.sql` |
| Catalogue seed | Permissions, roles, plans, consent purposes |
| Demo seed | `pnpm db:seed:demo` |

### 5.2 Commands the PM / QA should know

```bash
# First time / reset DB volumes and re-seed
pnpm local:reset          # or: pnpm local:setup after Docker is running

# Fresh un-onboarded tenant, for testing the setup wizard (see §7.2)
pnpm db:seed:onboarding

# API (port 3000)
pnpm --filter @saw/api start
# Health check
curl http://127.0.0.1:3000/health

# Web consoles
pnpm --filter @saw/web-admin dev       # :5173
pnpm --filter @saw/web-family dev      # :5174
pnpm --filter @saw/web-control dev     # :5175
pnpm --filter @saw/web-marketing dev   # :3000

# Android APKs
pnpm build:android                     # emulator → API at 10.0.2.2:3000
pnpm build:android:device              # physical phone → LAN IP:3000
```

### 5.3 Fixes made so local auth actually works

During verification we found (and fixed) two production-relevant gaps:

1. **Missing GRANTs** for pre-tenant tables (`tenants`, `sessions`, `otp_codes`, `device_tokens`) on role `saw_app` — added to `db/sql/002_rls.sql`.
2. **Login could not list school memberships under RLS** before a tenant is selected — added `db/sql/003_auth_acting_user.sql` + API `runAsActingUser()` so only the authenticated user’s memberships/tenants/branches are visible.

These are security-preserving fixes (still no cross-tenant leak); they unblocked demo login for staff and parents.

---

## 6. Android app builds (delivered)

Flutter Android projects were incomplete (missing Gradle wrapper / modern embedding). They were regenerated and configured for local testing.

| App | Application ID | APK output |
|---|---|---|
| Family | `com.schoolallways.family` | `dist/android/family/app-*-release.apk` |
| Admin | `com.schoolallways.admin` | `dist/android/admin/app-*-release.apk` |

- Split per ABI (`armeabi-v7a`, `arm64-v8a`, `x86_64`) — sizes ~20–25 MB (family budget-conscious)
- Cleartext HTTP allowed for **local** API testing
- Signed with **debug keystore** (fine for sideload/QA; **not** Play Store)

### Install (emulator example)

```bash
adb install -r dist/android/family/app-arm64-v8a-release.apk
adb install -r dist/android/admin/app-arm64-v8a-release.apk
```

API must be running on the host at port **3000**. Emulator reaches it at `http://10.0.2.2:3000/v1`.

---

## 7. Demo school data (delivered & verified)

**Command:** `pnpm db:seed:demo`  
**School:** Sunrise Public School (`sunrise-demo`)  
**Session:** 2025-26 (current)  
**Classes:** V-A, VI-A  
**Students:** Aarav Sharma (V-A), Ananya Sharma (VI-A)

### 7.1 Credentials for PM / QA

| Role | How to sign in | Credential |
|---|---|---|
| Principal | Email + password (admin web/app) | `principal@sunrise.demo` / `Demo@12345` |
| Class teacher (V-A) | Email + password | `teacher@sunrise.demo` / `Demo@12345` |
| School admin | Email + password | `admin@sunrise.demo` / `Demo@12345` |
| Parent | Phone + OTP (family web/app) | `919876543210` — OTP appears as `devOtp` in API response when `NODE_ENV=development` |

### 7.2 Testing the onboarding wizard

Sunrise is seeded **onboarding-complete**, so every sign-in above lands straight
in the app rather than in the setup wizard.

To exercise the wizard and its gate, seed the deliberately un-onboarded tenant:

```bash
pnpm db:seed:onboarding      # tenant: saw-onboarding-test
```

Sign in as `admin@onboarding.demo` / `Demo@12345` — `OnboardingGate` redirects to
`/onboarding`. The tenant has a branch and one school admin and nothing else: no
academic session, classes, subjects or students, so steps 1–4 all do real work.
Re-run the command any time for a clean wizard; it does not touch Sunrise.

### 7.3 Automated verification already performed

| Check | Result |
|---|---|
| `GET /health` → db + redis ok | Pass |
| Principal password login → session role `principal` | Pass |
| Principal `GET /students` returns Aarav + Ananya | Pass |
| Parent OTP login → `GET /family/children` returns both children | Pass |

---

## 8. Suggested PM verification script (30–45 minutes)

Use this checklist in order. Mark Pass / Fail / Blocked.

### A. Backend health
1. [ ] Docker Postgres + Redis healthy  
2. [ ] `curl http://127.0.0.1:3000/health` returns `"status":"ok"`  
3. [ ] Demo seed re-runnable: `pnpm db:seed:demo` succeeds  

### B. Admin web (`pnpm --filter @saw/web-admin dev`)
4. [ ] Sign in as `principal@sunrise.demo` / `Demo@12345`  
5. [ ] See school name **Sunrise Public School** in chrome  
6. [ ] Open **Students** — both children listed  
7. [ ] Sign in as `teacher@sunrise.demo` — scoped to class teacher experience (nav/permissions)  

### C. Family web (`pnpm --filter @saw/web-family dev`)
8. [ ] Request OTP for `919876543210` (note `devOtp` from network tab / API)  
9. [ ] Verify OTP — land on Home with children  
10. [ ] Open Fees / Results / Leave / Privacy pages (empty states OK)  

### D. Marketing (`pnpm --filter @saw/web-marketing dev`)
11. [ ] Home hero shows **School All Ways** + amber CTA (no purple mesh)  
12. [ ] `/pricing`, `/apaar`, `/security`, `/signup` render  

### E. Android (emulator or device)
13. [ ] Install family + admin `arm64-v8a` APKs  
14. [ ] Admin: password login as principal  
15. [ ] Family: OTP login as parent phone  
16. [ ] Confirm apps talk to local API (not a blank offline-only shell)  

### F. Platform control (optional)
17. [ ] Control SPA loads; fleet/schools screens call `/v1/platform/*` (may be empty until rollups run)  

---

## 9. Explicitly NOT done yet (go-live gate)

Do **not** treat the following as complete until a separate go-live checklist is closed:

| Item | Why it matters |
|---|---|
| Oracle VM provisioned + production `docker-compose.yml` | Real hosting |
| DNS: `school.techallways.com`, `api.`, `admin.`, `app.` | Public URLs |
| Cloudflare Pages deploy of four web apps | Web not on Oracle |
| Cloudflare Access / IP allowlist for control | Internal console safety |
| Production secrets (JWT, SMS DLT, Razorpay, FCM) | Real OTP/payments/push |
| Play / App Store signing + listings | Public mobile distribution |
| Pilot school real data import (not demo seed) | Production roster |
| Lighthouse ≥ 95 on marketing | build/15 acceptance |
| Full Hindi UI | build/15 acceptance |
| Remaining admin/family feature depth | Placeholders remain |

**Recommended go-live order after PM sign-off:**  
(1) Oracle API + DB + Caddy → (2) Cloudflare Pages for web → (3) DNS cutover → (4) store builds with release keystore → (5) first pilot school import.

---

## 10. Artifact index (where things live)

| Artifact | Path |
|---|---|
| Web admin | `apps/web-admin/` |
| Web family | `apps/web-family/` |
| Web control | `apps/web-control/` |
| Web marketing | `apps/web-marketing/` |
| Shared UI | `packages/ui/` |
| Shared Zod types | `packages/shared-types/` |
| Local Docker | `infra/docker-compose.local.yml` |
| Local bootstrap | `scripts/local-up.sh` |
| Android build script | `scripts/build-android-local.sh` |
| Demo seed | `db/seeds/demo.ts` |
| Auth RLS fix | `db/sql/003_auth_acting_user.sql` |
| Built APKs | `dist/android/{family,admin}/` |
| Product specs | `build/00` … `build/15`, `BUILD_SPEC.md` |

---

## 11. Risk & trust notes for PM

- **Demo password is for local QA only.** Rotate before any shared staging environment.  
- **APKs are debug-signed.** Fine for internal QA; not for Play Store.  
- **Platform control** must never gain queries on `students` / `marks` / `invoices` — CI grep + architecture already guard this; keep verifying in reviews.  
- **OTP in development returns `devOtp`** so QA can test without SMS spend; production uses MSG91 + DLT templates.

---

## 12. Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| Product Manager | | | ☐ Approved for go-live prep · ☐ Approved with conditions · ☐ Rework needed |
| Conditions / notes | | | |

**Engineering note after approval:** proceed to Oracle + Cloudflare cutover checklist; do not create public DNS until this section is signed.

---

*End of verification pack.*
