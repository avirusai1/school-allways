# 14 — School All Ways Admin (Staff App)

`apps/mobile-admin/` · `com.schoolallways.admin` · All 26 staff roles, one binary.

**Read `build/11-design-system.md` and `build/12-flutter-foundation.md` first.**
Density: **Compact** (44px rows) on all data-entry screens, **Comfortable** on
dashboards and detail views.

> **This app is five apps in a trench coat.** A guard needs 4 screens, a driver
> 3, a school admin ~25. That is solved entirely by the server-driven
> `navManifest` — never by build flavours, never by `if (role == ...)` in a
> widget.

---

## 1. Login · same as family app

Identical component, different wordmark colour treatment. Staff additionally get
an "Sign in with email" ghost link below the OTP button.

## 2. Role home router

After session load, `go` to `session.homeScreen`. Bottom nav = first 4 entries
of `navManifest` + "More" sheet for the rest. **No role branching in code** —
the registry lookup in `build/12` §5 does all of it.

---

## 3. Teacher home · `teacher_home`

```
App bar: [School logo] "Priya Menon" ▾            [🔔] [⚙]
         ▾ opens the role switcher when the user holds multiple roles

Body (16px padding, 12px gaps):

1. TODAY'S CLASSES               (Card)
   overline  MONDAY, 10 AUGUST
   Rows, 44px, one per period:
     [08:00] Maths · 5-A · Room 12      [✓ marked]  or  [Mark →]
     [08:45] Maths · 6-B · Room 12      [Mark →]
   The next period gets a blue/50 background + 3px blue/500 left border.

2. NEEDS YOUR ATTENTION          (only when non-empty)
   "Attendance not marked for 6-B (2 periods ago)"     → take_attendance
   "Marks pending: Unit Test 1, Maths 5-A (due 12 Aug)" → marks_entry
   "3 unread parent messages"                           → messages

3. QUICK ACTIONS                 3-up grid of 72px tiles, icon + label
   [Take attendance] [Post homework] [Write diary]
```

## 4. Take attendance · `take_attendance` — **the most important screen**

**Target: 40 students marked in under 20 seconds.** Time it on a real device.

```
App bar: ← "5-A · Attendance"                    [10 Aug ▾] [⋮]

Sticky summary bar (48px, grey/50, 1px bottom border):
  ● 36 Present   ● 3 Absent   ● 1 Late          [Mark all present]

Student list — Compact, 44px rows, NO cards, NO gaps:
┌──────────────────────────────────────────────────────────┐
│ 01  Aarav Sharma                        [P] [A] [L]      │
│ 02  Ananya Gupta                        [P] [A] [L]      │
│ 03  Arjun Reddy            🛈 On leave   [P] [A] [L]      │
└──────────────────────────────────────────────────────────┘
  roll  name (bodyMedium)   badge        segmented, 3×36px

Bottom bar (safe-area, grey/0, 1px top border, 12px padding):
  [ Submit attendance ]   Primary, full width, shows "40 of 40 marked"
```

**Interaction rules — these are the 20 seconds:**

- **Everyone defaults to Present.** Most days most children are present;
  optimise for the common case. The teacher taps only exceptions.
- Segmented P/A/L control, 36px tall each, minimum 48px touch target via
  padding. Selected = filled semantic colour, white letter.
- **No scrolling to submit** — the bottom bar is fixed.
- Long-press a row → bottom sheet for in-time and remarks (rare path).
- `Mark all present` is one tap and is the default state anyway; it exists for
  re-marking after a correction.
- Haptic tick on each selection (`HapticFeedback.selectionClick()`).
- Row background flashes the semantic `/50` colour for 160ms on change.

**Offline:** submit writes to Drift + outbox instantly, the bottom bar becomes
"Saved · will sync" in `green/700`, and the screen pops. **No spinner, no wait.**
A pending-sync chip appears in the app bar until it flushes.

