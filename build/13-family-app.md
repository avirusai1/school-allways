# 13 — School All Ways (Family App)

`apps/mobile-family/` · `com.schoolallways.family` · Parents, guardians, students.

**Read `build/11-design-system.md` and `build/12-flutter-foundation.md` first.**
Density profile: **Comfortable** (64px rows) throughout, except the books shelf.

**Budget:** APK < 25 MB · first frame < 1.5 s on a 2 GB phone.

> **The product this app is really selling is reassurance.** A parent opens it to
> answer "is my child okay, and is anything due?" Every screen should answer that
> in under two seconds without a tap.

---

## 1. Splash / auth gate · `/`

Solid `blue/500`, centred school-agnostic wordmark, no animation beyond a 160ms
fade. Decides in < 300 ms: valid session → `homeScreen`; expired → refresh
silently; none → `/login`. **Never show a loading spinner here** — if it takes
long enough to need one, the decision logic is wrong.

## 2. Login · `/login` → `/login/otp`

**Layout (single column, 24px padding):**
```
64px top space
Wordmark, 32px, blue/500
32
display  "Sign in"
8
bodySmall grey/500  "Use the mobile number registered with your school"
32
label    "Mobile number"
6
[ +91 │ 98765 43210 ]        48px input, prefix chip is grey/50, non-editable
24
[ Send OTP ]                 Primary, full width
16
caption grey/500 centred     "By continuing you agree to our Terms and Privacy Policy"
```

**OTP screen:** 6 separate boxes (44×52, `radius/sm`), auto-advance,
auto-submit on the 6th digit, paste-from-SMS support (`autofillHints:
[oneTimeCode]`). Resend is a ghost button disabled with a live countdown:
"Resend in 47s". On error, boxes get a 2px `red/500` border and one line of
`bodySmall red/700` — **never a snackbar for an inline field error.**

## 3. School selector · `/select-school`

Only when `requiresTenantSelection`. Card list, each row: school logo (40,
`radius/sm`), name (`bodyMedium`), city + child names (`bodySmall grey/500`),
chevron. Persist the choice; this screen should be seen once.

## 4. Child switcher — bottom sheet, not a screen

Triggered by tapping the child chip in the app bar. `radius/lg` top corners,
drag handle, one row per child: avatar 40, name, "Class 5-A", check on the
active one. **A parent with three children switches constantly — one tap from
anywhere.** Persist the last selection per school.

## 5. Home feed · `/home` — the screen that matters most

**One API call:** `GET /v1/family/home?studentId=`. Six clean REST calls would
be purer and slower; on 3G in a tier-2 town, latency wins.

**App bar:** [child avatar + name ▾] ······ [🔔 with dot] [⚙]

**Body — vertical scroll, 16px padding, 12px between cards:**

```
1. TODAY STRIP                       (Card, always first)
   overline  TODAY, 10 AUG
   Row of three StatTiles, equal width, divided by 1px grey/200:
     ✓ Present        numericLarge green/500 + caption "Attendance"
     2 due            numericLarge grey/900 + caption "Homework"
     ₹0               numericLarge grey/900 + caption "Fees due"

2. BUS CARD                          (only while a trip is active)
   cyan/50 fill · bus icon · "Bus 12 · 4 stops away · ETA 7:52 AM"
   trailing ghost button "Track"

3. NEEDS ATTENTION                   (only when non-empty — never an empty card)
   Rows with a 3px left border in the semantic colour:
     red    "Fee of ₹12,500 overdue by 4 days"        → /fees
     orange "Consent form for the science trip"        → /notices/:id
     blue   "PTM slot booking closes tomorrow"         → /ptm

4. HOMEWORK DUE                      (max 3, then "View all")
   List rows: subject chip · title · "Due today" in orange/700 if today

5. RECENT NOTICES                    (max 3)
   Row: title bodyMedium · timestamp caption grey/500 · unread = 8px amber dot

6. LATEST PHOTOS                     (only if an album exists in the last 7 days)
   Horizontal 3-up thumbnails, 96×96, radius/sm
```

