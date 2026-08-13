# 03 — Attendance

**Depends on:** 01, 02. **The most-used screen in the entire product.**

**The bar: a class teacher marks 40 students in under 20 seconds, offline, on a
₹9,000 Android.** A teacher currently loses 15–20 minutes a day to paper
attendance. Winning this screen is the free tier's whole value proposition, and
every decision below serves that number.

---

## PROMPT

Build `apps/api/src/modules/attendance/` per the contracts below, plus the
Flutter screen in `build/14-admin-app.md` §4.

---

## 1. Files

```
modules/attendance/
├── attendance.module.ts
├── attendance.controller.ts
├── attendance.service.ts
├── attendance.repository.ts
├── dto/
│   ├── mark-attendance.dto.ts
│   ├── list-registers.query.ts
│   ├── attendance-report.query.ts
│   └── attendance.response.ts
├── processors/
│   ├── absentee-alert.processor.ts
│   └── attendance-summary.processor.ts
└── attendance.service.spec.ts
```

---

## 2. Endpoints

### `GET /v1/attendance/roster` — what the marking screen loads

```
?sectionId=uuid&day=2026-08-10&periodId=uuid   (periodId optional)
```

```jsonc
{
  "register": {
    "id": "uuid|null",              // null = not yet marked
    "sectionId": "uuid",
    "sectionLabel": "5-A",
    "day": "2026-08-10",
    "periodId": null,
    "mode": "daily",
    "isLocked": false,
    "markedAt": null,
    "markedByName": null
  },
  "students": [
    { "studentId": "uuid", "rollNo": "01", "fullName": "Aarav Sharma",
      "photoUrl": "https://...", "status": "not_marked",
      "onApprovedLeave": false, "remarks": null }
  ],
  "meta": { "total": 40, "isHoliday": false, "holidayTitle": null }
}
```

**One call gives the client everything the screen needs.** Do not make it fetch
students, then a register, then existing marks.

If a register already exists, `students[].status` is populated from it so the
teacher can amend.

`onApprovedLeave: true` when an approved `leave_request` covers this day — the
UI pre-selects `on_leave` and shows a small badge.

**Performance:** exactly **2 queries** — one for the register + entries, one for
the roster with leave joined. Response for 40 students < 12 KB.

### `POST /v1/attendance/registers` — create + mark in ONE call

```jsonc
{
  "sectionId": "uuid",
  "academicSessionId": "uuid",
  "day": "2026-08-10",
  "periodId": null,
  "subjectId": null,
  "mode": "daily",
  "entries": [
    { "studentId": "uuid", "status": "present" },
    { "studentId": "uuid", "status": "absent" },
    { "studentId": "uuid", "status": "late", "inTime": "08:25" },
    { "studentId": "uuid", "status": "on_leave", "leaveRequestId": "uuid" }
  ]
}
```
Header: `X-Client-Mutation-Id: <uuid>` — **required**.

```jsonc
// 201
{ "registerId": "uuid", "day": "2026-08-10", "sectionLabel": "5-A",
  "presentCount": 36, "absentCount": 3, "lateCount": 1, "totalCount": 40,
  "markedAt": "2026-08-10T02:45:00.000Z",
  "alertsQueued": 3 }
```

**Do not require the client to create a register then post 40 rows.** That is
41 round trips in a school corridor on 3G.

**Store every student, not just absentees.** Storing only exceptions saves rows
and makes "was this marked, or just not marked?" ambiguous — and that ambiguity
is a child-safety problem when a parent asks where their child is.

Errors:
- `409 ALREADY_MARKED` if a register exists and `isLocked` — use PATCH
- `403 SCOPE_VIOLATION` if the section isn't in the caller's scope
- `422 BUSINESS_RULE` if the day is a holiday and `force` isn't set
- `409 SESSION_LOCKED` if the academic session is locked

### `PATCH /v1/attendance/registers/:id` — amend (audited)

Requires `attendance.student.amend` (branch scope — a class teacher cannot
silently rewrite a locked register).

```jsonc
{ "entries": [ { "studentId": "uuid", "status": "present",
                 "remarks": "Arrived late, misrecorded" } ],
  "reason": "Corrected after checking the gate log" }
```

`reason` is **required**, minimum 10 characters. Writes an `audit_logs` row with
before/after for every changed entry. Attendance is a legal record.

