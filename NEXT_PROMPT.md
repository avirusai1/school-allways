# Work order — Business model change: free for schools, parent-paid subscriptions
# Paste this whole file into a fresh Cursor composer session.

This is the largest single change since the build began. It reverses the
monetisation model the entire product was priced around. **Read this whole
file before writing any code**, and stop and ask if anything is ambiguous —
this touches money, GST, and access control simultaneously.

The tax and Play-policy questions in the previous draft have now been
researched against primary sources. Findings are stated inline with links.
**Two of them change the design materially** — see PART G especially.

## The new model, stated plainly

- **The platform is free for schools.** No per-school plan pricing, no
  module gating by plan tier.
- **Parents pay ₹365 per student per academic session** (₹1/day), GST
  inclusive. Per student, NOT per family — a parent with three children pays
  three times; each child unlocks independently.
- **Schools pay ₹500 + GST per year**, the **Stay Connected Fee**.
  Non-payment shows a reminder to school admin/headmaster but **blocks
  nothing**; only a platform admin can suspend a school, and only in a
  dispute.
- **Manual cash path:** a school may collect ₹365 cash from a parent and
  activate that student from the school admin panel. The platform console
  tracks these per school for invoicing back to the school.

## Two hard constraints

**1. Google Play Billing is NOT in this round.** There is no mobile app in
this repo — the Flutter apps (`build/12-14`) were never built, and Play
Billing cannot work from a web app. This round builds the entire
subscription model, enforcement, manual activation, invoicing and console
billing view. Play integration is Phase 2. Design the schema so Phase 2
slots in without migration (see the `play_*` columns) but attempt no Play
integration now.

**2. The parent app must NEVER mention or link to the cash path.** This is
now confirmed against Google's actual policy, not assumed — see PART C.

**Read first:** `.cursorrules`, `db/schema/01-tenancy.ts` (plans,
subscriptions, `tenantStatusEnum`), `db/schema/05-students.ts`,
`db/seeds/catalogues.ts`, `apps/api/src/modules/family/family.controller.ts`
(every endpoint needs the new guard), `apps/api/src/common/rbac/scope.util.ts`
(the `assertInScope` pattern you will mirror exactly), `db/schema/15-platform.ts`
(the aggregate-only privacy rule constrains what the console may see).

---

## PART A — Reverse the school-paid pricing

The previous round set `basic` at ₹250/student/month and `pro` at ₹400.
Both are now wrong; schools pay nothing per student.

1. **Collapse to a single free plan.** Keep the `plans` table (Phase 2 and
   future tiers may use it), seed exactly one public plan: code `free`, name
   "Free", `pricePerStudentYear: 0`, `includedModules` = the **full PRO
   module set**. Every school gets everything; gating moved to the
   per-student subscription layer.
2. Keep the private `pilot` plan as-is.
3. Delete `basic`/`standard`/`pro` rows, migrating existing subscription
   rows to `free` first. **Confirm with a query before deleting** — likely
   one or two E2E tenants, but don't assume zero.
4. `signup.service.ts` assigns `free`. School trial logic becomes
   irrelevant — leave the columns, stop relying on them.
5. Update `db/seeds/verify.ts` if it asserts anything about plan pricing.

---

## PART B — Subscription schema

New table `student_subscriptions`:

```ts
{
  id: pk(),
  tenantId: uuid → tenants.id, cascade, NOT NULL,
  branchId: uuid → branches.id, cascade, NOT NULL,
  studentId: uuid → students.id, cascade, NOT NULL,
  academicSessionId: uuid → academic_sessions.id, cascade, NOT NULL,

  status: enum('active','expired','refunded','cancelled') NOT NULL,

  // Money — ALWAYS integer paise, never float.
  totalPaise: integer NOT NULL,      // 36500
  basePaise: integer NOT NULL,       // 30932
  gstPaise: integer NOT NULL,        // 5568

  source: enum('google_play','manual_cash','complimentary') NOT NULL,

  // Phase 2 — nullable now, populated by Play verification later.
  playPurchaseToken: text,           // unique partial index where not null
  playOrderId: varchar(100),

  // Manual path audit — WHO took the money and when. Non-negotiable.
  activatedByUserId: uuid → users.id,
  activatedAt: timestamptz NOT NULL,
  notes: varchar(300),               // school's own receipt number

  // Billing back to the school for manual activations.
  billedToSchoolAt: timestamptz,     // null = not yet invoiced
  platformInvoiceId: uuid,

  expiresAt: timestamptz NOT NULL,   // = academic session end
  ...timestamps, ...actorstamps, ...syncable
}
```

