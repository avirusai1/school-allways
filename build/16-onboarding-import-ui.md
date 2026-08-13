# 16 — Onboarding, Import & Academic Setup UI

**Depends on:** `build/02` (import + academic API), `build/05` (onboarding API),
`build/11` (design system), `build/15` (web foundation).

**Status of the APIs: already built.** `modules/onboarding` (8 endpoints),
`modules/import` (3), `modules/academic` (10) all exist and typecheck. This work
order is **frontend only** — it builds the UI that makes them reachable.

---

## Why this is the top priority

A school can sign up on `/signup` today and then reaches **nothing**. There is
no wizard, no import screen, and no way to create classes or sections. The
self-serve go-to-market thesis — schools onboard themselves, no sales call — is
currently unbuilt above the API layer.

Even if you decide to onboard the first 10 pilot schools manually, **the import
UI is still required**, because nobody is typing 800 students by hand, and
import is the thing schools judge you on. Botched migration is the #1 cause of
school ERP failure and the #1 reason a school says no.

**Success metric: a principal goes from signup to first attendance marked in
under 30 minutes, with nobody from your team involved.**

---

## PROMPT

Build the onboarding wizard, import UI and academic setup screens in
`apps/web-admin/`. Read `.cursorrules`, `BUILD_SPEC.md`,
`build/00-reference-implementation.md` and `build/11-design-system.md` first.
Use only `@saw/ui` components and design tokens — no new colours, no new radii.

---

## 1. Files

```
apps/web-admin/src/
├── features/onboarding/
│   ├── OnboardingLayout.tsx          progress rail + step content + footer
│   ├── OnboardingGate.tsx            redirects into the wizard if incomplete
│   ├── useOnboardingState.ts         TanStack Query wrapper on /onboarding/state
│   └── steps/
│       ├── SchoolProfileStep.tsx
│       ├── AcademicSessionStep.tsx
│       ├── ClassesStep.tsx
│       ├── SubjectsStep.tsx
│       ├── ImportStaffStep.tsx
│       ├── ImportStudentsStep.tsx
│       ├── InviteStaffStep.tsx
│       ├── InviteParentsStep.tsx
│       └── FirstAttendanceStep.tsx
├── features/import/
│   ├── ImportWizard.tsx              the 5-phase flow, reused by both imports
│   ├── ColumnMapper.tsx              auto-map + confirm
│   ├── ValidationReport.tsx          row-level errors
│   ├── ImportProgress.tsx            polling + progress bar
│   └── useImport.ts
├── pages/
│   ├── OnboardingPage.tsx
│   ├── academic/ClassesPage.tsx
│   ├── academic/SubjectsPage.tsx
│   ├── academic/SessionsPage.tsx
│   └── ImportPage.tsx                standalone import, post-onboarding
└── router.tsx                        add routes below
```

Routes: `/onboarding`, `/onboarding/:step`, `/setup/classes`,
`/setup/subjects`, `/setup/sessions`, `/imports`, `/imports/:id`.

---

## 2. The wizard shell

`OnboardingGate` wraps the authenticated app: if
`session.tenant.onboardingCompletedAt` is null, redirect to `/onboarding`.
A **"Skip setup for now"** ghost link in the footer sets a local flag and lets
them into the app — never trap a user in a wizard.

**Layout** (desktop ≥ 1024px, two columns; mobile stacks):

```
┌────────────────────┬──────────────────────────────────────────────┐
│ 280px progress rail│ content, max-width 720px, 32px padding       │
│                    │                                              │
│ School All Ways    │ overline  STEP 3 OF 9                        │
│ (wordmark)         │ h1        Add your classes                   │
│                    │ bodySmall Pick a template or add them one    │
│ ✓ School profile   │           by one. You can change this later. │
│ ✓ Academic session │                                              │
│ ● Classes          │ [ step content ]                             │
│ ○ Subjects         │                                              │
│ ○ Import staff     │                                              │
│ ○ Import students  │                                              │
│ ○ Invite staff     │                                              │
│ ○ Invite parents   │                                              │
│ ○ First attendance │                                              │
│                    ├──────────────────────────────────────────────┤
│ ~12 min remaining  │ [Back]              [Skip]  [Continue →]     │
│ Need help?         │                                              │
│ [Request callback] │                                              │
└────────────────────┴──────────────────────────────────────────────┘
```

**Rail states:** `✓` completed = `green/500` · `●` current = `blue/500` filled ·
`○` pending = `grey/300`. Completed steps are **clickable** — the wizard is
re-orderable, not linear.

`estimatedMinutesRemaining` comes from `/onboarding/state`. Showing it reduces
abandonment; a user who knows it's 12 more minutes will finish.

