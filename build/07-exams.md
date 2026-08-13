# 07 — Exams, Marks, Report Cards, HPC

**Depends on:** 02. **Two assessment worlds coexist and you must carry both.**

- **Traditional marks** — exams, grading scales, weightages, moderation, results
- **Holistic Progress Card (NEP 2020 / CBSE)** — observations, portfolios,
  self/peer/parent assessment against qualitative indicators

Do not force HPC into the marks table's shape. `hpc_domains → hpc_indicators →
hpc_assessments` is a different structure on purpose; `assessorType` is what
makes it an HPC rather than a marks grid.

---

## 1. Exams & timetable

```
GET/POST/PATCH /v1/exams
POST /v1/exams/:id/schedules              exam timetable
POST /v1/exams/:id/publish-timetable      students see the schedule
POST /v1/exams/:id/publish-results        parents see marks
```

**Two independent publish gates.** `isTimetablePublished` lets students see the
schedule weeks before results exist. `isPublished` gates marks from parents.
Never conflate them.

```jsonc
POST /v1/exams/:id/schedules
{ "schedules": [
  { "classId": "uuid", "subjectId": "uuid", "examDate": "2026-09-12",
    "startTime": "09:00", "endTime": "12:00", "maxMarks": 80,
    "theoryMaxMarks": 60, "practicalMaxMarks": 20, "passMarks": 26,
    "roomNo": "Hall A", "invigilatorStaffId": "uuid",
    "syllabusNote": "Chapters 1-6" } ] }
```

## 2. Marks entry — the second hot path after attendance

```
GET  /v1/exams/:id/marks-sheets?sectionId=       coordinator's status view
GET  /v1/exams/:id/marks-sheet?sectionId=&subjectId=   the entry grid
POST /v1/exams/:id/marks                         whole sheet, ONE call
POST /v1/exams/:id/marks/:sheetId/submit         lock for moderation
POST /v1/exams/:id/marks/:sheetId/moderate
```

```jsonc
POST /v1/exams/:id/marks
X-Client-Mutation-Id: uuid
{ "marksSheetId": "uuid",
  "entries": [
    { "studentId": "uuid", "theoryMarks": 52, "practicalMarks": 18 },
    { "studentId": "uuid", "isAbsent": true },
    { "studentId": "uuid", "isExempted": true, "remarks": "Medical" }
  ] }
```

- Whole sheet in one request, offline-capable, idempotent
- Validate `marks <= maxMarks` server-side and return the offending row
- `marks_sheets.status` drives the coordinator's **"who hasn't entered marks
  yet"** view — a real daily pain worth solving well
- **Moderation never overwrites the teacher's entry.** Write to `originalMarks`
  and keep both. A teacher must always be able to see what they submitted.

## 3. Results

```
POST /v1/exams/:id/process-results       queued
GET  /v1/results?studentId=&sessionId=
```

Computation: weighted totals per `weightageBp`, grade from the scale band,
percentage in basis points, pass/fail/compartment status, and rank.

**Rank uses a window function computed once at publish and stored.** Computing
rank on read for 900 students on every parent app open is an outage.

## 4. Report cards

```
GET/POST /v1/report-cards/templates
POST     /v1/report-cards/generate       { examId, sectionIds[] } → 202 jobId
GET      /v1/report-cards/:studentId/:examId    → signed PDF URL
```

Template-driven. Rendered headless to A4, stored via StorageService, parents
notified on publish.

**Chunk it: 50 students per job, parallelism 2.** 900 PDFs in one job will OOM a
2 GB container.

## 5. HPC

```
GET/POST /v1/hpc/domains
GET/POST /v1/hpc/indicators
POST     /v1/hpc/assessments
GET      /v1/hpc/student/:id?termId=
```

```jsonc
POST /v1/hpc/assessments
{ "studentId": "uuid", "indicatorId": "uuid", "termId": "uuid",
  "assessorType": "teacher",              // teacher | self | peer | parent
  "level": "proficient",
  "observationNote": "Explains reasoning clearly in group work.",
  "evidencePaths": ["t/.../project.jpg"],
  "observedOn": "2026-08-05" }
```

The same indicator carries up to four assessments from four assessor types.
Diary entries flagged `feedsHpc` surface as suggested observations, so a teacher
isn't re-typing what they already wrote.

Ship the CBSE HPC domain/indicator set as a seedable template — schools will not
author 60 indicators by hand.

---

## Performance

| Operation | Requirement |
|---|---|
| Student mark history | 1 query on `marks_student_subject_idx` |
| Class result computation | single aggregate query, no per-student loop |
| Marks sheet load (40×3) | 1 query, < 15 KB |
| Rank | window function at publish, stored |

## Acceptance criteria

- [ ] Marks entry works offline and replays idempotently
- [ ] Moderation preserves `originalMarks`
- [ ] Parents cannot see marks before `isPublished` (explicit test)
- [ ] Timetable publishes independently of results
- [ ] 900 report cards generate without OOM
- [ ] A subject teacher can only enter marks for their subject AND section
- [ ] Marks above `maxMarks` are rejected with the offending row named
- [ ] HPC records teacher, self, peer and parent assessments on one indicator
