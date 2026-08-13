# 08 — Digital Book Library & Sync Engine

**Depends on:** 01, 02. **Read `docs/04-sync-architecture.md` first — it is the spec.**

---

## PART A — Sync engine (`modules/sync/`)

### Endpoints

```
GET  /v1/sync/status?cursor=88412
GET  /v1/sync/pull?cursor=88412&entities=homework,announcements&limit=500
POST /v1/sync/ack                { cursor, entities[] }
```

**`/sync/status`** — the ONLY call on app cold start.
```jsonc
{ "cursor": 88412, "serverCursor": 88907, "hasChanges": true,
  "pending": { "homework": 3, "announcements": 1, "marks": 12 } }
```
**Budget: < 500 bytes, < 100 ms.** It renders the "16 updates — tap to sync"
badge and transfers no data. One `count(*) WHERE tenant_id = ? AND row_version >
?` per entity, cheap because of the `(tenant_id, row_version)` index.

**`/sync/pull`**
```jsonc
{ "changes": { "homework": [ /* full DTOs */ ] },
  "tombstones": [ { "entityType": "homework", "entityId": "uuid" } ],
  "nextCursor": 88907, "hasMore": false }
```

**Rules:**
- Server caps `limit` at 500 regardless of the request
- **Scope every entity.** A sync pull is a list endpoint — apply `scopeFilter()`
  per entity. *This is the single most likely place in the whole product to leak
  data, because it's easy to think of sync as "infrastructure" rather than "a
  query".* A class teacher syncing must not receive another section's rows.
- Tombstones come from `sync_tombstones`
- Record the confirmed cursor in `sync_cursors` per (user, device, entity) —
  never trust the client's claim; this is what powers targeted nudges

### Conflict policy

Last-write-wins, **except attendance and marks which are first-write-wins with a
conflict flag**. If a teacher marked offline and an admin marked on web, keep
the teacher's and surface the discrepancy. Silently overwriting an attendance
register is a child-safety problem, not a data problem.

---

## PART B — Book library (`modules/books/`)

**Your design, encoded:** school uploads → student opens → stored locally →
opened from disk forever → explicit Sync fetches a new version only if one
exists.

### Endpoints

```
GET  /v1/books?classId=&subjectId=              the shelf
GET  /v1/books/:id/files                        ← THE sync check
GET  /v1/books/files/:id/download               302 → signed URL
POST /v1/books/files/:id/downloaded             record local state
GET  /v1/books/sync-status                      which local copies are stale
POST /v1/books                                  upload (staff)
POST /v1/books/:id/files                        add/replace a version
POST /v1/books/:id/publish
```

### The optimisation

```jsonc
GET /v1/books/:id/files
{ "files": [
  { "id": "uuid", "partLabel": "Chapter 1", "partSequence": 1,
    "version": 3, "contentHash": "a1b2c3...", "byteSize": 3145728,
    "pageCount": 24 } ] }
```

**A few hundred bytes.** The client compares versions against its local record
and, if they match, opens from disk with **zero bytes transferred**. Reopening a
book must cost nothing.

### Download

`GET /books/files/:id/download` returns `302` to a 15-minute signed URL on
`files.school.techallways.com`. **Caddy serves the bytes, not Node** — a 30 MB
PDF through the event loop blocks it, and Caddy supports Range so a dropped
mobile connection resumes rather than restarting.

Client verifies SHA-256 against `contentHash` before marking the download
complete.

### Chapter splitting — enforce it in the upload UI

40 students syncing one 30 MB PDF saturates a 10 Mbps link for ~40 minutes. Ten
3 MB chapters download incrementally and resume cleanly. Warn above 10 MB and
offer to split.

### Targeted nudges

When a teacher replaces chapter 4, a job flags
`student_book_downloads.needs_sync` for holders of the old version and notifies
**only them** — not all 40. `sbd_needs_sync_idx` exists for exactly this.

### Audience

`book_audiences` maps a book to classes/sections for a session, with an optional
availability window (a question bank released only before exams). **A book with
no mapping is visible to nobody.**

### Copyright

Upload requires accepting a terms-of-use declaration
(`copyrightAcceptedByUserId/At`) and a takedown path exists. Also support
`source = 'external_link'` for NCERT / state-board PDFs — legally distributable
and zero storage. Surface that option prominently in the upload UI; it keeps
most schools inside the free storage tier.

---

## Acceptance criteria

- [ ] Cold start with no changes transfers **0 bytes** beyond `/sync/status`
- [ ] `/sync/status` < 500 bytes for a typical teacher
- [ ] Sync pull respects scope — test that teacher A cannot receive teacher B's rows
- [ ] Same mutation id posted 10× applies once
- [ ] Deleting a row produces a tombstone the client receives
- [ ] Reopening an unchanged book transfers 0 bytes
- [ ] Download resumes after an interrupted connection (Range works)
- [ ] A new version notifies only holders of the old one
- [ ] A student sees only books mapped to their class/section
- [ ] Upload without copyright acceptance is rejected