**Every step emits telemetry.** On mount `POST /onboarding/steps/:step`
`{ action: 'started' }`, on advance `{ action: 'completed', durationSeconds }`,
on skip `{ action: 'skipped' }`. This populates `onboarding_events`, which is
the growth loop — if 27% abandon at "import staff", that number tells you what
to build next.

---

## 3. Steps 1–4 (setup)

### SchoolProfileStep
Fields: school name, board (select), affiliation number, UDISE code, address,
city, state, pincode, phone, email, logo upload.
Logo uploads via StorageService and previews immediately.
`board` selection drives the template offered in step 3.

### AcademicSessionStep
Name (prefilled `2026-27`), start date, end date, term structure
(`2 terms | 3 terms | 4 quarters`), and a holiday-import shortcut
("Add national holidays" → prefills `calendar_days`).

### ClassesStep — template first

```
┌──────────────────────────────────────────────────────────┐
│  Start from a template                                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ● CBSE  Nursery to XII · 15 classes                 │  │
│  │ ○ ICSE  Nursery to XII · 15 classes                 │  │
│  │ ○ State board                                       │  │
│  │ ○ Start from scratch                                │  │
│  └────────────────────────────────────────────────────┘  │
│  [ Apply template ]                                      │
└──────────────────────────────────────────────────────────┘

Then an editable table:
  Class      Sections            Capacity
  Nursery    [A] [B] [+]         [30]      [🗑]
  I          [A] [B] [C] [+]     [35]      [🗑]
  [+ Add class]
```

Calls `POST /academic/templates/apply`. Sections are added inline as chips —
this is the screen where a school otherwise types 15 class names, and the whole
30-minute target depends on it being one click.

### SubjectsStep
Same shape: template applies board-standard subjects, then an editable table
with code, name, type (`core | elective | language | co_curricular`),
`isScholastic`, and a class-mapping multi-select.

---

## 4. The import wizard — build this properly

Used by steps 5 and 6 and standalone at `/imports`. **Five phases, one
component**, parameterised by `entity: 'students' | 'staff'`.

### Phase 1 — Upload

```
┌─────────────────────────────────────────────────────────┐
│                    [ ↑ icon 32px ]                      │
│         Drag your file here, or browse                  │
│         .xlsx, .xls or .csv · up to 10 MB               │
│                                                         │
│  ─────────────────── or ───────────────────             │
│                                                         │
│  [ Download our template ]   [ I'm moving from… ▾ ]     │
│                              Entab · Teachmint ·        │
│                              MyClassboard · Excel       │
└─────────────────────────────────────────────────────────┘
```

"I'm moving from…" is a **sales feature disguised as a form control.** It tells
the school you expect them to be switching and have handled it. It sets the
mapper hint on `POST /import/upload`.

### Phase 2 — Column mapping

```
Your file                    →   School All Ways field        Confidence
─────────────────────────────────────────────────────────────────────────
NAME OF STUDENT              →   [First name          ▾]      ● high
FATHER'S NAME                →   [Guardian name       ▾]      ● high
DOB                          →   [Date of birth       ▾]      ● high
CLASS                        →   [Class               ▾]      ● high
MOBILE                       →   [Guardian phone      ▾]      ◐ medium
ADDRESS1                     →   [Address line 1      ▾]      ◐ medium
REMARKS                      →   [Don't import        ▾]      ○ unmapped

Preview of first 3 rows shown beneath, using the current mapping.
[ Back ]                                        [ Validate → ]
```

Confidence dots: `green/500` high, `orange/500` medium, `grey/300` unmapped.
**Required fields not yet mapped block Continue** and are listed by name.
The live 3-row preview is what makes a non-technical user trust the mapping.

### Phase 3 — Validation report

```
┌────────────────────────────────────────────────────────────┐
│  412 rows checked                                          │
│  ✓ 398 ready to import    ✕ 14 need fixing                 │
└────────────────────────────────────────────────────────────┘

Row  Column          Value          What's wrong
──────────────────────────────────────────────────────────────
47   Date of birth   31/02/2015     31 February 2015 is not a
                                    real date. Use DD/MM/YYYY.
103  Admission no    ADM-0087       Already used by Rohan Verma.
118  Class           XIII           No class called "XIII". Your
                                    classes are Nursery to XII.

[ Download error rows as Excel ]   [ Back ]   [ Import 398 rows → ]
```

**Two things make or break this screen:**

1. **Errors are readable by a school clerk.** *"ValidationError: invalid input"*
   is a bug. Render `error.message` from the API verbatim — the backend already
   writes them properly.
2. **"Download error rows as Excel"** gives them just the 14 bad rows with an
   added "What's wrong" column, so they fix and re-upload a small file instead
   of hunting through 412 rows.

Importing the good rows while 14 fail is **allowed and default** — partial
import with a clear count beats all-or-nothing.

### Phase 4 — Progress