**Unique constraint:** `(student_id, academic_session_id)` using
`unique(...).nullsNotDistinct()` per the convention in migrations
`0008`–`0010`. Precondition-check for duplicates before applying, same
pattern as those migrations.

**Indexes:** `(tenant_id, academic_session_id, status)` for the admin list;
partial index on `(tenant_id, source, billed_to_school_at)` where
`source = 'manual_cash' AND billed_to_school_at IS NULL` — that's the "what
do we invoice this school for" query and it must be cheap.

**RLS:** tenant-scoped like every other tenant table. Re-run
`app_apply_tenant_rls()` and `app_attach_sync_triggers()`, and confirm
`saw_app` grants on production — production runs least-privilege Postgres
where CI does not, which is how the `global_row_version` and `audit_logs`
REVOKE bugs were found.

### GST math — verified

**Rate: 18%.** Confirmed for SaaS/cloud subscription services. Intra-state
splits 9% CGST + 9% SGST; inter-state is 18% IGST.

**No exemption applies.** Entry 66 of Notification 12/2017-CT(R) exempts
services provided *by an educational institution to its students*. We are
not an educational institution, and our supply runs either to a parent
(B2C) or to a school (B2B). Neither is exempt. Do not build any
exemption-handling path.

₹365 is **inclusive** of 18% GST:
```
totalPaise = 36500
basePaise  = round(36500 / 1.18) = 30932
gstPaise   = totalPaise - basePaise = 5568
```

**Always derive `gstPaise` as `total - base`**, never independently — that
guarantees the three columns sum exactly with no rounding drift across
thousands of rows.

Stay Connected Fee is ₹500 **plus** GST (exclusive):
```
basePaise = 50000, gstPaise = 9000, totalPaise = 59000
```

Put both in one constants file with a comment explaining
inclusive-vs-exclusive so nobody re-derives them wrongly later.

---

## PART C — Enforcement: what locks, what must never lock

**The rule:** an unpaid student's parent sees **only today's present/absent
status** at the top of the app. Everything else is behind a paywall.

### Google Play policy — researched, and it constrains the UI

Google's Payments policy explicitly lists "subscription services… education…
content subscription services" and "cloud software and services" as
requiring Play billing for in-app purchases. Our app is squarely in scope.

The operative restriction: **within an app, developers may not lead users to
a payment method other than Play's billing system — including linking to a
webpage that could lead to an alternate payment method, or using language
that encourages purchasing outside the app.** However, **outside the app,
developers are free to communicate alternative purchase options** (email and
other channels are explicitly permitted).

**What this means concretely:**
- The parent app/paywall must not say "pay cash at school", must not link
  anywhere that leads to alternate payment, must not hint at it.
- The **school** telling parents "bring ₹365 to the office" is entirely
  fine — that's outside the app, and the school is not the developer.
- The manual activation UI lives in `web-admin` (school staff only) and must
  be invisible to `web-family`.

Build to that line exactly.

### `assertSubscribed(studentId)` — mirror `assertInScope`

Put it beside `scope.util.ts` and follow that file's discipline exactly,
including its most important invariant: **the failure mode must be "locked",
never "unlocked".** If the lookup errors, throws, or returns nothing, the
answer is LOCKED. Accidentally unlocking the product for everyone is far
worse than wrongly locking one parent, and this codebase already treats that
inversion as security-grade (`scope.util.spec.ts`). Write the tests to the
same standard.

Apply to **every** endpoint in `family.controller.ts` — `home`, `children`,
`fees`, `payments/:id`, `results`, `books`, `bus`, profile PATCH, photo,
document, `leave` (both) — plus the diary/homework feed endpoints
`web-family` calls, and the notifications inbox.

### Three things that must stay accessible when unpaid

1. **Today's attendance status** for that student.
2. **The absentee notification itself.** When a child is marked absent, the
   parent gets the alert regardless of subscription. It is a child-safety
   message; withholding it for ₹365 is wrong and a reputational risk. It is
   also your best conversion mechanic — the parent opens the app at the
   exact moment they care most and meets the paywall there.
3. **The parent's own children list with lock status**, so the paywall can
   say "Aarav — active until 31 Mar 2027 · Ananya — locked".

### Grace period

30 days from `tenants.activatedAt`, during which all students are treated as
subscribed. A school onboarding in October cannot have every parent hit a
paywall on day one — they'd never demonstrate value and would churn. Named
constant, surfaced to school admin so they know when collection starts. If
you think a different default is better, say so, but don't ship without one.

### `web-family` paywall screen

Clean, non-hostile, design-system compliant. Shows which child is locked,
₹365/year framed as ₹1/day, and what unlocks. **No mention of cash, school
payment, or any non-Play method.** For Phase 1 there is no working payment
button — state that payment opens in the mobile app (coming soon) and leave
a clearly-marked TODO for the Phase 2 Play flow.