**Empty/edge states:** holiday → full-screen empty state with the holiday name
and a `[Mark anyway]` ghost action; already locked → read-only list with an
`[Request amendment]` action.

## 5. My class · `my_class`

Student roster, Compact rows: avatar 32, name, roll, attendance % chip
(green ≥ 90, orange 75–89, red < 75). Search field pinned at top. Filter chips:
`All · Absent today · Fee due · Birthdays`.

**Student profile:** header card (photo 64, name, class, roll, admission no),
then tabbed sections — Overview (attendance %, recent marks, fee status *if the
role has `fee.status.read`*), Attendance calendar, Marks, Guardians (name,
relation, **masked phone**, call button that dials through a masked route),
Documents (permission-gated), Diary.

## 6. Homework & diary · `homework`, `diary`

List of posted homework with seen/submitted counters — "27 of 40 seen" is the
line that makes a teacher trust the app over WhatsApp.

**Compose** (full page, not a sheet): section (pre-filled), subject, title,
description (multiline, 5 lines min), due date, attachments, toggle "Requires
submission". Saves as draft automatically.

## 7. Marks entry · `marks_entry`

**Spreadsheet-like grid.** Frozen first column (roll + name, 140px), one column
per assessment component (Theory / Practical / Internal), 56px wide numeric
inputs.

- Keyboard `next` moves **down the column**, not across the row — that is how
  marks are actually entered from a paper sheet.
- Numeric keyboard, max-value validation inline (red border + max shown).
- `A` key or a long-press marks absent.
- Autosave to the outbox every 5 seconds and on blur.
- Header shows "23 of 40 entered" and a progress bar.
- `[ Submit for moderation ]` at the bottom, disabled until complete.

## 8. Messages · `messages`

Same as the family app but from the staff side. Thread list grouped by class.
Compose restricted to parents of students in scope. **Quiet-hours banner shows
what time the message will actually be delivered.**

## 9. Timetable · `timetable`

Week grid, horizontally scrollable, periods as rows and days as columns.
Current period highlighted. Substitutions shown with an amber left border and
"Covering for R. Iyer".

## 10. Leave · `leave`

Own balance card (`numericLarge` per leave type), request list with status
chips, `[ Apply ]` FAB. Approvers get an inbox tab with swipe-to-approve.

## 11. Principal dashboard · `principal_dashboard`

```
overline  TODAY, 10 AUGUST

4 StatTiles in a 2×2 grid (Comfortable, 88px each):
  Attendance   94.2%    numericLarge, green/500, caption "1,412 of 1,498"
  Staff present  62/68  numericLarge
  Fees today   ₹1,24,500  numericLarge
  Open items      7      numericLarge, amber/500  → approvals

ATTENDANCE NOT MARKED            (only when > 0, red/50 tint)
  "6 sections have not marked attendance"        → attendance_overview

APPROVALS PENDING
  rows by type with counts                        → approvals

RECENT INCIDENTS                 (only when > 0)
TODAY'S COLLECTIONS              sparkline, single blue/500 line
```

No pie charts. No rainbow. One line chart, one colour, no legend.

## 12. Approvals inbox · `approvals`

Grouped by type (Leave · Fee concession · Expense · TC · Circular). Each row
shows requester, subject, amount/date, and swipe actions: right = approve
(green), left = reject (red, opens a reason sheet). Bulk select via long-press.

## 13. Attendance overview · `attendance_overview`

Class × section grid with a status dot per section (marked / pending / partial).
Tap → the section's register, read-only unless the user can amend. Sort by
"most overdue".

## 14. Coordinator · `coordinator_dashboard`, `syllabus_coverage`, `marks_status`

Matrix views: teacher × class, with a completion percentage cell. Colour scale
uses a single blue ramp (`blue/100` → `blue/500`), never a red-to-green rainbow.
Tap a cell → detail.

## 15. Substitutions · `substitutions`