### `GET /v1/attendance/pending?day=&branchId=`

The principal's #1 dashboard widget: which classes haven't marked yet.

```jsonc
{ "data": [ { "sectionId": "uuid", "sectionLabel": "5-A",
              "classTeacherName": "Priya Menon", "periodLabel": null,
              "expectedBy": "09:00", "minutesOverdue": 42 } ],
  "meta": { "marked": 24, "pending": 6, "total": 30 } }
```

Uses `att_register_unmarked_idx (branch_id, day, marked_at)`. **One query.**

### `GET /v1/attendance/summary?studentId=&academicSessionId=&termId=`

```jsonc
{ "workingDays": 142, "presentDays": 131, "absentDays": 8, "lateDays": 3,
  "leaveDays": 0, "percentageBp": 9225,
  "monthly": [ { "month": "2026-04", "workingDays": 22, "presentDays": 21,
                 "percentageBp": 9545 } ] }
```

**Reads `attendance_summaries`, a pre-aggregated table.** Never COUNT over a
year of rows to render a parent's home screen.

### `GET /v1/attendance/report?sectionId=&from=&to=&format=json|xlsx`

Matrix report: students × days. `xlsx` returns `202` + a job id (queued).

### `GET /v1/attendance/student/:id/calendar?month=2026-08`

Per-day statuses for the parent app's calendar view. < 3 KB.

---

## 3. Service logic

### Marking

```
1. assertInScope(grant, { sectionId })
2. Verify the academic session is not locked
3. Verify the day is a working day (calendar_days) unless force=true
4. Verify every studentId belongs to that section in that session
   -> a mismatched id is 422, never a silent skip
5. In ONE transaction:
     a. upsert attendance_registers  (unique: sectionId, day, periodId)
     b. bulk insert/upsert student_attendance  -- ONE statement for all 40
     c. update the register's denormalised counts
6. AFTER commit: enqueue absentee alerts. Never inside the transaction —
   holding a connection open for the notification provider's latency will
   exhaust the pool.
```

### Absentee alerts (`absentee-alert.processor.ts`)

- Fires for `status IN ('absent','late')` where `parentNotifiedAt IS NULL`
- **Debounce to one message per child per day** even when attendance is taken
  per period. A parent receiving eight absence texts because their child missed
  eight periods will uninstall the app.
- Priority `high` → escalates to SMS if unread after the window
- Respects quiet hours
- Sets `parentNotifiedAt`
- Template `STUDENT_ABSENT`: *"Aarav was marked absent today (10 Aug). If this
  is incorrect, please contact the school office."*

### Summary rollup (`attendance-summary.processor.ts`)

Nightly 02:00 IST. Recomputes `attendance_summaries` per student per session and
per term. Idempotent. Chunk 500 students per transaction.

---

## 4. Performance requirements

| Operation | Requirement |
|---|---|
| Load roster (40) | 2 queries, < 12 KB, < 150 ms |
| Mark 40 students | **2 SQL statements**, < 400 ms |
| Pending registers | 1 query, < 100 ms |
| Parent summary | 1 indexed row read |
| Month calendar | 1 query, < 3 KB |

**A loop of 40 inserts is a rejected PR.** Use the chunked bulk pattern from
`build/00` §9.

---

## 5. Offline behaviour (client contract)

- Roster is cached in Drift; the screen opens instantly from cache
- Marking writes locally, queues in the outbox, shows `pending sync`
- Replays with `X-Client-Mutation-Id`; the unique index is the final backstop
- **Conflict: FIRST-write-wins.** If a teacher marked offline and an admin
  marked on web, keep the teacher's and surface the discrepancy. Silently
  overwriting an attendance register is a safety problem, not a data problem.

---

## 6. Acceptance criteria

- [ ] Marking 40 students issues exactly 2 SQL statements
- [ ] The same `X-Client-Mutation-Id` twice creates one register
- [ ] A subject teacher can only mark sections they teach
- [ ] A class teacher cannot mark another section (403 `SCOPE_VIOLATION`)
- [ ] Parents notified once per child per day, never per period
- [ ] Amending a locked register requires a reason and writes before/after audit
- [ ] Roster returns `onApprovedLeave` correctly
- [ ] Marking on a holiday without `force` returns 422
- [ ] Works fully offline and reconciles on reconnect
- [ ] Summary reads the rollup table, never a live COUNT
