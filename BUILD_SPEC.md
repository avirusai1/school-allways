# BUILD_SPEC.md — School All Ways

**The executable build specification.** Everything Cursor needs to write the
API, both Flutter apps, and all four web surfaces.

Version 2.0 · Repo `git@github.com:avirusai1/school-all-ways.git`

---

## 0. How to drive this

The detail lives in `build/`. Each file is a complete work order — exact file
trees, full request/response JSON, DTO definitions with validators, screen
layouts, widget trees, acceptance tests.

**Workflow per module:**

1. Open a **fresh Cursor composer session** (fresh context per module produces
   dramatically better output than one long conversation).
2. Paste this preamble:

   > Read `.cursorrules`, `BUILD_SPEC.md`, `build/00-reference-implementation.md`,
   > and `build/<the file>`. Follow the reference implementation's patterns
   > exactly. Do not invent new architectural patterns. Do not modify
   > `common/database/tenant-db.service.ts`, `common/rbac/scope.util.ts`, or
   > `db/sql/002_rls.sql`.

3. Then paste the module file's **PROMPT** block.
4. Run `pnpm typecheck && pnpm test && pnpm --filter @saw/db verify`.
5. Review the diff for the items in §7 "Review checklist" below.

**`build/00-reference-implementation.md` is mandatory reading for every
session.** It contains one complete, working vertical slice — controller,
service, DTOs, repository, tests — that every other module is a variation of.
Cursor produces consistent code when it has a concrete pattern to copy and
inconsistent code when it has prose.

### File index

| File | Contents |
|---|---|
| `build/00-reference-implementation.md` | **Read first, every session.** A full working vertical slice to pattern-match |
| `build/01-auth.md` | OTP, JWT, session payload, tenant selection, idempotency |
| `build/02-core-data.md` | Academic structure, rollover, students, staff, import engine |
| `build/03-attendance.md` | Registers, marking, summaries, absentee alerts |
| `build/04-communication.md` | Notifications, announcements, masked threads, homework |
| `build/05-onboarding.md` | Self-serve signup wizard, activation, nudges |
| `build/06-fees.md` | Structures, concessions, invoices, payments, reconciliation |
| `build/07-exams.md` | Exams, marks, results, report cards, HPC |
| `build/08-books-sync.md` | Sync engine + digital book library |
| `build/09-transport-safety.md` | Routes, live tracking, boarding, gate, pickup |
| `build/10-platform-console.md` | Master admin, rollups, flags, support sessions, growth |
| **`build/11-design-system.md`** | **Colour, type, spacing, components — the visual spec** |
| `build/12-flutter-foundation.md` | Architecture, Riverpod, offline, server-driven nav |
| `build/13-family-app.md` | Every screen of School All Ways |
| `build/14-admin-app.md` | Every screen of School All Ways Admin |
| `build/15-web.md` | Marketing site + 3 SPAs |
| **`build/16-onboarding-import-ui.md`** | **Onboarding wizard, import UI, academic setup — the self-serve front door** |

**Build order**

```
Backend MVP   01 → 02 → 03 → 04 → 05
Apps MVP      11 → 12 → 13 → 14
Web           15
Paid modules  06 → 07 → 08 → 09
Control       10
```

`build/11-design-system.md` is read alongside 13, 14 and 15 — never build a
screen without it open.

---

## 1. What already exists

Do not rebuild these. Read them; they are the patterns.

```
db/schema/               114 tables, 15 domain files, fully typed
db/sql/001_*.sql         extensions, global row_version sequence, sync triggers
db/sql/002_rls.sql       Row Level Security — DO NOT EDIT without review
db/seeds/                165 permissions, 31 roles, plans, DPDP consent purposes
db/seeds/verify.ts       static verification, runs in CI without a DB

apps/api/src/common/
  context/               AsyncLocalStorage request context
  database/              TenantDbService — THE security boundary
  rbac/                  permission resolver, guard, decorators, scope→SQL
  audit/                 audit + PII-read interceptor
  redis/                 Redis client provider
  storage/               (to build — build/00 shows the pattern)
apps/api/src/config/     Zod env validation
apps/api/src/modules/health/
```

---

## 2. Global API contract

Every endpoint in every module obeys this. Cursor must not invent alternatives.

### 2.1 Base

```
Base URL     https://api.school.techallways.com/v1
Auth         Authorization: Bearer <accessToken>
Content      application/json; charset=utf-8
Idempotency  X-Client-Mutation-Id: <uuid>   (all POST/PATCH from mobile)
Tracing      X-Request-Id: <uuid>           (echoed in every response)
Language     Accept-Language: en | hi
```

### 2.2 Success envelope

**List responses** — always this shape, never a bare array:

```json
{
  "data": [ /* items */ ],
  "meta": {
    "nextCursor": "eyJpZCI6...",
    "hasMore": true,
    "count": 50
  }
}
```