Today's absent teachers, their affected periods, and **auto-suggested free
teachers** ranked by same-subject and free-period fit. One tap assigns and
notifies. This replaces the 8:05 AM whiteboard.

## 16. Fee counter · `fee_counter`, `collect_fee`, `daybook`

**Collect fee** is a focused flow, not a form:
```
1. Search student (name / admission no / phone) — big 56px input, autofocus
2. Student card + outstanding invoices with checkboxes
3. Amount (pre-filled, editable), mode selector (Cash / Cheque / DD / UPI / Card)
4. Mode-specific fields appear inline
5. [ Collect ₹12,500 ]  Primary
6. Success screen: receipt number, [Print] [Share on WhatsApp] [New collection]
```
**Daybook:** opening cash, collections by mode, deposits, closing, and a
**variance row that turns red when non-zero** — that variance is the thing the
accountant hunts for.

## 17. Finance · `finance_dashboard`, `defaulters`

Collection vs projection (single bar per term), ageing buckets, defaulter list
with ageing chips and a bulk "Send reminder" action showing the ladder step each
student is on.

## 18. Front office · `front_office`, `visitors`

Quick actions grid: New visitor · Student lookup · Issue gate pass ·
Certificate request. Visitor list split into "Inside now" and "Today".

## 19. Gate · `gate_scanner`, `verify_pickup` — built for a guard

**Assume: shared low-end phone, standing, bright sunlight, one hand.**

- **High-contrast theme variant** for these two screens only (`grey/900`
  surfaces, larger type).
- Camera fills the top 60%, QR frame overlay.
- Buttons are **64px tall**, full width, high contrast.
- `verify_pickup`: scan or enter a 6-digit code → **large photo of the
  authorised person (200px)**, child name and photo, then two enormous buttons:
  `[ ✓ Release child ]` green, `[ ✕ Deny ]` red.
- Manual override is a small ghost link, requires a typed reason, and shows a
  warning: "The principal will be notified."

## 20. Driver · `driver_home`, `scan_boarding`, `sos` — three screens, huge targets

**Assume: gloves, glancing, moving vehicle.**

```
driver_home:
  Route name, h1
  Direction toggle: [ Pickup ] [ Drop ]      56px segmented
  [ START ROUTE ]                            88px, green/500, full width
  Below: stop list with student counts

scan_boarding:
  Camera 70% + a large "Tap to mark manually" fallback
  Boarded counter: numericLarge "24 / 31"
  Per-stop list, tap a student to toggle boarded/no-show

sos:
  Single 120px red/500 circular button, "HOLD FOR 3 SECONDS"
  Deliberately requires a hold so it cannot fire from a pocket.
  On fire: haptic + confirmation + notifies school and transport in-charge.
```

Nothing else. No messages, no documents, no student profiles.

## 21. Compliance centre · `compliance_centre`

APAAR worklist (status counts + a mismatch queue), UDISE export, document expiry
alerts, mandatory disclosure pack. Rows with a `red/500` left border when
overdue.

---

## 22. Cross-cutting

- **Pending-sync chip** in the app bar whenever the outbox is non-empty; tap →
  a sheet listing pending items with retry.
- **Offline banner**: a 32px `grey/800` strip, "Offline — changes will sync",
  never a blocking dialog.
- **Role switcher** in the app bar for multi-role staff; switching refetches the
  session and rebuilds navigation.

## 23. Acceptance criteria

- [ ] Navigation renders entirely from `navManifest`; zero role branching in widgets
- [ ] 40-student attendance marked in < 20 s on a real budget device
- [ ] Attendance and marks entry work fully offline with visible sync state
- [ ] A guard's session exposes only 4 screens and no staff-only route is reachable
- [ ] Role change on the server changes navigation on next session refresh
- [ ] Marks grid keyboard "next" moves down the column
- [ ] SOS requires a 3-second hold
- [ ] Gate screens are legible in direct sunlight (high-contrast variant)
- [ ] Every data-entry screen uses Compact density
