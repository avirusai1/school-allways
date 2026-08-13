# 02 — Academic Structure, Students, Staff, Import Engine

**Depends on:** 01. **Unblocks:** everything else.

---

## PART A — Academic structure (`modules/academic/`)

### Endpoints

```
GET/POST/PATCH  /v1/academic/sessions
GET/POST        /v1/academic/sessions/:id/terms
GET/POST/PATCH  /v1/academic/calendar          holidays, working days
GET/POST/PATCH  /v1/academic/classes
GET/POST/PATCH  /v1/academic/sections
GET/POST/PATCH  /v1/academic/subjects
GET/POST        /v1/academic/class-subjects
GET/POST/PATCH  /v1/academic/periods
GET             /v1/academic/timetable?sectionId=|staffId=
POST            /v1/academic/timetable/generate
POST            /v1/academic/templates/apply      board template, 1 click
POST            /v1/academic/sessions/:id/rollover
```

### Board templates — serves the 30-minute onboarding target

```jsonc
POST /v1/academic/templates/apply
{ "board": "cbse", "branchId": "uuid", "academicSessionId": "uuid",
  "include": ["classes", "subjects", "grading_scale", "terms"],
  "fromClassLevel": -3, "toClassLevel": 12 }
→ 201 { "classesCreated": 15, "subjectsCreated": 22, "termsCreated": 2 }
```
Ship CBSE, ICSE and one state board. A school clicks once instead of typing 15
class names and 22 subjects.

### Year rollover — where competitors lose customers

```jsonc
POST /v1/academic/sessions/:id/rollover?dryRun=true
{ "targetSessionName": "2027-28",
  "promotionRules": { "defaultAction": "promote",
                      "detained": ["studentId1"],
                      "graduatingClassLevel": 12 },
  "carryForward": { "rollNumbers": false, "houses": true,
                    "transport": true, "concessions": true } }
```
```jsonc
// dryRun response — a full preview before anything is written
{ "wouldCreate": { "classes": 15, "sections": 42, "enrollments": 1498 },
  "wouldPromote": 1462, "wouldDetain": 12, "wouldGraduate": 124,
  "warnings": ["8 students have unpaid dues", "3 have no section assigned"] }
```

**Rules:**
- **Never mutates last year's rows.** New session = new rows, linked via
  `promoted_to_enrollment_id`. A school must always see the previous year exactly
  as it was.
- Idempotent — safe to re-run.
- Runs as a BullMQ job with progress; 1,500 students is not a request.
- Dry run is mandatory in the UI before commit.

### Timetable generator

Greedy with backtracking. Constraints: no teacher in two places, no section
double-booked, respect `periodsPerWeek`, respect teacher availability. **Do not
add a solver library.** Report unresolvable clashes rather than silently
dropping periods; every school will hand-edit the output anyway.

**Perf:** `GET /timetable` is opened many times daily by every teacher. One
query with joins, Redis-cached per section for 1 hour, busted on any write.

---

## PART B — Students & guardians (`modules/students/`)

`build/00-reference-implementation.md` **is** this module's list/detail/create
implementation. Follow it exactly. Additional endpoints:

```
GET   /v1/students/:id/timeline        attendance + marks + fees + incidents
POST  /v1/students/:id/guardians
PATCH /v1/students/:id/guardians/:gid  capability toggles
GET   /v1/students/:id/documents
POST  /v1/students/:id/documents
POST  /v1/students/:id/transfer        TC issuance
GET   /v1/apaar/worklist?status=
POST  /v1/apaar/bulk-consent           generate consent PDFs (queued)
PATCH /v1/apaar/:studentId             record status transition
```

### Aadhaar — the rule

Store `aadhaarLast4` and a **salted hash** only. Never the full number, never in
a log, never in an audit diff, never in a response. The full number stays on the
school's paper consent form. Storing it creates Aadhaar Act + DPDP exposure we
deliberately refuse.

### APAAR workflow

```
not_started → consent_pending → consent_received → submitted → generated
                                       ↘ mismatch (worklist) ↗
```
Mandatory for Class 1–12 in AY 2026-27 and required for CBSE Class 9/11
registration and Class 10/12 LOC. `GET /apaar/worklist` returns counts by status
plus the mismatch queue — this is the compliance centre's main screen.

### Guardian capability toggles

`PATCH /students/:id/guardians/:gid` writes `canPayFees`, `canApproveLeave`,
`canPickup`, `canViewAcademics`, `canMessageTeachers`.
**Only the primary guardian may change these** (your decision #4: secondary
payment defaults ON but is toggleable by the primary).

---

