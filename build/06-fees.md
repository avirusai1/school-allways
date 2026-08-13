# 06 — Fees

**Depends on:** 02, 04. **All money is integer paise. ₹1,250.50 = `125050`.**

**The differentiator is RECONCILIATION, not collection.** Every competitor shows
a payment button. Almost nobody solves month-end matching across cash, cheque,
UPI, gateway and bank — which is where a school accountant loses 2–3 hours a
day. Make that the flagship.

---

## 1. Fee structure (`fee.structure.*`)

```
GET/POST/PATCH /v1/fees/heads
GET/POST       /v1/fees/structures
POST           /v1/fees/structures/:id/approve
GET            /v1/fees/structures/:id/preview?classId=   computed per student
```

```jsonc
POST /v1/fees/structures
{ "academicSessionId": "uuid", "classId": "uuid", "name": "Class V 2026-27",
  "effectiveFrom": "2026-04-01",
  "items": [
    { "feeHeadId": "tuition", "termId": "t1", "amountPaise": 1500000,
      "frequency": "term", "dueDate": "2026-04-15",
      "lateFeePerDayPaise": 5000, "lateFeeMaxPaise": 200000, "graceDays": 7 }
  ] }
```

**Immutable once approved.** A change creates `version + 1` with its own
approval trail — several state fee-regulation acts require documented
justification for hikes. Compute `hikeOverPreviousBp` automatically and require
`hikeJustification` when it exceeds a configurable threshold.

## 2. Concessions

```
GET/POST /v1/fees/concessions
POST     /v1/fees/concessions/:id/approve
```

Types: `sibling · staff_ward · rte · sc_st · ews · merit · sports ·
single_parent · financial_aid · management`.

Applied at invoice generation. **Every applied concession is recorded** in
`invoice_lines.appliedConcessionIds` so a waiver is always auditable — this is
what a fee-regulation audit asks for.

Stacking rule: percentage concessions apply to the gross; flat amounts apply
after; the total can never exceed the line's gross. Test sibling + RTE + merit
together.

## 3. Invoice generation

```jsonc
POST /v1/fees/invoices/generate
{ "academicSessionId": "uuid", "termId": "uuid",
  "classIds": ["uuid"], "issueDate": "2026-04-01", "dryRun": false }
→ 202 { "jobId": "...", "estimatedCount": 412 }
```

- BullMQ, chunked 500, progress events
- **Idempotent** — re-running must not duplicate. Deterministic job id
  `inv-{sessionId}-{termId}-{classId}`
- `invoiceNo` **gapless per branch per session**: use a Postgres sequence per
  branch, never `MAX()+1` (which races under concurrent jobs)
- `balancePaise` is a **generated column** (`net - paid`) so the defaulter list
  can never disagree with the invoice detail

## 4. Collection

```
POST /v1/fees/payments                   counter collection
POST /v1/fees/payments/online/initiate   → gateway order
POST /v1/fees/payments/online/webhook    @Public(), signature-verified
GET  /v1/fees/payments/:id               polling after app backgrounding
POST /v1/fees/payments/:id/refund
```

**The webhook is the source of truth, not the client callback.** A parent who
closes the browser mid-payment must still get their receipt. The client polls
`GET /payments/:id` on resume.

Webhooks must be **idempotent** — gateways replay. Key on `gatewayPaymentId`.

Receipt numbers are gapless and issued **only on success**.

**Multi-child combined checkout:** one gateway order settling invoices across
several children of the same guardian. Parents want one transaction.

## 5. Reconciliation — build this well

```
GET  /v1/fees/reconciliation/worklist          unmatched payments + settlements
POST /v1/fees/reconciliation/import            bank statement / payout CSV
POST /v1/fees/reconciliation/auto-match
POST /v1/fees/reconciliation/:settlementId/match  { paymentIds[] }
GET  /v1/fees/daybook?day=&counter=
POST /v1/fees/daybook/close
```

**Auto-match** on amount + date window (±3 days) + reference substring. Anything
unmatched goes to an **exception worklist** with a suggested-match score.

`settlements` is deliberately separate from `payments` and
`payment_allocations`:

- `payments` = what the parent did
- `payment_allocations` = which invoice lines it settled
- `settlements` = what actually landed in the bank

Conflating these three is exactly why incumbent reconciliation is unusable.

**Daybook close** computes `variancePaise` (counted minus expected). A non-zero
variance is the thing the accountant hunts for — surface it in red, require a
note, and block close until acknowledged.

## 6. Defaulters

```
GET  /v1/fees/defaulters?ageingBucket=&classId=
POST /v1/fees/defaulters/remind          { invoiceIds[], ladderStep }
POST /v1/fees/defaulters/:id/promise     { promiseToPayDate, notes }
```

Ageing buckets recomputed nightly (0/30/60/90/120). Reminder ladder:
`app → whatsapp → sms → office call list`. **Promise-to-pay stops the chase** —
a parent who committed to a date should not get three more texts.

**Perf:** the defaulter list uses the **partial index** on unpaid invoices only:
```sql
CREATE INDEX invoices_outstanding_idx ON invoices (branch_id, due_date)
  WHERE status IN ('issued','partially_paid','overdue');
```

## 7. The two DTOs — do not merge them

```ts
/** Teachers (fee.status.read). Status ONLY. */
class FeeStatusDto {
  studentId!: string; status!: string;
  amountDuePaise!: number; ageingBucket!: number;
}

/** Accounts (fee.invoice.read). Everything. */
class FeeInvoiceDto { /* lines, payments, instruments, gateway refs, ... */ }
```

Two separate DTOs and two separate service methods. **Never one DTO filtered at
the controller and hoped for.** Your decision #2 gives teachers visibility of
status so they can nudge — it does not make them fee collectors.

---

## Acceptance criteria

- [ ] Zero floats in the module; all arithmetic in paise
- [ ] Invoice numbers gapless under two concurrent generation jobs
- [ ] Re-running generation does not duplicate
- [ ] Replayed gateway webhooks are idempotent
- [ ] Sibling + RTE + merit stack correctly and are individually recorded
- [ ] `FeeStatusDto` contains no payment detail (explicit test)
- [ ] Auto-match handles a real bank statement CSV
- [ ] Daybook blocks close on unexplained variance
- [ ] Approving a hike records percentage and justification
- [ ] Payment survives app backgrounding, reconciles via polling