---

## PART D — Manual cash activation (school admin panel)

New page in `web-admin`, e.g. `/subscriptions`.

- Lists students for the current session with subscription status, filterable
  by class/section, searchable by name or admission number.
- Multi-select reusing the **existing `ApprovalsPage` selection pattern** —
  don't invent a third selection UI.
- Action "Mark as paid (cash collected)" → creates subscriptions with
  `source: 'manual_cash'`, `activatedByUserId` from context (never from the
  request body), optional per-row `notes` for the school's receipt number.
- **Confirmation dialog stating the liability plainly:** *"You are activating
  24 subscriptions. School All Ways will invoice your school ₹8,760 for
  these. Continue?"* A surprise invoice is the fastest way to lose a pilot
  school.
- Batch endpoint `POST /subscriptions/manual-activate`, array input, chunked
  at 500, returning `{ activated, skipped, skippedReasons }` — the same
  partial-success standard as bulk account issue and import commit.
  Already-subscribed students are skipped with a reason, never double-charged.
- Idempotent via `X-Client-Mutation-Id` like every other write endpoint.

**Permission:** new `subscription.manual.activate`, granted to `school_admin`
and `accounts_head`. **Do not grant to `front_office`** without asking —
earlier in this build `front_office` was deliberately kept away from actions
with financial consequences, and this creates a real liability for the
school. Raise it rather than deciding unilaterally.

Audit: one batched audit event per call, not per row.

---

## PART E — Stay Connected Fee (₹500 + GST per school per year)

New table `stay_connected_fees`: `tenantId`, `academicSessionId`,
`basePaise` 50000, `gstPaise` 9000, `totalPaise` 59000, `status`
(`pending`/`paid`/`waived`), `dueDate`, `paidAt`, `invoiceNumber`, timestamps.

- One row per tenant per academic session, created when a session becomes
  current (or at tenant activation for the first).
- **Blocks nothing.** A pending fee shows a persistent but dismissible banner
  only to holders of `tenant.settings.manage` and the principal/headmaster
  role. Teachers and parents must never see it.
- Marking it paid is a **platform admin** action in `web-control`, not
  something the school can self-declare.
- **Per school, not per branch** — one fee per tenant per session regardless
  of branch count.

---

## PART F — Platform console billing view (`web-control`)

**Privacy constraint holds:** `db/schema/15-platform.ts` states the console
reads only aggregate data and structurally cannot see student PII. The
console shows **counts and totals per school**, never student names, never
which child was activated. Counts are all invoicing needs.

Per tenant, show:
- Manual activations this session: **count** and amount owed
  (`count × ₹365`), split billed vs unbilled
- Play activations: count (0 until Phase 2) — reference only; you don't
  invoice these, see PART G
- Stay Connected Fee status for the current session
- Action "Generate invoice" for unbilled manual activations → creates a
  platform invoice, stamps `billedToSchoolAt` and `platformInvoiceId` so
  rows are never double-billed

Add a CI-enforced check (same shape as the existing `platform.service.spec.ts`
grep test) proving the new console queries import nothing from
student/guardian tables.

### Manual school suspension (dispute lever)

Platform-admin-only. When suspended:
- **Staff and admin logins blocked** with a clear "contact support" message
- **Parent access is NOT blocked** — parents paid for the session; cutting
  them off over a school's billing dispute punishes the wrong people
- Uses the existing `tenantStatusEnum` value `suspended`
- Requires a written reason, audited, reversible

---

## PART G — Invoicing — RESEARCH CHANGED THIS DESIGN, READ CAREFULLY

**Finding: for Google Play purchases in India, Google is the e-commerce
operator and determines, charges, and remits GST on behalf of the
developer.** Indian developers supply their GSTIN to Google, and Google
handles GST TCS on those sales.

**Therefore we do NOT issue tax invoices to parents for Play purchases.**
Google collects from the parent, handles the GST, and remits our share. Our
system records the purchase (via Phase 2 token verification) for
entitlement, not for tax. Building a parent-facing invoicing path would be
both wrong and duplicative.

**The invoicing module is therefore only for two B2B cases:**
1. **Manual activations billed to the school** — we supply to the school,
   the school collected from parents. Bill at ₹365/student inclusive
   (₹309.32 base + ₹55.68 GST), so the school is cash-neutral on what it
   collected.
2. **The ₹500 + GST Stay Connected Fee.**

This is a significant simplification versus the previous draft — do not
build parent-facing invoicing.

### Invoice implementation

