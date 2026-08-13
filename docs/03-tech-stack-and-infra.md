# School All Ways — Tech Stack & Infrastructure Decision

**Version:** 0.3
**Date:** 6 Aug 2026
**Domain:** `school.techallways.com`
**Repo:** `git@github.com:avirusai1/school-all-ways.git`
**Hosting constraint:** Oracle Cloud, stay inside Always Free

---

## 1. Decisions locked from your feedback

| # | Decision | Impact on build |
|---|---|---|
| 1 | **Max custom roles in V1** | Permission model must be fully data-driven: `permissions` table, `roles` table, `role_permissions`, `user_role_assignments` (branch + session scoped). No hardcoded role enums anywhere. Ships with 26 seeded system roles + a role builder UI. |
| 2 | **Subject Teacher can see fee status** | Adds `fee.status.read` to the teacher role bundle, scoped to their assigned sections. Read-only, status + amount due only — never payment history or bank details. |
| 3 | **F15 safe reporting = school-admin toggle** | Becomes a per-tenant feature flag (`safe_reporting.enabled`) with a sub-setting for routing (counsellor / principal / both). Default OFF. |
| 4 | **Secondary guardian payment = ON by default, toggleable** | `guardian_permissions` table, per-guardian per-child boolean set. Primary parent controls the toggle. |
| 5 | **Principal sees case indicator only for B25** | Counselling notes get `sensitivity: restricted`. Principal's query returns `{case_id, status, opened_at}` — never `notes`. Enforced at the DB view level, not the API. |
| 6 | **Full multi-tenant SaaS, hard isolation** | See §5. PostgreSQL Row Level Security + tenant-scoped connections + per-tenant storage prefixes + audit on every cross-tenant attempt. This is the highest-stakes engineering requirement in the project. |
| 7 | **NEW — Digital Book Library (class PDF books)** | New module **B31**. See §2 and the storage warning in §4. |
| 8 | **Test marks, tests, exam timetable** | Already covered: B10 (exams & assessments), B11 (report cards), F7 (family view). Adding **exam timetable publishing** explicitly to B10 scope — it was implied, now it's a named deliverable. |

### New module: B31 — Digital Book Library

| Field | Value |
|---|---|
| Users | Student (read), Parent (read), Teacher (read + upload), Librarian/Admin (manage) |
| Features | Class-wise & subject-wise PDF shelf, in-app reader, bookmark & last-page memory, offline download with expiry, search, "new book added" notification |
| Access control | Book is visible only to the classes it's mapped to, within the tenant |
| Priority | **P1** — you asked for it, and it's a strong retention hook for the student persona |
| ⚠️ Risk | **This is the single biggest cost driver in the whole system.** See §4. |

---

## 2. The recommended stack

### Mobile — both apps

| Layer | Choice | Why |
|---|---|---|
| Framework | **Flutter 3.x / Dart** | Your call, and correct — one codebase, both apps, iOS later for free |
| State | **Riverpod** | Compile-safe, testable, handles async/offline states cleanly |
| Routing | **go_router** | Needed for role-driven dynamic navigation + deep links from SMS/WhatsApp |
| Local DB | **Drift (SQLite)** | Offline attendance & marks entry. Type-safe, migration support. |
| Sync | Custom **outbox queue** on Drift | Queue mutations locally → replay on reconnect → server-side idempotency keys |
| Network | **Dio** + retry/interceptors | |
| Push | **Firebase Cloud Messaging** | Free, and the only realistic option on Android in India |
| PDF reader | **pdfrx** or `syncfusion_flutter_pdfviewer` | For B31 book library |
| Maps | **flutter_map + OSM** (not Google Maps) | Google Maps SDK billing is a trap at scale; OSM is free. Revisit if routing quality suffers. |
| Build flavours | `family`, `admin`, plus a `lite` variant for guard/driver later | |

