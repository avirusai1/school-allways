# School All Ways

Multi-tenant school management SaaS for Indian K-12 schools. Schools sign up on the landing page and onboard themselves — no sales call, no implementation team.

- **School All Ways** — parent + student app (Flutter) and web portal
- **School All Ways Admin** — school staff app (Flutter) and web console
- `school.techallways.com`

---

## Status

**Phase: foundation.** Database schema and infrastructure are in place. API and apps not yet started.

| Piece | State |
|---|---|
| Research, personas, module catalogue (53 modules) | ✅ `docs/01`, `docs/02` |
| Tech stack + infra decisions | ✅ `docs/03` |
| Sync architecture | ✅ `docs/04` |
| Database schema — 104 tables, 243 indexes, 47 enums | ✅ `db/schema/` |
| Row Level Security + tenant isolation | ✅ `db/sql/002_rls.sql` |
| Docker stack tuned for Oracle Always Free | ✅ `infra/` |
| API (NestJS) | ⬜ next |
| Flutter apps | ⬜ |
| Web consoles | ⬜ |

---

## Stack

| Layer | Choice |
|---|---|
| Mobile | Flutter 3.x · Riverpod · go_router · Drift (offline) · FCM |
| Web | Next.js (marketing, SSG) + React/Vite SPAs → **Cloudflare Pages** |
| API | NestJS + TypeScript, modular monolith |
| ORM | Drizzle |
| Database | PostgreSQL 16, self-hosted, **Row Level Security** for tenant isolation |
| Cache / queue | Redis + BullMQ |
| Files | Local block volume via Caddy (abstracted — swappable to S3/R2) |
| Proxy | Caddy (auto-TLS) behind Cloudflare |
| Host | Oracle Cloud, Ampere A1, Always Free (2 OCPU / 12 GB) |

---

## Repository layout

```
apps/
  api/              NestJS — the only service on Oracle
  web-marketing/    Next.js SSG      → school.techallways.com
  web-admin/        React SPA        → admin.school.techallways.com
  web-family/       React SPA        → app.school.techallways.com
  web-control/      React SPA        → internal, IP-restricted
  mobile-family/    Flutter — "School All Ways"
  mobile-admin/     Flutter — "School All Ways Admin"
packages/
  shared-types/     TS types + Zod schemas shared API ↔ web
  ui/               shared React components
  flutter/          core_auth, core_network, core_sync, design_system, models
db/
  schema/           Drizzle schema, one file per domain
  migrations/       generated SQL
  sql/              extensions, sync triggers, RLS policies
  seeds/            system roles, permissions, board templates
infra/              docker-compose, Caddy, backup scripts
docs/               design documents — read 01 → 04 in order
```

---

## Database

104 tables across 14 domain files. Read `db/schema/_common.ts` first — it documents the five conventions every table follows.

The load-bearing ones:

1. **Every tenant-owned table has `tenant_id`** and gets an RLS policy automatically via `app_apply_tenant_rls()`. A new table cannot be forgotten. There are 8 deliberate exceptions, all documented in `db/sql/002_rls.sql`.
2. **Money is integer paise.** ₹1,250.50 → `125050`. Never float.
3. **Sessions, not "current".** Every academic entity is bound to an `academic_session_id`. Year rollover creates new rows; nothing is mutated in place.
4. **`row_version` from one global sequence** drives delta sync. See `docs/04`.
5. **Soft delete by default.** Hard deletes only through the audited DPDP erasure pipeline.

### Commands

```bash
pnpm db:generate     # generate migration from schema changes
pnpm db:migrate      # apply migrations
pnpm db:seed         # system roles, permissions, board templates
pnpm db:studio       # browse
```

After **every** migration, re-run the RLS applier so new tables are protected:

```bash
psql "$DATABASE_URL" -c "SELECT app_apply_tenant_rls();"
psql "$DATABASE_URL" -c "SELECT app_attach_sync_triggers();"
```

The deploy script does this automatically. Do not skip it manually.

---

## Local development

```bash
cp .env.example .env        # fill in secrets
pnpm install
pnpm infra:up               # postgres + redis
pnpm db:migrate && pnpm db:seed
pnpm dev
```

