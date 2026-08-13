# School All Ways — Platform Console & Growth Engine

**Version:** 0.1
**Date:** 6 Aug 2026
**Surfaces:** `control.school.techallways.com` (internal), `partners.school.techallways.com` (P2)

---

## Part 1 — The Master Admin Console

### 1.1 The governing principle: aggregate, don't inspect

You asked to "track everything without hurting the privacy of schools." Those
goals conflict unless you make the separation **structural** rather than a policy
you promise to follow.

So:

> **The console's entire API surface is built on aggregate rollup tables that
> contain no personal data. Not "we don't look" — there is nothing to look at.**

`tenant_metrics_daily`, `tenant_health` and `onboarding_events` hold counts,
sums and ratios. No name, no phone number, no mark, no fee ledger line. The
worst possible compromise of your control plane leaks *how many* students a
school has, never *who* they are.

Seeing real records requires a `platform_support_session`: time-boxed, reason-
mandatory, school-visible, fully audited. That is a different code path, and it
should feel heavier to use — because it is.

**This is also a sales asset.** "We physically cannot see your students' data
from our admin panel; here is the audit log of every time anyone from our team
accessed your school, and you can see it too" is a sentence that closes deals
with principals who have been burned by a previous vendor.

### 1.2 What you can see (and why each number earns its place)

**Fleet overview — the daily landing screen**

| Metric | Source | Why it matters |
|---|---|---|
| Schools by health band | `tenant_health.band` | Where to spend your day |
| Total students / staff / parents on platform | `tenant_metrics_daily` | The number investors ask for |
| Schools onboarded this week | `tenants.created_at` | Funnel velocity |
| Activation rate | `tenants.activated_at ÷ created_at` | Self-serve is working, or isn't |
| MRR and ARR | `subscriptions` | |
| Platform cost to serve | SMS + storage + egress | Are you underpricing? |
| Schools active per day | `tenant_metrics_daily`, grouped by day | The trend line behind the bands |

**What "active" means.** A school counts as active on a day if any of
`attendance_registers_marked`, `homework_posted`, `announcements_sent`,
`marks_entered`, `trips_run` or `invoices_raised` is greater than zero on that
day. This is the same set the health scorer counts for its adoption score —
one definition, in `ACTIVITY_COLUMNS`, used by both.

It is deliberately *not* `dau_staff` / `dau_parents`. Those columns exist in
`tenant_metrics_daily` but the rollup has never populated them, so anything
built on them plots a flat zero. Populating them needs a per-day record of who
opened an app, which we do not collect yet.

**Per-school drill-down (all aggregate)**

- Scale: branches, students, staff, guardians, classes
- Adoption: DAU/MAU for staff and parents, **parent activation %**
- Module usage: attendance registers marked vs expected, homework posted,
  announcements sent, marks entered, report cards published, trips run
- Commercial: invoices raised, fees collected, fees outstanding *(totals only)*
- Cost to serve: SMS count and spend, storage bytes, API requests, egress
- Compliance posture: APAAR generated vs pending, consents pending
- Onboarding funnel: which wizard step they are stuck on, with timings

**The one metric that predicts churn**

`attendance_registers_marked ÷ attendance_registers_expected`.

A school that stops marking attendance has churned and simply hasn't told you
yet. It is the daily habit everything else hangs off. Alert at **< 60% for 3
consecutive working days**, long before renewal.

### 1.3 Feature control, school-wide

`platform_feature_flags` + `tenant_feature_overrides` give you four powers:

1. **Enable a module for one school.** A Free-tier school wants to trial
   Transport for a month → override with `expires_at`. It reverts itself; no
   cleanup job, nothing to forget.
2. **Staged rollout.** `rollout_percentage = 10` ships a risky module to 10% of
   schools, bucketed by a hash of tenant id so a school never flips between
   requests.