**Single-item responses** — the object at the top level, no wrapper:

```json
{ "id": "uuid", "firstName": "Aarav", "...": "..." }
```

**Mutations** return the mutated resource with `201` (create) or `200` (update).
Deletes return `204` with no body.

### 2.3 Error envelope — every error, without exception

```json
{
  "error": {
    "code": "SCOPE_VIOLATION",
    "message": "This student is not in a section you teach.",
    "details": { "studentId": "uuid", "permission": "student.record.read" },
    "requestId": "uuid",
    "fields": {
      "dateOfBirth": "Must be a valid date in DD/MM/YYYY format"
    }
  }
}
```

`message` is shown to the user. **Teachers and parents read these**, so write
them in plain language. "Invalid input" is a bug, not an error message.
`fields` is present only for validation errors.

**Error code registry** — use these exact codes:

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | DTO validation; `fields` populated |
| 400 | `BAD_REQUEST` | Malformed request that isn't field-level |
| 401 | `UNAUTHENTICATED` | Missing/invalid token |
| 401 | `TOKEN_EXPIRED` | Client should refresh, not re-login |
| 401 | `OTP_INVALID` | Wrong or expired OTP |
| 403 | `PERMISSION_DENIED` | Lacks the permission |
| 403 | `SCOPE_VIOLATION` | Has permission, wrong rows |
| 403 | `TENANT_MISMATCH` | Asked for a school they don't belong to |
| 403 | `FEATURE_NOT_IN_PLAN` | Module not in subscription |
| 404 | `NOT_FOUND` | |
| 409 | `CONFLICT` | Unique violation, e.g. duplicate admission no |
| 409 | `ALREADY_MARKED` | Attendance/marks already submitted |
| 409 | `SESSION_LOCKED` | Academic session is read-only |
| 422 | `BUSINESS_RULE` | Valid input, disallowed by domain rules |
| 429 | `RATE_LIMITED` | `details.retryAfterSeconds` populated |
| 500 | `INTERNAL` | Never leak a stack trace |
| 503 | `SERVICE_UNAVAILABLE` | Dependency down |

### 2.4 Pagination — keyset only, never OFFSET

```
GET /v1/students?limit=50&cursor=<opaque>&sort=name
```

Cursor is base64 of `{ "v": [lastSortValue, lastId] }`. Server caps `limit` at
100. `nextCursor` is null when exhausted. See `build/00` §6 for the helper.

### 2.5 Field selection

List endpoints accept `?fields=id,firstName,rollNo`. Unknown fields are ignored,
not an error. The family app home screen needs 5 fields from 4 entities and must
not download 4 full objects.

### 2.6 Conditional requests

Every list endpoint sets `ETag`. Clients send `If-None-Match`; a `304` is ~100
bytes and costs no serialisation.

### 2.7 Dates and money

| Type | Wire format | Example |
|---|---|---|
| Date | `YYYY-MM-DD` | `"2026-08-10"` |
| Timestamp | ISO 8601 UTC | `"2026-08-10T04:30:00.000Z"` |
| Time | `HH:mm` 24h | `"08:15"` |
| Money | **integer paise** | `125050` = ₹1,250.50 |
| Percentage | **basis points** | `9250` = 92.50% |
| Phone | E.164, no `+` | `"919876543210"` |

The API never sends a formatted currency string. Clients format. Money is
integer paise on the wire, in the database, and in every calculation.

---

## 3. Backend code structure

Every module follows this shape. No exceptions, no creativity.

```
apps/api/src/modules/<module>/
├── <module>.module.ts
├── <module>.controller.ts        thin: validate → delegate → shape
├── <module>.service.ts           business logic, transactions
├── <module>.repository.ts        all Drizzle queries live here
├── dto/
│   ├── create-<x>.dto.ts
│   ├── update-<x>.dto.ts
│   ├── list-<x>.query.ts         query params + pagination
│   └── <x>.response.ts           explicit response shape
├── <module>.service.spec.ts
└── processors/                   BullMQ jobs, if any
    └── <job>.processor.ts
```

**Layer rules:**

- **Controller** never touches the database. It validates, calls one service
  method, maps to a response DTO.
- **Service** owns transactions and business rules. It calls the repository. It
  never builds SQL.
- **Repository** owns every Drizzle query. It takes `tx: Tx` as its first
  parameter — it never opens its own transaction. This is what makes tenant
  scoping composable and testable.
- **Response DTOs are explicit classes**, never `return entity`. Two separate
  DTOs where two audiences see different fields (e.g. `FeeStatusDto` for
  teachers vs `FeeInvoiceDto` for accounts) — never one DTO filtered at the
  controller and hoped for.

---

## 4. Frontend architecture summary

