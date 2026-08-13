# School All Ways — Click-to-Sync Architecture

**Version:** 0.1
**Date:** 6 Aug 2026

> Your instinct: *"once a student opens a book it is stored locally and opened from there; if anything changed they press Sync — I think we can implement this click-to-sync in more features where fetching data from the server is draining the server capacity."*
>
> That instinct is correct, and this document generalises it into a protocol used across the whole product. On a 2 OCPU / 12 GB box behind a 10 Mbps load balancer, **the difference between pull-on-open and pull-on-demand is roughly an order of magnitude in server load.**

---

## 1. The problem, quantified

A naive app refetches on every screen open. For 10 schools × 800 students × 2 parents, with each parent opening the app 3× a day and each open hitting 6 endpoints:

```
10 × 800 × 2 × 3 × 6  ≈  288,000 requests/day  ≈  3.3 req/sec average
                                                  ~40 req/sec at the 8 AM peak
```

That is survivable. But add teachers, dashboards, bus tracking and a 30 MB textbook, and the 10 Mbps link — not the CPU — becomes the wall. **Bandwidth is your scarcest free-tier resource, so the architecture optimises bytes, not requests.**

---

## 2. Three tiers of data freshness

Not everything can be manual-sync. Forcing a parent to tap Sync to learn their child's bus is late would be a bad product. So data is classified into three tiers, and the tier decides the transport.

| Tier | Behaviour | Examples | Transport |
|---|---|---|---|
| **A — Live** | Server pushes, client never polls | Bus location during a trip, SOS, emergency broadcast, absentee alert | WebSocket / FCM push |
| **B — Nudged** | Cached locally. Server sends a silent "you're stale" push; UI shows a badge; **user taps Sync** | Homework, notices, marks, attendance, fee dues, timetable | Delta sync on demand |
| **C — Pinned** | Downloaded once, opened from disk forever, re-fetched only on explicit Sync | **Digital books (B31)**, report card PDFs, receipts, study material | Signed URL + version check |

**Default is Tier B.** A new feature must justify being Tier A.

---

## 3. The delta-sync protocol (Tier B)

### 3.1 The cursor

Every syncable table carries `row_version BIGINT`, populated from **one global sequence** (`global_row_version`) by trigger — not a per-table sequence. One monotonic clock across the entire database means the client keeps **one cursor**, not one per entity, and ordering across entities is unambiguous.

```sql
-- db/sql/001_extensions_and_sync.sql
CREATE SEQUENCE global_row_version START 1;

CREATE FUNCTION app_bump_row_version() RETURNS trigger AS $$
BEGIN
  NEW.row_version := nextval('global_row_version');
  NEW.updated_at  := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;
```

Paired index on every syncable table: `(tenant_id, row_version)`. Without it, every sync is a sequential scan and the box falls over at roughly 15 schools.

### 3.2 The check — cheap by design

```http
GET /sync/status?cursor=88412
```
```json
{ "cursor": 88412, "serverCursor": 88907, "pending": { "homework": 3, "announcements": 1, "marks": 12 }, "hasChanges": true }
```

**~200 bytes.** This is the only thing the app calls on cold start. It renders the "16 updates — tap to sync" badge. It does **not** transfer data.

### 3.3 The pull — user-initiated

```http
GET /sync/pull?cursor=88412&entities=homework,announcements,marks&limit=500
```
```json
{
  "changes": { "homework": [ ... ], "announcements": [ ... ] },
  "tombstones": [ { "entityType": "homework", "entityId": "..." } ],
  "nextCursor": 88907,
  "hasMore": false
}
```

Rules that keep this fast:

- Server caps `limit`; the client pages until `hasMore` is false.
- **Tombstones come from `sync_tombstones`**, because a deleted row cannot be delta-synced — it's gone. Tombstones are purged after 90 days; a device offline longer does a full resync.
- The server records the confirmed cursor in `sync_cursors` per (user, device, entity). We never trust the client's claim about what it holds — that's what powers the *targeted* nudge.

### 3.4 The push back — offline mutations

Attendance and marks entry must work with no network. The client keeps an outbox in Drift (SQLite) and replays it:

```http
POST /attendance/registers
X-Client-Mutation-Id: 9f2c...   (UUID generated on-device)
```

Every mutating table has a `client_mutation_id` column with a **unique index**, and `idempotency_keys` stores the original response. Retry the same mutation ten times on a flaky 2G connection and it applies exactly once — the tenth call returns the first call's response.