---

## Tenant isolation — read before writing any query

One school's data must never reach another school. Four independent layers:

1. **PostgreSQL RLS.** The API connects as `saw_app`, which is `NOSUPERUSER` and `NOBYPASSRLS`. Even a successful SQL injection cannot escape the policy.
2. **Transaction-local tenant context.** Every request runs `SET LOCAL app.tenant_id` from the **verified JWT claim**. Never from a header, query param or body field. If you find code doing otherwise, that is a P0 bug.
3. **Application guard.** `TenantGuard` + a Drizzle wrapper that refuses queries on tenant-scoped tables without an active context.
4. **Storage prefixes.** Files live under `t/{tenant_id}/...`, served only via short-lived signed URLs after a permission check. No public buckets.

Plus: audit log on every PII read, and a cross-tenant leak test in CI.

---

## Deployment notes (Oracle Cloud)

- **Upgrade the tenancy to Pay As You Go.** Bill stays ₹0 within Always Free limits, but it removes the idle-reclaim policy (Oracle deletes free instances under 20% CPU over 7 days — a pilot will trip this) and largely fixes "out of capacity" errors. Set a **$1 budget alert** immediately afterwards.
- Free ARM tier was **halved on 15 June 2026** to 2 OCPU / 12 GB. `infra/docker-compose.yml` is sized for that.
- Put Postgres data and all file storage on the **200 GB block volume** (`/mnt/blockvol`), never the boot volume.
- Region: `ap-mumbai-1` or `ap-hyderabad-1` for data residency. Provision the VM before writing more code — A1 capacity in Indian regions is often exhausted.
- **Backups live on the same volume as the data by default.** Set `BACKUP_REMOTE` to push them off-box. See `infra/scripts/backup-loop.sh`.

---

## Compliance built into the schema

| Requirement | Where |
|---|---|
| APAAR ID (mandatory Class 1–12, AY 2026-27) | `students.apaar_id`, `apaar_status` workflow, mismatch worklist |
| UDISE+ / PEN | `students.pen_number`, `branches.udise_code` |
| DPDP Act + Rules — verifiable parental consent | `consent_records`, `consent_purposes`, `data_requests` |
| No behavioural tracking / ads for minors | `users.is_minor`; ship no ad SDKs. Do not add one later. |
| Audit of PII access | `pii_access_logs` — append-only, enforced by trigger |
| Fee-regulation acts (hike documentation) | `fee_structures` versioning + approval trail |
| Bus safety (GPS, CCTV, panic button, boarding log) | `vehicles`, `boarding_logs`, `trips.sos_raised_at` |
| CCTV retention | `incidents.cctv_retention_until` — we store metadata, never video |

---

## Building the rest of it

**→ [`BUILD_SPEC.md`](./BUILD_SPEC.md)** is the entry point: global API contract,
error-code registry, code structure, the full screen inventory, and the review
checklist.

The detail lives in **`build/`** — 16 files, each a self-contained work order you
paste into a fresh Cursor session:

- `build/00-reference-implementation.md` — a complete working vertical slice
  every module copies. **Read it in every session.**
- `build/01`–`build/10` — backend modules with full request/response contracts
- `build/11-design-system.md` — colour, type, spacing, component specs
- `build/12`–`build/15` — Flutter foundation, both apps screen by screen, web

`.cursorrules` enforces the conventions automatically.

MVP = backend `01–05`, then apps `11–14`. Ship that to the pilot schools before
starting `06`.

## Docs

Read in order:

1. `docs/01-research-and-modules.md` — market research, personas, problem statements, module catalogue
2. `docs/02-roles-and-module-matrix.md` — 30 user types × module access matrix
3. `docs/03-tech-stack-and-infra.md` — stack decisions, Oracle Always Free constraints, cost model
4. `docs/04-sync-architecture.md` — click-to-sync protocol
5. `docs/05-platform-console-and-growth.md` — master admin console, growth engine
6. `docs/06-performance-playbook.md` — budgets and the rules that enforce them
# school-allways
