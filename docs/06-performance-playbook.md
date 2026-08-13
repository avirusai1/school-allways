# School All Ways — Performance Playbook

**Version:** 0.1
**Date:** 6 Aug 2026
**Constraint:** 2 OCPU / 12 GB ARM, 10 Mbps load balancer, 10 TB/month egress

> The binding constraint is **not CPU**. It is bandwidth and database round
> trips. Optimise bytes and queries; CPU is the last thing you will run out of.

---

## 1. Budgets — put these in tests, not in your head

| Surface | Budget | Why |
|---|---|---|
| API p50 | < 80 ms | |
| API p99 | < 400 ms | |
| DB queries per request | **≤ 4** | more means you have an N+1 |
| Response payload, list endpoint | < 60 KB | 10 Mbps ÷ 60 KB ≈ 20 concurrent |
| App cold start, no changes | **0 bytes** beyond `/sync/status` | see `docs/04` |
| `/sync/status` | < 500 B, < 100 ms | called on every app open |
| Attendance submit, 40 students | < 4 KB, < 500 ms | the highest-frequency write |
| Family app APK | < 25 MB | budget Android phones, low storage |
| Flutter first frame | < 1.5 s on a 2 GB RAM phone | |
| Book chapter | 2–5 MB, resumable | never a 30 MB single PDF |

A regression here shows up as a **cloud bill**, not a failing test. So make it a
failing test.

---

## 2. Database — where 90% of your latency will come from

### 2.1 Rules that get a PR rejected

```ts
// ❌ Fetches 40 columns to render 3.
const students = await tx.select().from(studentsTable);

// ✅ Name the columns. On a 900-student list this is ~8x less data.
const students = await tx
  .select({ id: s.id, firstName: s.firstName, rollNo: e.rollNo })
  .from(s).innerJoin(e, eq(e.studentId, s.id));
```

```ts
// ❌ N+1. 41 round trips for one screen.
for (const section of sections) {
  section.students = await tx.select().from(students).where(eq(students.sectionId, section.id));
}

// ✅ One query, group in memory.
const rows = await tx.select({...}).from(students)
  .where(inArray(students.sectionId, sections.map(s => s.id)));
const bySection = Map.groupBy(rows, r => r.sectionId);
```

```ts
// ❌ OFFSET 10000 makes Postgres walk 10,000 rows and discard them.
.limit(50).offset(page * 50)

// ✅ Keyset pagination. Constant time at any depth.
.where(lt(table.createdAt, cursor)).orderBy(desc(table.createdAt)).limit(50)
```

### 2.2 COUNT(*) is a trap

`SELECT count(*) FROM students WHERE tenant_id = ?` is a full index scan. On a
dashboard that refreshes, across 100 tenants, it is your outage.

- **Live counts for a screen** → maintain a denormalised counter column, bumped
  in the same transaction as the insert.
- **Analytics counts** → `tenant_metrics_daily`, computed nightly.
- **"About N results"** → `EXPLAIN`-based estimate is fine; nobody needs an exact
  count of 12,431 search hits.

### 2.3 Index discipline

- Add the index **in the same commit** as the query that needs it.
- Composite index column order = equality columns first, then range/sort.
  `(tenant_id, day)` not `(day, tenant_id)`.
- **Partial indexes** for the hot subset — this one is worth internalising:

  ```sql
  -- The defaulter list only ever looks at unpaid invoices. Indexing all of
  -- them wastes memory that shared_buffers needs for everything else.
  CREATE INDEX invoices_outstanding_idx ON invoices (branch_id, due_date)
    WHERE status IN ('issued','partially_paid','overdue');
  ```

- **BRIN for append-only time series.** `vehicle_pings` is insert-only and
  naturally ordered by time; a BRIN index is ~1000x smaller than a btree:

  ```sql
  CREATE INDEX vehicle_pings_time_brin ON vehicle_pings USING brin (pinged_at);
  ```

- Check what you actually use, and drop the rest — unused indexes slow every write:

  ```sql
  SELECT relname, indexrelname, idx_scan FROM pg_stat_user_indexes
  WHERE idx_scan = 0 ORDER BY pg_relation_size(indexrelid) DESC;
  ```

### 2.4 Keep the transaction short

Every request opens a transaction (for `SET LOCAL app.tenant_id`). Do **not** do
network I/O inside it. Sending an SMS inside a fee-payment transaction holds a
connection open for the gateway's latency, and with `max_connections=100` you
will exhaust the pool under load. Commit first, enqueue second.

### 2.5 Partition before it hurts

Three tables will dominate row count. Plan for monthly partitioning:

| Table | Growth | Trigger point |
|---|---|---|
| `delivery_attempts` | ~1 row per recipient per message | ~50M rows |
| `student_attendance` | students × 200 days × periods | ~50M rows |
| `vehicle_pings` | ping rate × vehicles × trip minutes | **retain 7 days, drop partitions** |

Never `DELETE` from these to prune. `DROP PARTITION` is instant and does not
bloat the table.

---

## 3. Caching — in priority order

1. **Postgres `shared_buffers` (1 GB).** The cheapest cache. Right indexes beat
   any application cache.
2. **Redis.** Session lookups; **permission resolution** (a multi-join — cache
   5 min, bust explicitly on role change, never rely on TTL alone); live bus
   positions; rate limit counters.
3. **HTTP `ETag` / `If-None-Match`** on every list endpoint. A 304 is ~100 bytes
   and costs no serialisation.