## PART C — Staff (`modules/staff/`)

```
GET/POST/PATCH /v1/staff
GET/POST       /v1/staff/:id/qualifications
GET/POST       /v1/staff/:id/documents
POST           /v1/staff/:id/assignments/sections    class teacher
POST           /v1/staff/:id/assignments/subjects    subject + section
DELETE         /v1/staff/:id/assignments/:aid
GET            /v1/staff/:id/workload
POST           /v1/staff/:id/roles                   RBAC role assignment
DELETE         /v1/staff/:id/roles/:rid
```

**The assignment tables ARE the RBAC data scope.** `staff_section_assignments`
and `staff_subject_assignments` are what the permission resolver reads to turn
`scope='section'` into concrete section ids. Get them wrong and either teachers
cannot see their own classes, or they can see everyone's.

**After ANY assignment or role change, call
`PermissionResolverService.invalidate(tenantId, userId)`** in the same commit
path. Forgetting is how a revoked teacher keeps access for five minutes.

**Teacher privacy is a headline promise.** `staff.personalPhone` must never
appear in any DTO reachable by a parent. Add an explicit test.

---

## PART D — Import engine (`modules/import/`)

> **The highest-commercial-value component in the MVP.** Botched migration is
> the #1 cause of school ERP failure and the #1 reason a school says no. Build
> it like the business depends on it.

### Flow — every step required

```
GET  /v1/import/template?entity=students        styled XLSX, examples, dropdowns
POST /v1/import/upload                          → { importId, detectedColumns[] }
POST /v1/import/:id/map                         auto-map + user confirmation
POST /v1/import/:id/validate                    DRY RUN, row-level errors
POST /v1/import/:id/commit                      queued, chunked, progress
GET  /v1/import/:id/status                      progress polling
POST /v1/import/:id/undo                        ONE-CLICK FULL ROLLBACK
```

### Auto-mapping

Fuzzy header matching. `"Student Name"`, `"student_name"`, `"NAME OF STUDENT"`,
`"नाम"` → `firstName`. Return the mapping with a confidence score for
confirmation; never silently guess and commit.

### Validation response — readable by a school clerk

```jsonc
{
  "totalRows": 412, "validRows": 398, "errorRows": 14,
  "errors": [
    { "row": 47, "column": "dateOfBirth", "value": "31/02/2015",
      "message": "31 February 2015 is not a real date. Use DD/MM/YYYY." },
    { "row": 103, "column": "admissionNo", "value": "ADM-0087",
      "message": "Admission number ADM-0087 is already used by Rohan Verma." }
  ],
  "warnings": [ { "row": 12, "message": "No section given — will be unassigned." } ]
}
```
*"ValidationError: invalid input"* is a bug. A school admin must be able to fix
the file without calling you.

### Undo — the feature that sells the product

Every inserted row carries `import_batch_id`. `POST /undo` deletes the batch and
restores the prior state exactly. **A school that knows it can undo will
actually attempt the import.** Test this hard.

### Vendor mappers

`generic` · `entab` · `teachmint` · `myclassboard`. Auto-detect from the header
signature.

### Indian data realities — each of these WILL appear

| Input | Handling |
|---|---|
| `31/12/2015`, `31-12-15`, Excel serial `42369` | All parse to a date |
| `SHARMA, AARAV` / `AARAV S/O RAJESH` | Split, strip prefixes, title-case |
| `+91 98765 43210`, `098765 43210` | Normalise to `919876543210` |
| Title row above the real header, merged cells | Detect the header row |
| Class as `V`, `5`, `5th`, `Class V`, `FIFTH` | Normalise to level 5 |
| Duplicate admission numbers in one file | Reported, never silently overwritten |
| Blank rows in the middle | Skipped, counted |

### Performance

Stream the parse (`exceljs` streaming reader) — do not load a 5,000-row workbook
into memory on a 2 GB container. Insert in chunks of 500. Target: 1,000 students
in under 60 seconds.

---

## Acceptance criteria

- [ ] Rollover dry-run previews exactly; committed rollover leaves last year byte-identical
- [ ] Rollover run twice produces no duplicates
- [ ] CBSE template creates classes Nursery–XII with correct `level` ordering
- [ ] Undo restores exact prior state
- [ ] Validation reports every bad row, not just the first
- [ ] All six date formats parse
- [ ] 5,000-row file imports without OOM
- [ ] Assigning a section immediately changes what the teacher can query
- [ ] `personalPhone` never in a parent-reachable response
- [ ] Full Aadhaar never stored, logged or returned
- [ ] A parent cannot fetch another family's student (explicit test)