Two apps in **one monorepo** with shared packages: `core_auth`, `core_network`, `core_sync`, `design_system`, `models`.

### Web

| Surface | Choice | Hosted on |
|---|---|---|
| Marketing + self-serve signup | **Next.js 15 (SSG/ISR)**, TypeScript, Tailwind | **Cloudflare Pages (free)** |
| Admin Console | **React 19 + Vite SPA**, TypeScript, Tailwind + shadcn/ui, TanStack Query + Table | **Cloudflare Pages (free)** |
| Family Web Portal | Same SPA stack, separate build | **Cloudflare Pages (free)** |
| Internal Control panel | Same SPA stack | Cloudflare Pages (free), IP-restricted |

> **Key cost decision:** no web frontend runs on Oracle. All four web surfaces are static builds on Cloudflare Pages — unlimited bandwidth, free, global CDN. Oracle serves **only the API**. This roughly triples the headroom of your free VM.

### Backend

| Layer | Choice | Why |
|---|---|---|
| Language/Framework | **NestJS + TypeScript** | One language across API + all web surfaces. Modular architecture maps 1:1 onto your 53 modules. Strong DI, guards, interceptors — exactly what a heavy RBAC system needs. |
| Architecture | **Modular monolith**, Docker Compose | Not microservices. Not Kubernetes — K8s control plane alone would eat your 2 free cores. |
| ORM | **Drizzle ORM** | Lightweight, raw-SQL-transparent, and lets us `SET LOCAL app.tenant_id` per transaction — which is how RLS is enforced. Prisma fights you on RLS and uses ~3x the memory. |
| Database | **PostgreSQL 16, self-hosted on the VM** | See §3 — deliberately *not* Oracle Autonomous DB |
| Cache/Queue | **Redis 7** (self-hosted) + **BullMQ** | Sessions, rate limits, and background jobs: bulk PDF render, imports, notification fan-out |
| Auth | **Custom JWT** (access + refresh) with **phone OTP** | India reality is phone-first. No Auth0/Firebase Auth — cost and data-residency both fail. |
| File storage | **Cloudflare R2** (see §4) | |
| Reverse proxy | **Caddy** | Auto-TLS, simpler than nginx |
| Realtime | **WebSocket (socket.io)** for bus tracking only | Everything else is push + pull |

### Third-party services

| Need | Service | Cost |
|---|---|---|
| Push | Firebase Cloud Messaging | Free |
| SMS (DLT-compliant) | **MSG91** or Gupshup | ~₹0.12–0.20 / SMS |
| WhatsApp | Gupshup / AiSensy (BSP) | Per-conversation, P1 |
| Payments | **Razorpay** or **Cashfree** (Route/split settlement) | MDR on transactions |
| Email | Oracle Email Delivery (free tier) → Brevo/Resend | Free tier |
| Error tracking | **Sentry** free tier | Free (5k events/mo) |
| Uptime | **Uptime Kuma** self-hosted on the micro VM | Free |
| CI/CD | **GitHub Actions** → SSH deploy | Free tier |
| CDN + DNS + WAF | **Cloudflare** free | Free |

---

## 3. Why NOT Oracle Autonomous Database

The Always Free tier gives you 2 Autonomous Databases at 20 GB each, and it looks like the obvious choice. It is a trap for this project:

- It's **Oracle Database**, not PostgreSQL. Different SQL dialect, different types, different migration tooling.
- **No PostgreSQL Row Level Security.** Oracle's equivalent (VPD) exists but is Enterprise-flavoured and awkward to drive from Drizzle/Prisma. Your #1 requirement is hard tenant isolation — you should not be fighting your database for it.
- **20 GB cap** across all 10 pilot schools, growing.
- Vendor lock-in on the one layer you least want locked.

**Instead:** run **PostgreSQL 16 on the ARM VM**, with its data directory on the **200 GB Always Free block volume**. Free, standard, portable, and RLS works exactly as designed.

---

