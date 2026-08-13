# 10 — Platform Console (Master Admin)

**Depends on:** everything. **Read `docs/05-platform-console-and-growth.md` first.**

---

## THE GOVERNING CONSTRAINT — read twice

The console's entire API surface reads **only** from aggregate rollup tables:
`tenant_metrics_daily`, `tenant_health`, `onboarding_events`,
`platform_feature_flags`, `tenant_feature_overrides`, `subscriptions`,
`referrals`, `partners`.

**It must never query `students`, `guardians`, `marks`, `invoices`, `messages`
or any other tenant data table.** Not "shouldn't" — the module must be
structurally incapable of it. If you find yourself importing `students` into a
platform service, stop: the answer is a new column on `tenant_metrics_daily`,
computed by the nightly rollup.

CI enforces this:
```bash
grep -rE "from '@saw/db'" apps/api/src/modules/platform/ \
  | grep -E "students|guardians|marks|invoices|messages|payments" \
  && echo "FORBIDDEN IMPORT" && exit 1
```

This is a commercial asset as much as an ethical one: *"we physically cannot see
your students' data from our admin panel"* closes deals with principals who have
been burned before.

---

## 1. Nightly rollup (`platform/processors/rollup.processor.ts`)

Runs 01:30 IST. **Iterates tenants one at a time via `db.asTenant()` so RLS
still applies.** Do NOT write a cross-tenant `GROUP BY tenant_id` query — that
is the pattern that later grows into a leak.

```ts
for (const tenantId of await this.activeTenantIds()) {
  await this.db.asTenant(tenantId, async (tx) => {
    const metrics = await this.computeMetrics(tx, tenantId, day);
    await this.upsertMetrics(tx, metrics);      // idempotent on (tenant, day)
    await this.upsertHealth(tx, this.score(metrics));
  });
}
```

Must complete for 100 tenants in < 5 minutes. Idempotent per (tenant, day).

### Health scoring

```
activation  = wizard completed (40) + first attendance taken (60)
engagement  = staff DAU/MAU + parent activation % + recency of last activity
adoption    = count of modules with real usage in the last 7 days
score       = 0.3*activation + 0.5*engagement + 0.2*adoption

bands: not_started | onboarding | activated | healthy | at_risk | churning | dormant
```

**The churn predictor:**
`attendance_registers_marked ÷ expected < 60% for 3 consecutive working days`
→ `at_risk` with an explicit `riskReason`.

A school that stops marking attendance has churned and simply hasn't told you
yet. It is the daily habit everything else hangs off.

---

## 2. Feature flags

Resolution order — implement exactly:

```
kill switch ON              → OFF, stop
tenant override (unexpired) → that value
plan includes module        → ON
rollout % covers tenant     → ON    bucket = hash(tenantId + flagKey) % 100
otherwise                   → flag default
```

Bucketing by a hash of tenant id means a school never flips between requests.
Cache the resolved set per tenant in Redis (5 min), bust on any flag write.
Expose to clients in `GET /auth/session` → `features`.

**Build the kill switch before you need it.** Deploying a fix takes minutes;
flipping a flag takes seconds.

```
GET  /v1/platform/flags
POST /v1/platform/flags
POST /v1/platform/flags/:id/override    { tenantId, value, expiresAt, reason }
POST /v1/platform/flags/:id/kill        { enabled: true }
```

Time-boxed overrides expire on their own — a Free school trialling Transport for
a month needs no cleanup job and nothing to forget to revoke.

---

## 3. Support sessions — the only door into real data

```
POST /v1/platform/support-sessions
{ "tenantId": "uuid", "reason": "Ticket #4821: fee receipt not generating",
  "ticketRef": "4821", "accessLevel": "read_only",
  "durationMinutes": 60, "impersonatedUserId": null }
```

Non-negotiable properties:

- **`expiresAt` NOT NULL, max 4 hours.** No permanent backdoor exists, so
  there is nothing to forget to revoke.