4. **Cloudflare** in front of everything. Free tier, absorbs static and cacheable
   responses before they touch the 10 Mbps link.

Explicitly **not** doing: a separate application object cache. One more thing to
invalidate wrongly. Postgres + Redis carries this workload past 100 schools.

**Cache key hygiene:** always include the tenant id. `perm:v1:{tenant}:{user}:{branch}`.
A cache key without a tenant id is a cross-tenant leak with a TTL.

---

## 4. API shape

- **Field selection.** `?fields=id,firstName,rollNo` on list endpoints. The
  family app home screen needs 5 fields from 4 entities; it should not download
  4 full objects.
- **Compound endpoints for known screens.** `GET /family/home` returning
  everything the home screen needs in one round trip beats six clean REST calls
  on a 3G connection in a tier-2 town. Purity loses to latency here.
- **`zstd`/`gzip` on everything.** Caddy handles it; JSON compresses ~80%.
- **204 over empty 200.** Saves a body and makes intent explicit.
- **Never return a stack trace.** Structured error codes the client can switch on.

### Rate limits, tuned to reality

| Endpoint class | Limit |
|---|---|
| OTP request | 3 / phone / 15 min, 10 / IP / hour |
| Login | 10 / phone / hour |
| Sync pull | 30 / device / minute |
| General authenticated | 120 / minute |
| Bulk import | 5 / tenant / hour |

---

## 5. Background work — anything slow goes to BullMQ

Queue it, always: PDF generation (report cards, receipts, ID cards), bulk
imports, notification fan-out, image resizing, nightly rollups, APAAR/UDISE
exports, fee invoice generation, defaulter ladder.

Queue hygiene on a small box:

- **Concurrency 2–4.** More workers on 2 cores just adds context switching.
- **Separate queues by priority.** A 900-page report-card render must not block
  an absentee alert.
- **Every job idempotent**, keyed by a deterministic job id, so a retry after a
  crash cannot double-send an SMS or double-charge a parent.
- **Backoff + a dead letter queue.** A poisoned job must not spin forever.

---

## 6. Files and images

You chose the VM block volume, so bandwidth discipline matters more than usual.

- **Caddy serves files, not Node.** A 30 MB PDF through the Node event loop
  blocks it; Caddy streams from disk with Range support so a dropped mobile
  connection resumes.
- **Never serve an original image.** On upload, generate `thumb` (200px),
  `medium` (800px), `full` (1600px) in WebP. A gallery grid loads thumbs.
  This one change is usually a 10–20x bandwidth reduction.
- **Immutable + versioned paths** (`.../v3/ch01.pdf`) → `Cache-Control: immutable`,
  so a device re-downloads only on a real change.
- **Split textbooks per chapter.** 40 students syncing a 30 MB PDF saturates
  10 Mbps for ~40 minutes. Ten 3 MB chapters download incrementally and resume.

---

## 7. Flutter

- `const` constructors aggressively — they skip rebuilds.
- `ListView.builder` / `SliverList`, never a mapped `Column` for lists.
- `cached_network_image` with explicit `memCacheWidth`.
- **Parse large JSON in an isolate** (`compute`). Decoding a 500 KB sync payload
  on the UI thread is a visible stutter on a 2 GB phone.
- Riverpod `select()` so a widget rebuilds only on the field it reads.
- **Deferred/lazy routes** so the app doesn't build every screen at startup.
- Ship **split-per-ABI APKs** or an App Bundle; a universal APK is ~40% larger.
- Profile with `flutter run --profile` **on a real budget device**, not the
  simulator. The simulator lies about exactly the phones your users own.

---

## 8. Observing it

Cheap and sufficient at this scale:

- `pg_stat_statements` — the single highest-value thing you can enable. Check
  the top 20 by `total_exec_time` weekly.
- `log_min_duration_statement=500` — already set in `docker-compose.yml`.
- Sentry free tier for errors; performance sampling at ~10%.
- Uptime Kuma on the free micro VM.
- A `/metrics` endpoint with queue depth, pool usage, cache hit rate.

**The four numbers to watch weekly:** p99 latency, DB connection pool
saturation, egress bytes/day, SMS spend/day. Everything else is secondary.

---

## 9. The costs that will actually surprise you

| Cost | Why it bites | Mitigation |
|---|---|---|
| **SMS** | 10 schools × 800 students × 8/month ≈ 64,000 SMS ≈ **₹9,600/mo** | Push first. Escalate to SMS only for `high`/`critical` that stay unread past the window. `delivery_attempts.status='suppressed'` is money saved — track it. |
| **Egress** | Books and photo galleries | Cache-immutable, WebP, chapter splitting, Cloudflare |
| **Storage** | Uploaded textbooks | Chapter splits, dedupe by `content_hash`, encourage NCERT links |
| **DB connections** | Each pod holds a pool | `max=12` API, `max=4` worker, against `max_connections=100` |

---

## 10. Pre-merge checklist

- [ ] Query count for the new endpoint is ≤ 4 (log them in dev)
- [ ] Columns named explicitly, no `SELECT *`
- [ ] Index exists for every new `WHERE` / `ORDER BY`
- [ ] Pagination is keyset, not `OFFSET`
- [ ] No `await` inside a loop over rows
- [ ] Slow work is queued, not inline
- [ ] Cache keys include `tenant_id`
- [ ] Payload measured and under budget
- [ ] `EXPLAIN ANALYZE` run on the main query with realistic row counts