## 4. ⚠️ Two Always Free realities that will bite you

I verified the current numbers rather than working from memory, and two things changed recently.

### 4.1 Oracle halved the free ARM tier on 15 June 2026

| | Before | **Now** |
|---|---|---|
| Ampere A1 | 4 OCPU / 24 GB RAM | **2 OCPU / 12 GB RAM** |
| Monthly quota | 3,000 OCPU-hrs / 18,000 GB-hrs | **1,500 / 9,000** |

They did it with no announcement — docs were just updated and people found out when instances stopped. Block storage (200 GB), the 2 AMD micro VMs, the 10 Mbps load balancer and 10 TB/month egress are unchanged.

**Verdict:** 2 cores / 12 GB is still genuinely enough for 10 pilot schools *if* the web frontends live on Cloudflare (which is why I moved them there). It is **not** enough at 50+ schools with live bus tracking. Plan to move to a paid ~₹2,000/month VM around school #20.

### 4.2 Idle instances get reclaimed — and a pilot app is idle

Oracle reclaims Always Free compute if **95th-percentile CPU is under 20% over 7 days**. A pilot serving 10 schools will sit near-idle at night and on Sundays. You could genuinely lose the box.

**Fix:** upgrade the tenancy to **Pay As You Go** while staying inside Always Free resource limits. Bill stays ₹0, but the idle-reclaim policy no longer applies and "out of capacity" provisioning failures largely go away. This is the single most important infra step — do it before building anything.

### 4.3 Object storage kills the PDF book library

Always Free object storage is **10 GB standard** (plus 10 GB infrequent + 10 GB archive).

Your B31 book library, realistically: 10 schools × 12 classes × ~8 books × ~30 MB = **~29 GB**, before a single photo, report card, or student document. You blow the limit on day one, and Oracle object storage egress would then be metered.

**Three options, in order of my preference:**

| Option | Storage | Egress | Verdict |
|---|---|---|---|
| **A. Cloudflare R2** | 10 GB free, then ~$0.015/GB/mo | **$0 egress, always** | ✅ **Recommended.** Zero egress is decisive for PDFs and photos. 100 GB costs ~₹110/month. |
| B. Serve from the 200 GB block volume via Caddy | Free | Counts against 10 TB (fine) | Works, but files sit on the same disk as Postgres, no CDN, and backup gets painful |
| C. Don't host books — link to NCERT/publisher PDFs | Free | Free | Zero cost, but you don't control availability and it's a worse product |

**My recommendation: R2 for all user files, plus option C as a first-class feature** — let schools link NCERT/state-board PDFs (which are legally free to distribute) instead of uploading, and reserve uploads for school-specific material. That keeps most schools inside the free 10 GB.

> ⚠️ **Also flag the copyright question:** uploading commercially published textbook PDFs is the school's infringement, but you'd be hosting it. Ship a terms-of-use acceptance on upload and a takedown process. Not optional.

### 4.4 Region choice

DPDP and school procurement both push toward **India data residency** — so `ap-mumbai-1` or `ap-hyderabad-1`. Ampere A1 capacity in Indian regions is frequently exhausted. Provision the VM **first**, before writing code, and be ready to retry over a few days. (PAYG upgrade materially improves your odds.)

---

## 5. Tenant isolation — defence in depth

You said school data must never leak across schools. Four independent layers, so no single bug is fatal:

1. **DB layer — PostgreSQL Row Level Security.** Every tenant-owned table carries `tenant_id NOT NULL` with an RLS policy `USING (tenant_id = current_setting('app.tenant_id')::uuid)`. The app connects as a **non-superuser role that cannot bypass RLS**. Even a raw `SELECT * FROM students` with a SQL-injection payload returns only the caller's tenant.
2. **Connection layer.** Every request opens a transaction and issues `SET LOCAL app.tenant_id = '<uuid>'` from the verified JWT claim, never from a client-supplied header or body field.
3. **Application layer.** A NestJS `TenantGuard` + Drizzle query wrapper that refuses any query on a tenant-scoped table without an active tenant context.
4. **Storage layer.** R2 keys are prefixed `t/{tenant_id}/...` and all downloads go through short-lived signed URLs generated only after a permission check. No public buckets, ever.