**States.** Loading = skeleton in the exact card layout, static grey blocks, no
shimmer. Empty (new school, nothing yet) = a single friendly card: "Your
school hasn't posted anything yet. You'll see attendance and homework here."
Error = inline banner with Retry; **cached content still renders below it.**

Pull-to-refresh triggers `/sync/status` + refetch.

## 6. Attendance · `/attendance`

- **Month calendar**, one screen-width grid. Each day is a 40px cell with the
  status colour as a filled circle and the date inside; today has a 2px
  `blue/500` ring. Legend row beneath with letters (P/A/L) — colour is never
  the only signal.
- Summary card above: `numericLarge` "92.3%" + caption "Present this term",
  with present/absent/late counts as three inline stats.
- Tapping a day opens a bottom sheet: status, in-time, remarks, and — if absent
  — an "Apply for leave" action.
- **Leave request** (`/attendance/leave`): bottom sheet with date range, reason
  (required, 10 char min), optional attachment. Optimistic: appears immediately
  as `Pending`.

## 7. Homework & diary · `/homework`, `/diary`

Segmented control at the top: `Pending | Completed | All`.
Rows: subject chip (`blue/50` fill, subject short name) · title `bodyMedium` ·
"Maths · Due 12 Aug" `bodySmall grey/500` · trailing status chip.
Overdue rows get an `orange/500` 3px left border.

Detail (`/homework/:id`): title, subject, assigned/due dates, description,
attachments (tap → viewer or download), and a "Mark as done" button when
submission isn't required. **Opening the detail sets `seenAt`** — that's the
read receipt the teacher sees.

Diary is a reverse-chronological list grouped by date header (`overline`), each
entry showing type chip, body, teacher name.

## 8. Notices · `/notices`

Rows: title, one-line preview `bodySmall grey/500`, timestamp, unread amber dot.
Filter chips: `All · Circulars · Events · Exams · Fees`.
Detail renders the body, attachments, and — when
`requiresAcknowledgement` — a sticky bottom Primary button "I have read this",
which posts an acknowledgement and cannot be dismissed by scrolling.

## 9. Messages · `/messages`

Thread list: avatar (teacher initials on `blue/100`), display name (**masked** —
"Ms. Sharma · Class Teacher, 5-A"), last message preview, timestamp, unread
count pill.

Thread (`/messages/:id`): standard bubbles — mine `blue/500` on the right with
white text, theirs `grey/50` on the left with `grey/900`. `radius/md` with one
corner squared toward the sender. Timestamp + read tick under the last message
of a group. Composer: 48px input, attach icon, send icon (amber when enabled).

**No phone number appears anywhere in this feature, in either direction.**
Outside school hours, show a `grey/50` banner: "Messages sent now will be
delivered at 7:00 AM."

## 10. Fees · `/fees`

**Header card** (`grey/0`, prominent): `numericLarge` outstanding amount in
`red/500` when > 0 else `green/500`, caption "Total outstanding", plus a
`[ Pay now ]` Primary button full-width when > 0.

**Invoice list:** rows with term name, due date, amount (`numeric`,
right-aligned), status chip (`Paid` green · `Due` grey · `Overdue` red ·
`Partial` orange).

**Invoice detail:** line items table — head name left, amount right, tabular
figures, 1px dividers; concessions shown as negative lines in `green/700`; total
row with a 2px top border. Then "Pay ₹12,500" or, if paid, "Download receipt".

**Multi-child:** a persistent banner when other children have dues — "2 other
children have ₹18,000 due · Pay all together" → combined checkout. Parents want
one transaction.

**Payment flow:** amount confirmation → gateway (in-app webview or SDK) →
result screen. **Must survive backgrounding**: on resume, poll
`GET /fees/payments/:id` rather than trusting the client callback; the webhook
is the source of truth.

## 11. Results · `/results`

Exam list with published-only entries. Detail: subject rows (subject · marks
obtained/max `numeric` · grade chip), a total row, then attendance %, teacher
remarks, and `[ Download report card ]`.