Full detail in `build/12-flutter-foundation.md` and `build/15-web.md`.
Visual specification in `build/11-design-system.md`.

### Flutter (both apps)

```
apps/mobile-<app>/lib/
├── main.dart
├── app.dart                      MaterialApp, router, theme
├── router/
│   ├── app_router.dart           go_router config
│   └── nav_manifest.dart         SERVER-DRIVEN nav (see below)
├── features/<feature>/
│   ├── data/                     repository + Drift DAO
│   ├── domain/                   models (freezed)
│   ├── application/              Riverpod providers/notifiers
│   └── presentation/
│       ├── <feature>_screen.dart
│       └── widgets/
└── core/                         re-exports from packages/flutter/*
```

**Navigation is server-driven.** `GET /v1/auth/session` returns `navManifest`
and `homeScreen`. The app maps manifest keys to routes via a lookup table. A
role change on the server changes navigation on the next session refresh — no
Play Store release. The staff app supports 26 roles from one binary this way.

**State:** Riverpod only. `AsyncNotifierProvider` for anything that loads.
`ref.watch(provider.select((s) => s.field))` so a widget rebuilds only on the
field it reads.

**Offline:** every screen reads from Drift first and renders instantly, then
refreshes. Writes go to the outbox and reconcile. Never a spinner on cold start
when cached data exists.

### Web

Four static builds on Cloudflare Pages. Nothing runs on the Oracle box but the
API.

| App | Stack | Domain |
|---|---|---|
| `web-marketing` | Next.js 15 SSG/ISR | `school.techallways.com` |
| `web-admin` | React 19 + Vite SPA | `admin.school.techallways.com` |
| `web-family` | React 19 + Vite SPA | `app.school.techallways.com` |
| `web-control` | React 19 + Vite SPA | `control.school.techallways.com` |

---

## 5. Design system — the actual tokens

Used identically in Flutter (`design_system` package) and web (Tailwind config).

### Colour

```
Primary        #1B5E9C   deep blue — trust, institutional
Primary dark   #134372
Primary light  #E8F1F9
Accent         #F2A93B   amber — CTAs, highlights
Success        #2E7D4F
Warning        #C77700
Danger         #C0392B
Info           #2A6FA8

Neutral 900    #16202B   primary text
Neutral 700    #3D4C5C   secondary text
Neutral 500    #6B7B8C   tertiary / hints
Neutral 300    #C3CDD6   borders
Neutral 100    #EEF2F5   surfaces
Neutral 0      #FFFFFF

Attendance:  present #2E7D4F · absent #C0392B · late #C77700 · leave #6B7B8C
```

Schools can override `primaryColor` (white-label). Never hardcode a hex in a
widget — read from theme.

### Typography

```
Family: Noto Sans + Noto Sans Devanagari   <-- MUST render Hindi
Display  28/34  w700     screen titles
H1       22/28  w600
H2       18/24  w600
Body     15/22  w400     default
Body sm  13/18  w400     secondary
Caption  12/16  w500     labels, chips
Numeric  tabular figures for marks, money, roll numbers
```

Test with Hindi strings from day one. Retrofitting Devanagari breaks layouts.

### Spacing & shape

```
Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48
Radius: sm 6 · md 10 · lg 16 · pill 999
Elevation: card 1 · sheet 8 · dialog 16
Touch target: minimum 48×48 (guards and drivers use this one-handed)
Screen padding: 16 mobile · 24 tablet
```

### Component states — every interactive component defines all five

`default · hover/pressed · focused · disabled · loading`

Every screen defines four states: **loading (skeleton, not spinner) · empty
(illustration + one action) · error (message + retry) · content**. A screen
without an empty state is unfinished.

---

## 6. Complete screen inventory

### School All Ways (family) — 24 screens

| # | Screen | Route | Detail |
|---|---|---|---|
| F1 | Splash / auth gate | `/` | `build/12` §1 |
| F2 | Phone login | `/login` | §2 |
| F3 | OTP verify | `/login/otp` | §2 |
| F4 | School selector | `/select-school` | §3 |
| F5 | Child switcher | sheet | §4 |
| F6 | Home feed | `/home` | §5 |
| F7 | Attendance | `/attendance` | §6 |
| F8 | Leave request | `/attendance/leave` | §6 |
| F9 | Homework list | `/homework` | §7 |
| F10 | Homework detail | `/homework/:id` | §7 |
| F11 | Diary | `/diary` | §7 |
| F12 | Notices | `/notices` | §8 |
| F13 | Notice detail | `/notices/:id` | §8 |
| F14 | Messages (threads) | `/messages` | §9 |
| F15 | Thread | `/messages/:id` | §9 |
| F16 | Fees overview | `/fees` | §10 |
| F17 | Invoice detail | `/fees/:id` | §10 |
| F18 | Payment | `/fees/:id/pay` | §10 |
| F19 | Results | `/results` | §11 |
| F20 | Report card | `/results/:id` | §11 |
| F21 | Bus tracking | `/bus` | §12 |
| F22 | Books shelf | `/books` | §13 |
| F23 | Book reader | `/books/:id/read` | §13 |
| F24 | Gallery | `/gallery` | §14 |
| F25 | Pickup management | `/pickup` | §15 |
| F26 | Privacy centre | `/privacy` | §16 |
| F27 | Profile & settings | `/settings` | §17 |