- **Reason ≥ 20 characters.** Reject `"debug"`, `"test"`, `"checking"`.
- Sets `app.platform_admin` for that session's requests only; every request
  under it is logged at WARN and written to `audit_logs`.
- **School-visible.** `schoolNotifiedAt` set on start; the session appears in
  the school's own audit view. *A support session the customer cannot see is a
  backdoor with better branding.*
- Write access requires `approvedBySupervisorId`.
- `requiresSchoolApproval` (Pro tier) blocks the session until a school admin
  consents. Genuine trust differentiator, nearly free to build.
- **Restricted-tier data is unreachable even here** — the `platform_support`
  role excludes counselling, safe reports and health, and `db/seeds/verify.ts`
  asserts it.

---

## 4. Console endpoints

```
GET  /v1/platform/fleet                headline metrics + health distribution
GET  /v1/platform/schools              grid: health, students, last activity
GET  /v1/platform/schools/:id          aggregate drill-down
GET  /v1/platform/schools/:id/metrics?from=&to=    time series
GET  /v1/platform/funnel               onboarding drop-off by step
GET  /v1/platform/revenue              MRR, ARR, churn
GET  /v1/platform/cost-to-serve        SMS + storage + egress per school
GET  /v1/platform/alerts               at-risk schools needing attention
POST /v1/platform/announcements
GET  /v1/platform/referrals
GET  /v1/platform/partners
```

**`GET /platform/fleet` for 100 schools is ONE query** against `tenant_health`
joined to the latest `tenant_metrics_daily`. If it takes more than 3 queries,
redesign it.

---

## 5. The SPA (`apps/web-control/`)

React + Vite on Cloudflare Pages, **IP-restricted at Cloudflare**.

| Screen | Contents |
|---|---|
| Fleet dashboard | Health bands, funnel, MRR, cost-to-serve, alert list |
| Schools grid | Sortable/filterable, health chip, students, last activity |
| School detail | Aggregate drill-down, flags, subscription, support history |
| Onboarding funnel | Step drop-off with median times and error classes |
| Feature flags | Definitions, rollout %, overrides, kill switches |
| Billing | Subscriptions, invoices, dunning, revenue |
| Support queue | Open sessions, ticket links, audit trail |
| Announcements | Compose and target platform → school messages |
| Referrals & partners | Attribution, rewards, commissions |
| Platform health | Queue depth, p99, DB pool, egress, error rate |

Charts: **Recharts, one blue line series**, no legend for single series, no pie
charts, no rainbow. Follow `build/11-design-system.md` — the control panel uses
the same design language as everything else.

---

## 6. Growth (`modules/growth/`)

```
POST /v1/growth/referrals              generate a code
GET  /v1/growth/referrals/mine         school's own referrals
POST /v1/tenant/export                 full data export → queued
GET  /v1/growth/monthly-report/:month  principal's PDF
POST /v1/growth/nps/respond
```

- **Referrals reward on activation, never signup.** Rewarding signups buys you
  fake schools.
- **Data export is a marketing feature.** One button, complete archive, open
  formats, 7-day signed URL. Put it on the pricing page — making it easy to
  leave is what makes schools willing to arrive.
- **Principal's monthly report** auto-generated on the 1st: attendance trends,
  fee collection, academic performance, parent engagement. Branded, forwardable
  to their trust. The cheapest internal advocacy you will ever build.

---

## Acceptance criteria

- [ ] `grep` of `modules/platform/` finds zero tenant-data-table imports
- [ ] Rollup for 100 tenants completes in < 5 minutes and is idempotent
- [ ] Kill switch takes effect everywhere within 5 minutes
- [ ] Support session expires automatically; cannot be silently extended
- [ ] The school sees every support session in its own audit view
- [ ] Reason under 20 chars is rejected
- [ ] Fleet dashboard ≤ 3 queries
- [ ] Restricted data unreachable in a support session (explicit test)
- [ ] Referral rewards fire on activation, not signup
