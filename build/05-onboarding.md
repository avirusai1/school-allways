# 05 — Self-Serve Onboarding

**Depends on:** 01, 02, 03. **The front door of the entire business.**

**North-star: time from signup to first attendance marked, under 30 minutes,
with zero human contact.** Everything here is judged against that number.

---

## 1. Signup

```jsonc
POST /v1/public/signup            @Public()
{ "schoolName": "Delhi Public School, Rohini",
  "board": "cbse", "city": "New Delhi", "state": "Delhi",
  "approxStudentCount": 800,
  "contactName": "Rakesh Gupta", "contactPhone": "919876543210",
  "contactEmail": "principal@dpsrohini.edu.in",
  "referralCode": "DPSR-4821" }
→ 202 { "signupId": "uuid", "otpSent": true }

POST /v1/public/signup/:id/verify
{ "code": "482913" }
→ 201 {
    "tenantId": "uuid", "slug": "dps-rohini",
    "accessToken": "...", "refreshToken": "...",
    "onboardingStep": "school_profile"
  }
```

**On verify, atomically:**
1. Create the tenant (slug from the name, deduped with a numeric suffix)
2. Create the default branch
3. Create the principal user + `school_admin` role assignment
4. Create a `free` subscription
5. Load sample data (`hasSampleData = true`)
6. Emit `onboarding_events` `{ step: 'signup', action: 'completed' }`
7. Attribute the referral if a code was supplied

**Under 60 seconds, no card, no sales call.**

---

## 2. The wizard

```
GET  /v1/onboarding/state
POST /v1/onboarding/steps/:step        { data, action: 'complete'|'skip' }
POST /v1/onboarding/sample-data/wipe
POST /v1/onboarding/invite/staff       { userIds[] | all }
POST /v1/onboarding/invite/parents     { sectionIds[] | all }
POST /v1/onboarding/callback-request   { preferredTime, note }
```

**Nine steps:**
```
school_profile → academic_session → classes → subjects →
import_staff → import_students → invite_staff → invite_parents →
first_attendance
```

**State response:**
```jsonc
{ "currentStep": "import_students",
  "steps": [
    { "key": "school_profile", "status": "completed", "completedAt": "..." },
    { "key": "classes", "status": "completed", "itemCount": 15 },
    { "key": "import_students", "status": "in_progress", "itemCount": 0 },
    { "key": "first_attendance", "status": "pending" }
  ],
  "progressPercent": 55,
  "hasSampleData": true,
  "canSkipCurrent": true,
  "estimatedMinutesRemaining": 12 }
```

**Every step is resumable, skippable and re-orderable.** Nobody finishes in one
sitting. Persist on `tenants.onboardingStep`.

---

## 3. Instrumentation — this is the growth loop, not analytics

Every step emits an `onboarding_events` row:
`started | completed | skipped | failed | abandoned`, with `durationSeconds`,
`itemCount`, `errorCount`, `errorClass`. **Never row data.**

The report that matters (built in `build/10`):

```
Step               Started  Completed  Median   Drop-off
import_staff            84         61  11m20s      27%   ← fix this first
import_students         61         44  19m45s      28%
```

If 27% abandon at "import staff", that number tells you what to build next. You
cannot learn it from a completion rate.

---

## 4. Parent self-fill — how 30 minutes is actually possible

The school imports **name + class + parent phone only**. The parent app then
collects address, photo, documents and Aadhaar consent for APAAR.

```
POST /v1/onboarding/invite/parents
→ bulk SMS/WhatsApp with a deep link:
  https://school.techallways.com/j/{token}
→ opens the app (or the store, then the app) straight into "complete your
  child's profile"
```

This turns the school's largest data-entry cost into a distributed task. It is
the single biggest lever on time-to-activation.

---

## 5. Sample data & demo mode

Provision one demo class with ~20 obviously-fictional students (use clearly
placeholder names, never realistic ones that could be mistaken for real
records). One button wipes it. A principal will click around before committing
real data — let them.

---

## 6. Activation

Set `tenants.activatedAt` when the **first attendance register is marked**. That
is THE activation event; all growth analytics key off it, and referral rewards
pay out on it (not on signup — rewarding signups buys you fake schools).

---

## 7. Nudges

A scheduled job (07:00 IST) finds tenants stalled > 24h on a step and sends a
targeted WhatsApp/SMS deep-linking back to that exact step. Escalating cadence:
day 1, day 3, day 7, then stop.

**Human escape hatch:** "Request a callback" on every wizard step. Self-serve is
not the same as abandoned.

---

## Acceptance criteria

- [ ] Signup → usable tenant in < 60 seconds
- [ ] Wizard fully resumable after closing the browser mid-step
- [ ] Board template creates classes + subjects in one click
- [ ] Every step emits an `onboarding_events` row with duration
- [ ] `activatedAt` set precisely on first attendance
- [ ] Sample data wipes cleanly and completely
- [ ] Parent deep link opens the profile-completion flow
- [ ] A stalled school receives a nudge within 24h
- [ ] Referral attributed on signup, rewarded on activation