**Trend chart** (only when 2+ terms exist): a single-line chart, `blue/500`, no
gridlines beyond a faint baseline, no legend for one series. Never a rainbow
multi-series chart.

## 12. Bus tracking · `/bus`

Full-bleed `flutter_map` + OSM tiles (not Google Maps — the SDK billing is a
trap at scale). Bus marker, route polyline `blue/500` at 40% opacity, stop
markers, the child's stop highlighted amber.

Bottom sheet (peek 140px, draggable): route name, driver name + **call button**
(this one number is intentionally exposed — safety overrides masking), ETA to
the child's stop, last boarding event ("Boarded at 7:38 AM · Sector 9 stop").

WebSocket only while the trip is active and the screen is foregrounded.
**Disconnect on background** — 1,800 phones holding sockets is a real server
cost. Off-trip: last known position, greyed, with "Bus is not running now".

## 13. Books · `/books` — dense grid, offline-first

Grid 2-up (3 on tablet), cover 3:4 `radius/sm`, title `bodySmall` 2-line clamp,
subject caption. Badge overlay: ✓ downloaded · ↓ available · ⟳ update available.

Filters: class (auto), subject chips.

**Reader** (`/books/:id/read`): full-screen PDF, page indicator, bookmark, last
page restored. Opens **from local storage with zero network**. If a newer
version exists, a top banner: "New version available · Sync" — never
auto-download over mobile data.

Download shows real progress, is resumable, and verifies SHA-256 before marking
complete.

## 14. Gallery · `/gallery`

Album grid, cover + title + photo count. Album view = 3-column square thumbnail
grid (`thumb` variant only, never originals). Tap → full-screen pager with
pinch-zoom and a download action.

## 15. Pickup · `/pickup`

**Authorised persons** list: photo 48 circular, name, relation, `Permanent` or
`Valid till 12 Aug` chip, overflow menu (Edit / Revoke).

`[ + Add person ]` → form: photo (**required**, camera or gallery), name,
relation, phone, ID type + last 4, permanent or date range.

**"Generate one-time code"** → bottom sheet with a large `numericLarge` 6-digit
code, expiry countdown, and a share button. This is what a parent uses when an
uncle is collecting the child today.

## 16. Privacy centre · `/privacy` — a feature, not a settings page

- **What we hold**: plain-language list by category with an example each.
- **Consents**: one row per purpose, with a switch. Essential purposes show a
  lock icon and an explanation instead of a switch. Toggling off asks for
  confirmation naming the consequence.
- **Who accessed my child's data**: reverse-chronological list from
  `pii_access_logs` — role, date, purpose. *No other school ERP shows a parent
  this. Make it visible.*
- **Download my data** → queued export, notification when ready.
- **Request deletion** → creates a `data_request` with the statutory clock.

## 17. Settings · `/settings`

Profile, language (`English / हिन्दी`), notification preferences per category,
quiet hours (read-only, school-set), linked children, sync status + manual
"Sync now" with last-synced time, help & support (in-app chat + callback
request), about, logout.

---

## 18. Student mode

When `session.user.kind == 'student'`:
- Nav: Home · Timetable · Homework · Results · Books
- **Hidden entirely:** fees, messages, pickup, privacy centre
- **No analytics SDK initialised on this session, ever** (DPDP: under-18)
- Safe reporting entry point appears only when
  `features.safeReporting == true`, as a discreet "Report a concern" row in
  settings — never a prominent button that a peer could see being tapped.

---

## 19. Acceptance criteria

- [ ] Home renders from cache instantly, then refreshes; never a cold spinner
- [ ] Attendance, homework, notices and books all work fully offline
- [ ] Book reopen = zero network
- [ ] Payment survives backgrounding and reconciles via polling
- [ ] No phone number in any message or thread view
- [ ] Bus socket disconnects on background
- [ ] Every screen has loading / empty / error states per `build/11`
- [ ] Full Hindi UI with no clipping at 200% text scale
- [ ] APK < 25 MB
- [ ] Zero hardcoded colours, sizes or durations