### School All Ways Admin (staff) — 32 screens

Rendered per `navManifest`; a guard sees 4, a school admin ~25.

| # | Screen | Manifest key | Detail |
|---|---|---|---|
| A1 | Login / OTP | — | `build/13` §1 |
| A2 | Role home router | — | §2 |
| A3 | Teacher home | `teacher_home` | §3 |
| A4 | **Take attendance** | `take_attendance` | §4 ← most important screen |
| A5 | My class | `my_class` | §5 |
| A6 | Student profile | — | §5 |
| A7 | Homework list/compose | `homework` | §6 |
| A8 | Diary compose | `diary` | §6 |
| A9 | Marks entry grid | `marks_entry` | §7 |
| A10 | Report cards | `report_cards` | §7 |
| A11 | Messages | `messages` | §8 |
| A12 | Timetable | `timetable` | §9 |
| A13 | Leave | `leave` | §10 |
| A14 | Principal dashboard | `principal_dashboard` | §11 |
| A15 | Approvals inbox | `approvals` | §12 |
| A16 | Attendance overview | `attendance_overview` | §13 |
| A17 | Coordinator dashboard | `coordinator_dashboard` | §14 |
| A18 | Syllabus coverage | `syllabus_coverage` | §14 |
| A19 | Marks status | `marks_status` | §14 |
| A20 | Substitutions | `substitutions` | §15 |
| A21 | Fee counter | `fee_counter` | §16 |
| A22 | Collect fee | `collect_fee` | §16 |
| A23 | Daybook | `daybook` | §16 |
| A24 | Finance dashboard | `finance_dashboard` | §17 |
| A25 | Defaulters | `defaulters` | §17 |
| A26 | Front office | `front_office` | §18 |
| A27 | Visitors | `visitors` | §18 |
| A28 | **Gate scanner** | `gate_scanner` | §19 |
| A29 | Verify pickup | `verify_pickup` | §19 |
| A30 | **Driver home** | `driver_home` | §20 |
| A31 | Scan boarding | `scan_boarding` | §20 |
| A32 | SOS | `sos` | §20 |
| A33 | Compliance centre | `compliance_centre` | §21 |

### Web

- **Marketing** — 14 pages, `build/14` §2
- **Admin console** — 38 routes, `build/14` §3
- **Family portal** — mirrors the app, `build/14` §4
- **Control panel** — 10 screens, `build/14` §5

---

## 7. Review checklist — run on every Cursor diff

Security:
- [ ] No tenant id read from header, query or body
- [ ] Every list endpoint applies `scopeFilter()`
- [ ] Every detail/mutation applies `assertInScope()`
- [ ] Response DTO is explicit — no `return entity`
- [ ] No teacher `personalPhone` in a parent-reachable DTO
- [ ] No OTP / full Aadhaar / full phone in any log

Performance (`docs/06-performance-playbook.md`):
- [ ] ≤ 4 queries per endpoint
- [ ] Columns named, no `SELECT *`
- [ ] Keyset pagination, no `OFFSET`
- [ ] No `await` inside a loop over rows
- [ ] Index exists for every new `WHERE`/`ORDER BY`
- [ ] Slow work queued, not inline
- [ ] Cache keys include `tenant_id`

Correctness:
- [ ] Money is integer paise everywhere
- [ ] Academic entities bound to `academic_session_id`
- [ ] Mobile mutations accept `X-Client-Mutation-Id`
- [ ] Error messages readable by a school clerk
- [ ] Loading / empty / error states exist on every screen

---

## 8. Reference documents

| Doc | Settles |
|---|---|
| `.cursorrules` | The five laws |
| `docs/01-research-and-modules.md` | Personas, problems, 53-module catalogue |
| `docs/02-roles-and-module-matrix.md` | 30 user types × module access matrix |
| `docs/03-tech-stack-and-infra.md` | Stack, Oracle limits, tenant isolation |
| `docs/04-sync-architecture.md` | Click-to-sync protocol |
| `docs/05-platform-console-and-growth.md` | Master admin, growth |
| `docs/06-performance-playbook.md` | Budgets and rules |
| `db/seeds/roles.ts` | What each role can do — this is the spec |
| `db/seeds/verify.ts` | The test that proves it |