3. **Kill switch.** `is_kill_switched` forces a flag off everywhere, instantly,
   ignoring every override. This is what you reach for at 2am when a module is
   melting the database. Deploying a fix takes minutes; flipping this takes
   seconds. **Build this before you need it.**
4. **Commercial gating** without code changes — the same mechanism that powers
   plan tiers.

Resolution order (implement exactly this):

```
kill switch ON            -> OFF, stop
tenant override exists    -> that value (if not expired)
plan includes module      -> ON
rollout % covers tenant   -> ON
                          -> flag default
```

Cache the resolved set per tenant in Redis (5 min), bust on any flag write.

### 1.4 Support sessions — the only door into real data

Non-negotiable properties, encoded in the schema:

- **`expires_at` is NOT NULL.** No permanent backdoor exists, so there is
  nothing to forget to revoke.
- **Attributed.** The JWT carries `imp`; every audit row records both the agent
  and the impersonated user.
- **School-visible.** `school_notified_at` is set on start and the session
  appears in the school's own audit view. *A support session the customer cannot
  see is a backdoor with better branding.*
- **Reason mandatory.** "Debugging" is not a reason; a ticket reference is.
- **Write access needs a supervisor.** `approved_by_supervisor_id`.
- **`requires_school_approval`** lets a school demand explicit per-session
  consent. Offer it on Pro. It is a genuine trust differentiator and costs you
  almost nothing to build.

Restricted-tier data (counselling notes, safe reports, health records) is
**never** reachable, even in a support session. Enforced in the seed:
`platform_support` explicitly excludes those permissions, and `db/seeds/verify.ts`
asserts it.

### 1.5 Console screens to build

| Screen | Contents |
|---|---|
| Fleet dashboard | Health bands, funnel, MRR, cost-to-serve, alerts |
| Schools grid | Sortable/filterable list with health, students, last activity |
| School detail | Aggregate drill-down, flags, subscription, support history |
| Onboarding funnel | Step-by-step drop-off with timings and error classes |
| Feature flags | Definitions, rollout %, per-school overrides, kill switches |
| Billing | Subscriptions, invoices, dunning, revenue |
| Support queue | Open sessions, ticket links, audit trail |
| Announcements | Compose and target platform → school messages |
| Referrals & partners | Attribution, rewards, commissions |
| Platform health | Queue depth, p99, DB pool, egress, error rate |

Build it as a **live artifact-style SPA on Cloudflare Pages**, reading only the
rollup endpoints. It must never hold a connection to a school's live tables.

---

## Part 2 — What else this platform needs to sell faster

Ordered by expected impact per unit of effort. Items 1–5 are the ones I would
not launch without.

### 1. One-click migration from the incumbent ⭐ highest leverage

Every school you want is already on Excel, Entab, Teachmint or MyClassboard. The
biggest barrier is not price — it is **the terror of losing their data**.

Build an importer that ingests those vendors' export formats and generic Excel:
template download → upload → **column auto-mapping** → row-level validation with
human-readable errors → dry-run preview → commit → **one-click undo of the entire
batch**.

Botched migration is the #1 cause of ERP project failure. Being visibly, boringly
excellent at import removes the single largest reason a school says no.

### 2. Data portability as a marketing feature

One button: **"Export everything"** → a complete archive of their data in open
formats. Put it on the pricing page.

Counter-intuitive but true: making it trivially easy to leave is what makes
schools willing to arrive. Every incumbent holds their data hostage; being the
opposite is a differentiator you can state in one sentence.

### 3. The APAAR compliance wedge — a deadline you didn't have to manufacture

APAAR IDs are mandatory for all students Class 1–12 in AY 2026-27, and required
for CBSE Class 9/11 registration and Class 10/12 LOC. Right now, schools are
doing this in spreadsheets and it is painful.

Ship a **free standalone APAAR/UDISE compliance tool**: bulk consent-form
generation, mismatch worklist, tracking, export. Give it away with no card. It
solves an urgent, dated problem, gets you the student roster, and the upgrade
path to the full platform is a single click.