Plus: **audit log on every PII read**, a nightly automated cross-tenant leak test in CI, and support impersonation that is time-boxed and logged.

---

## 6. Proposed repository structure

Monorepo, since types are shared between API and web:

```
school-all-ways/
├─ apps/
│  ├─ api/                 NestJS — the only thing on Oracle
│  ├─ web-marketing/       Next.js SSG  → school.techallways.com
│  ├─ web-admin/           React SPA    → admin.school.techallways.com
│  ├─ web-family/          React SPA    → app.school.techallways.com
│  ├─ web-control/         React SPA    → control.school.techallways.com (internal)
│  ├─ mobile-family/       Flutter — "School All Ways"
│  └─ mobile-admin/        Flutter — "School All Ways Admin"
├─ packages/
│  ├─ shared-types/        TS types + Zod schemas shared API↔web
│  ├─ ui/                  shared React components
│  └─ flutter/             core_auth, core_network, core_sync, design_system, models
├─ db/
│  ├─ schema/              Drizzle schema, module by module
│  ├─ migrations/
│  └─ seeds/               26 system roles, permissions, board templates
├─ infra/
│  ├─ docker-compose.yml
│  ├─ caddy/
│  └─ scripts/             backup, restore, deploy
├─ docs/                   ← these documents
└─ .github/workflows/
```

Tooling: **pnpm workspaces + Turborepo** for the TS side; Flutter apps managed by **melos**.

---

## 7. Cost projection

| Stage | Schools | Monthly cost |
|---|---|---|
| Pilot | 10 (free) | **₹0–300** (R2 overflow + SMS only) |
| Early | 25 | ~₹2,500 (paid VM + R2 + SMS) |
| Growth | 100 | ~₹15,000–25,000 (2 VMs, managed Postgres, WhatsApp) |

SMS is your sneaky variable cost — 10 schools × 800 students × ~8 SMS/month ≈ 64,000 SMS ≈ **₹9,600/month** if you're not careful. **Mitigation: push notification first, SMS only as fallback for unread critical messages.** Build the fallback ladder into A6 from day one, not later.

---

## 8. What I need from you before creating folders

See the questions attached to this message. Summary of the real forks:

1. **Backend language** — NestJS/TypeScript (recommended, one language everywhere) vs Go (half the RAM, better fit for a 2-core box, but slower to build and no shared types)
2. **File storage** — Cloudflare R2 (recommended) vs Oracle Object Storage vs VM block volume
3. **PAYG upgrade** — do it now to dodge idle-reclaim, or accept the risk on the pilot
4. **Books** — host uploads, link-only, or both

---

## Sources

- [InfoQ — Oracle quietly halves free tier Ampere A1 compute limits](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)
- [TerminalBytes — Oracle Cloud free tier 2026: 4 OCPU/24GB cut to 2 OCPU/12GB](https://terminalbytes.com/oracle-cloud-free-tier-changes-2026/)
- [Linuxiac — Oracle quietly cuts free tier Ampere A1 resources in half](https://linuxiac.com/oracle-quietly-cuts-free-tier-ampere-a1-resources-in-half/)
- [Oracle Docs — Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Oracle — Cloud Free Tier FAQ](https://www.oracle.com/cloud/free/faq/)
- [Oracle Docs — Always Free Autonomous Database](https://docs.oracle.com/en/cloud/paas/autonomous-database/adbsa/autonomous-always-free.html)
- [Fullmetalbrackets — Breaking down the OCI free tier](https://fullmetalbrackets.com/blog/oci-free-tier-breakdown)
</content>