**Conflict rule: last-write-wins, except attendance and marks, which are first-write-wins with a conflict flag.** If a teacher marks attendance offline and an admin also marks it on the web, we keep the teacher's version and surface the discrepancy rather than silently overwriting. Silent overwrites in an attendance register are a child-safety problem, not a data problem.

---

## 4. The book protocol (Tier C) — your design, in detail

```
                                                 ┌──────────────────────┐
  1. Student taps a book                         │  book_files          │
     GET /books/{id}/files                       │   version:      3    │
     -> [{ id, version: 3, contentHash, size }]  │   content_hash: a1b2 │
                                                 │   file_path:  .../v3 │
  2. Client compares against local record        └──────────────────────┘
     local.version == 3 ?  -> open from disk. ZERO bytes over the network.
     local.version <  3 ?  -> show "Update available", wait for the tap.

  3. On Sync tap:
     GET /books/files/{id}/download    -> 302 to a signed, 15-min URL on
                                          files.school.techallways.com
     Caddy streams it with Range support -> a dropped connection RESUMES
                                            instead of restarting.

  4. Client verifies SHA-256 == contentHash, writes to app storage,
     POSTs the new state -> student_book_downloads.downloaded_version = 3
```

Three things this buys:

1. **Reopening a book costs nothing.** The most common action in the module is free.
2. **Caddy serves the bytes, not Node.** A 30 MB PDF never occupies the event loop.
3. **Targeted nudges.** `student_book_downloads.needs_sync` is flagged by the re-upload job, so when a teacher replaces chapter 4 we push to the 3 students holding v2 — not all 40. The index `sbd_needs_sync_idx` makes that an index lookup.

**Split large textbooks per chapter.** A 30 MB single PDF on a 10 Mbps link with 40 students syncing at once is 40 minutes of saturated pipe. Ten 3 MB chapters download incrementally and resume cleanly. Enforce this in the upload UI.

---

## 5. What each app caches locally

| App | Local store | Pinned (survives cache clear) | Nudged |
|---|---|---|---|
| **School All Ways** (family) | Drift/SQLite + app files dir | Books, report cards, receipts, ID card | Attendance, homework, notices, fees, timetable, gallery thumbs |
| **School All Ways Admin** | Drift/SQLite | Class rosters + student photos (offline attendance needs them) | Timetable, marks sheets, circulars, approvals |

**Deliberately never cached:** counselling notes, incident records, health records, anything at `restricted` sensitivity. These are fetched live, audited on every read, and never written to device storage. A lost phone must not be a data breach.

---

## 6. Server-side caching, in priority order

1. **Postgres `shared_buffers` (1 GB)** — the cheapest cache. Correct indexes beat any application cache.
2. **Redis** — session lookups, permission resolution (expensive: unions across role assignments; cache for 5 min, bust on assignment change), live bus positions, rate limits.
3. **HTTP `ETag` / `If-None-Match`** on list endpoints — a 304 is ~100 bytes.
4. **Cloudflare** in front of everything — free tier, absorbs static and cached responses before they reach the 10 Mbps link.

Explicitly **not** doing: a separate application-level object cache. It is another thing to invalidate wrongly, and Postgres plus Redis covers this workload to well past 100 schools.

---

## 7. Sync budget — the numbers to hold yourself to

| Action | Target payload | Target latency |
|---|---|---|
| `/sync/status` | < 500 B | < 100 ms |
| `/sync/pull` (typical day) | < 50 KB | < 800 ms |
| App cold start, no changes | **0 bytes beyond status** | < 200 ms |
| Attendance submit (40 students) | < 4 KB | < 500 ms |
| Book chapter download | 2–5 MB | resumable |

Put these in the integration tests. A regression here shows up as a cloud bill, not as a failing test, so measure it deliberately.

---

## 8. Implementation checklist

- [ ] `sync` module in the API: `GET /sync/status`, `GET /sync/pull`, idempotency middleware
- [ ] `core_sync` Flutter package: cursor store, outbox queue, conflict policy, retry with backoff
- [ ] Silent FCM data-message on tenant writes → sets the client's "stale" badge
- [ ] `student_book_downloads` maintenance job → flags `needs_sync` on re-upload
- [ ] Signed-URL issuer + Caddy `forward_auth` verification endpoint
- [ ] Nightly `sync_tombstones` purge (90 days) and `idempotency_keys` purge (24 h)
- [ ] Integration test asserting the payload budgets in §7