This is the strongest single go-to-market asset in the whole product, because
the urgency is externally imposed and time-limited.

### 4. Parent activation as a product metric

Your value story dies if parents don't install. Make activation mechanical:

- WhatsApp/SMS deep links, bulk-sendable, that open straight into the app
- **Web portal fallback** — non-optional in India; many parents will never install
- **Parent self-fill onboarding**: the school imports name + class + parent phone,
  and the parent app collects the rest (address, photo, documents, Aadhaar
  consent for APAAR). Turns your biggest data-entry cost into a distributed task.
- Track `parent_activation_bp` per school and nudge the ones below 50%

### 5. The principal's monthly report

Auto-generate a branded PDF the principal can forward to their trust/management:
attendance trends, fee collection, academic performance, parent engagement.

This makes the buyer look good to *their* boss. It is the cheapest internal
advocacy you will ever build, and it arrives every month without you doing
anything.

---

### 6–14, in rough priority order

| # | Feature | Rationale |
|---|---|---|
| 6 | **Sandbox / demo mode** with realistic sample data, wipeable in one click | A principal will click around before committing real data. Let them. |
| 7 | **Referral engine** (`referrals` table) | Indian principals know each other through board associations and cluster meets. Reward on **activation**, not signup — rewarding signups buys you fake schools. |
| 8 | **Partner/reseller portal** (`partners`) | How you reach hundreds without a sales team. Local IT vendors already sell to these schools. Scope their console to aggregates too. |
| 9 | **Comparison landing pages** — "vs Teachmint", "vs Entab", "vs Excel" | These are high-intent search queries with almost no good content. Cheap, durable SEO. |
| 10 | **Per-school public microsite** (`{slug}.school.techallways.com`) | Free website for the school, SEO surface for you, and a soft brand impression on every parent. |
| 11 | **Pricing calculator + transparent public pricing** | Indian school ERP is opaque and quote-driven. Publishing prices is itself a differentiator, and it filters out schools you'd waste time on. |
| 12 | **In-app academy** — 90-second Hindi/English videos per module | Weak training is a top cause of ERP failure. Also deflects support at zero marginal cost. |
| 13 | **Support that answers the phone** during fee and exam season | "Ticket-only support" is the #1 complaint about incumbents. In-app chat + callback request on every screen. Then say so in your marketing. |
| 14 | **NPS → testimonial pipeline** | Promoters get a one-tap "share your experience" prompt. Social proof compounds. |

---

### Two things I'd deliberately NOT build early

- **AI features as a headline.** AI report-card comments and HPC drafting are
  genuinely useful and worth building — but as a *retention* feature in P3, not
  a launch differentiator. Schools buy attendance, fees and safety. Nobody
  switches ERP for AI, and leading with it invites comparison on a dimension
  where a funded competitor will outspend you.
- **iOS at launch.** Flutter makes it cheap later. Play-first is correct for
  India; shipping two stores at once doubles your release friction for maybe 5%
  of your users.

---

## Part 3 — Growth instrumentation

The `onboarding_events` table is the growth loop, not analytics vanity. Every
wizard step logs `started` / `completed` / `skipped` / `failed` / `abandoned`
with a duration, an item count and an **error class** (never row data).

The report to build first:

```
Step                  Started  Completed  Median time  Drop-off
school_profile           100        94        2m 10s       6%
academic_session          94        91        1m 40s       3%
classes                   91        88        3m 05s       3%
subjects                  88        84        2m 55s       5%
import_staff              84        61       11m 20s      27%   <-- fix this
import_students           61        44       19m 45s      28%   <-- and this
invite_staff              44        41        1m 15s       7%
invite_parents            41        33        2m 30s      20%
first_attendance          33        31          45s        6%
```

If 27% abandon at "import staff", that one number tells you what to build next.
You cannot learn it from a completion rate.

**North-star metric: time from signup to first attendance marked.** Target under
30 minutes. Everything in the onboarding wizard should be judged against it.