`platform_invoices` table: sequential `invoiceNumber` (GST requires unique
sequential numbering per financial year — make the counter collision-safe
under concurrency), `tenantId`, `lineItems` jsonb, `basePaise`, `cgstPaise`,
`sgstPaise`, `igstPaise`, `totalPaise`, `placeOfSupply`, `issuedAt`,
`status`.

**Firm identity from config, never hardcoded:** `FIRM_NAME`, `FIRM_GSTIN`,
`FIRM_ADDRESS`, `FIRM_STATE_CODE`. Invoice generation must **fail loudly**
with a clear message if `FIRM_GSTIN` is unset rather than emitting an
invoice with a blank tax number. (The user runs a proprietorship; GSTIN is
being obtained.)

**SAC code: `998315`** — "Hosting and information technology (IT)
infrastructure provisioning services", which explicitly covers SaaS and
cloud subscriptions. **This corrects the previous draft's `998314`**, which
is IT design and development services (custom development work) and is the
wrong classification for a hosted subscription product. Both attract 18%,
so the rate is unaffected, but the classification should be right on the
invoice.

**Intra-state vs inter-state:** if the school's state equals
`FIRM_STATE_CODE`, split CGST 9% + SGST 9%; otherwise IGST 18%. Source the
state from the branch/tenant data captured at signup.

Generate the PDF using the **`pdf` skill's approach** (not pypdf). Include
firm details + GSTIN, school details, SAC 998315, line items, tax split, and
total in figures and words.

**Still flag for CA review** in your report: final invoice format, the SAC
classification as applied to this specific product, and GST treatment of the
manual-activation flow (whether billing the school for what it collected
from parents is cleanest, or whether a different structure is preferable).
The research above is well-sourced but is not a substitute for a CA's sign-off.

---

## PART H — Marketing site

Rewrite `/pricing`:
- Headline: **Free for schools.**
- **₹1 per day per student** (₹365/year, GST included), paid by parents
- ₹500 + GST/year Stay Connected Fee for the school
- Remove the three-tier table entirely
- State explicitly that every feature is included for every school

---

## Explicitly NOT in this round

- Google Play Billing, purchase-token verification, the Flutter app
- Any parent-facing payment button that actually charges money
- Razorpay or any other gateway for parent payments
- Parent-facing invoicing (see PART G — Google handles it)

---

## Verification

```bash
pnpm typecheck
pnpm --filter @saw/api test
pnpm --filter @saw/db verify
pnpm --filter @saw/web-admin build
pnpm --filter @saw/web-family build
pnpm --filter @saw/web-control build
pnpm --filter @saw/web-marketing build
pnpm lint
node scripts/check-scope-decorators.mjs
node scripts/e2e-onboarding.mjs
```

Unit tests required for: the GST split summing exactly; `assertSubscribed`
failing closed on every error path (mirror `scope.util.spec.ts`'s structure
and rigour); grace-period boundary behaviour; double-activation skipped not
double-charged; invoice number sequencing under concurrent calls.

Live-verify on production against the E2E test tenant: a locked parent sees
only attendance, an activated one sees everything, the manual activation
appears in the console count, and invoice generation refuses cleanly without
`FIRM_GSTIN` with a clear message.

## Definition of done

- [ ] Plans collapsed to one free plan; no per-school pricing anywhere
- [ ] `student_subscriptions` live with correct constraints, indexes, RLS,
      confirmed `saw_app` grants on production
- [ ] GST math exact, `gst = total - base`, test-verified
- [ ] `assertSubscribed` on every family endpoint, fails closed, tested to
      `scope.util.spec.ts` standard
- [ ] Attendance status, absentee notifications, children list stay
      accessible when unpaid
- [ ] 30-day grace period, surfaced to school admin
- [ ] Paywall in `web-family` with zero reference to cash/alternate payment
- [ ] Manual activation UI with explicit liability confirmation, batched,
      idempotent, partial-success reporting, audited
- [ ] `subscription.manual.activate` scoped; `front_office` question raised
- [ ] Stay Connected Fee tracked, banner to admin/head only, blocks nothing
- [ ] Console shows per-school counts and amounts owed, zero student PII,
      CI-enforced
- [ ] Invoicing covers ONLY school-billed manual activations + Stay
      Connected Fee — no parent-facing invoices
- [ ] SAC 998315 on invoices, correct CGST/SGST vs IGST split, sequential
      numbering, fails loudly without GSTIN
- [ ] Suspension blocks staff but not parents
- [ ] Marketing page reflects the real model
- [ ] Regression check on all production sites passes

---

**Report back with:** every judgment call, the `front_office` permission
question, anything still needing CA review, live verification output, test
results, and anything in this spec that was wrong, contradictory, or
impossible. **If anything is ambiguous, stop and ask rather than guessing —
this round touches money and access control at the same time.**