Poll `GET /import/:id/status` every 1.5s. Determinate progress bar,
`numericLarge` "247 of 398", elapsed time. Non-blocking: a banner lets them
navigate away and come back.

### Phase 5 — Result + undo

```
┌────────────────────────────────────────────────────────────┐
│  ✓  398 students imported                                  │
│     14 rows skipped · [Download skipped rows]              │
│                                                            │
│  [ View students ]        [ Undo this import ]             │
└────────────────────────────────────────────────────────────┘
```

**The undo button is the feature that sells the product.** Keep it visible for
24 hours on the imports list, not hidden in a menu. A school that knows it can
undo will actually attempt the import — that is the entire psychology of this
screen. Confirm dialog names the batch: *"Remove all 398 students imported on
10 Aug at 3:42 PM?"*

---

## 5. Steps 7–8 (invitations)

### InviteStaffStep / InviteParentsStep

```
┌────────────────────────────────────────────────────────────┐
│  62 staff have a mobile number on file                     │
│  ☑ Send an invitation by WhatsApp and SMS                  │
│                                                            │
│  Preview:                                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Sunrise Public School has invited you to School All  │  │
│  │ Ways. Tap to set up your account: saw.link/j/a4f2    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  [ Send 62 invitations ]        [ Skip — I'll do it later ]│
└────────────────────────────────────────────────────────────┘
```

After sending, show a live-updating accepted count (`12 of 62 have joined`) —
this is what a principal checks the next morning, and it drives them back in.

For parents, offer **section-by-section sending** rather than all-at-once, so a
school can pilot with one class.

**Mention parent self-fill explicitly in the copy:** "Parents will be asked to
complete their child's address, photo and documents." That is what turns the
school's biggest data-entry cost into a distributed task, and they should know
they're getting it.

---

## 6. Step 9 — First attendance (the activation event)

Do not build a new screen. Show a short explainer, then deep-link into the
existing attendance flow with the first section preselected:

```
overline  LAST STEP
h1        Take your first attendance
bodySmall This is the moment your school goes live. Parents of absent
          students will be notified automatically.

[ Class V-A · 32 students ▾ ]

[ Take attendance now → ]     [ I'll do this tomorrow ]
```

On success: a completion screen, `tenants.activatedAt` is set server-side, and
the wizard is marked complete. Then a genuine "you're live" moment — not a
generic toast. This is the one place in the product where a small celebration is
appropriate; keep it to a single check icon and a sentence, no confetti.

---

## 7. Standalone academic setup pages

Post-onboarding, the same editors must be reachable from the sidebar:
`/setup/classes`, `/setup/subjects`, `/setup/sessions`. Reuse the step
components with a `variant="page"` prop — same component, different chrome.
Schools add a section mid-year constantly.

`/setup/sessions` additionally exposes **year rollover** with the mandatory dry
run: show the preview response (`wouldCreate`, `wouldPromote`, `warnings`)
before the commit button enables.

---

## 8. Performance

- Wizard state is one query, cached, invalidated on step completion
- Class/subject editors batch their saves — one request per step, not per row
- Import upload streams; never read a 5 MB workbook into React state
- Validation report virtualises above 100 error rows
- Progress polling stops on terminal status and on tab blur

## 9. Acceptance criteria

- [ ] Signup → wizard → first attendance completes in **under 30 minutes** with
      a realistic 400-student file, timed end to end
- [ ] Wizard is fully resumable after closing the browser mid-step
- [ ] Completed steps are clickable and re-editable
- [ ] "Skip setup for now" reaches the app without completing the wizard
- [ ] CBSE template creates 15 classes + subjects in one click
- [ ] Column auto-mapping correctly maps a real Teachmint export
- [ ] Every one of the six Indian date formats in `build/02` Part D parses
- [ ] Validation lists **every** bad row with a clerk-readable message
- [ ] "Download error rows" returns only the failed rows plus a reason column
- [ ] Partial import (398 of 412) succeeds and reports both numbers
- [ ] Undo restores exact prior state and stays visible for 24h
- [ ] A 5,000-row file does not freeze the browser
- [ ] Every step writes an `onboarding_events` row with a duration
- [ ] `activatedAt` set precisely on first attendance
- [ ] Zero hardcoded colours, sizes or radii — tokens only
- [ ] Loading / empty / error states on every screen per `build/11`

---

## 10. Sequencing suggestion

If you want the pilot moving before the whole wizard is done, build in this
order — each is independently useful:

1. **Import wizard** (§4) at `/imports` — unblocks manual onboarding immediately
2. **Academic setup pages** (§7) — you stop seeding classes by SQL
3. **Wizard shell + steps 1–4** (§2–3) — self-serve becomes real
4. **Invitations + first attendance** (§5–6) — closes the activation loop
