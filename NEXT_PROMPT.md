# Work order — Replace phone+OTP with email invite + password (staff, students, parents)
# Paste this whole file into a fresh Cursor composer session.

**Read this whole file before writing any code.** This changes how every
human being logs into the platform — staff, students, and parents — and it
touches auth, RBAC, notifications, and four frontends. Stop and ask if
anything below is ambiguous; getting login wrong locks real people out.

## The decision, stated plainly

Abhishek decided (2026-08-18): **email invite + self-service password is
the only login mechanism for everyone** — staff, students, and parents.
Phone + OTP login is removed entirely. This reverses the "phone-first by
design" decision baked into `db/schema/02-identity.ts`'s current header
comment (written for a real reason — many Indian parents have no email —
but superseded by this instruction; update that comment when you change
the behaviour it describes).

Phone numbers stay as a **contact field** (SMS/WhatsApp notifications,
emergency contact, etc.) — this is about removing phone as a **login
credential**, not deleting the phone column or SMS notifications generally.

## What already exists — read this before building anything new

A join-token invite system already exists and is most of the way there.
Do not rebuild it from scratch.

- `apps/api/src/modules/auth/join.service.ts` — redeems a token
  (`join()`), issues a session. Currently handles three purposes:
  `staff_invite`, `parent_profile`, `signup_handoff`.
- `apps/api/src/modules/onboarding/onboarding.service.ts` — the only place
  that currently *creates* `staff_invite` and `parent_profile` tokens,
  fans them out via `fanOutInvites()`, and it already supports an `email`
  channel per recipient.
- `apps/api/src/modules/notifications/providers/gmail.provider.ts` — a
  real Gmail SMTP provider (nodemailer, not a stub), gated on
  `GMAIL_USER`/`GMAIL_APP_PASSWORD`. **These env vars are not set anywhere
  yet — not even in `.env.example`.** No real invite email has ever been
  sent. Gmail's send limit (~500/day consumer, ~2000/day Workspace) is
  fine for pilot schools; flag in a comment that this needs to move to
  SES/Postmark before real scale, don't build that migration now.
- `guardians` table already has an `email` column (seed data proves it:
  `db/seeds/demo.ts` sets `email: 'parent@sunrise.demo'`) — parents
  already have somewhere for an email to live.
- `students` table already has a nullable `userId` FK to `users`
  (`db/schema/05-students.ts`), and a `student` system role already
  exists in `db/seeds/roles.ts`, fully permissioned, currently assigned to
  nobody. The groundwork for student logins exists; the flow to use it
  does not.

## The two real gaps blocking everything

1. **There is no password-setting step anywhere in the codebase.**
   `join.service.ts`'s `join()` redeems a token and calls
   `issueSessionForVerifiedUser()` directly — it never asks the person to
   create a password. Every password that exists today (`Demo@12345`, the
   platform admin's) was set directly by a seed script, never by the user
   themselves. This is PART A below and is the actual blocker — nothing
   else matters until this exists.
2. **Staff invite generation silently drops anyone without a phone
   number.** `onboarding.service.ts` filters candidates with
   `.filter((m) => m.phone)` before creating tokens, even though email is
   already a delivery channel. An email-only staff member currently never
   gets invited at all.

---

## PART A — Add a real "set your password" step to the join flow

This is the foundation everything else depends on.

1. Split `join()` into two calls: keep something like the current
   `join()` as a **preview** (validate token, return status +
   `schoolName`, no session yet — the frontend uses this to show "Welcome
   to Sunrise Public School" before asking for a password). Add a new
   endpoint, e.g. `POST /auth/join/:token/activate` with `{ password }`,
   that: re-validates the token (not expired, not consumed), hashes the
   password with argon2id (mirror `db/seeds/platform-admin.ts`'s
   `MIN_PASSWORD_LENGTH = 12` pattern), writes `passwordHash` onto the
   token's `userId`, then does the same transactional
   consume-token/activate-membership/issue-session sequence `join()` does
   today.
2. This must work for all three purposes below — don't special-case only
   `staff_invite`.
3. Update `join.service.spec.ts` accordingly; keep the existing rate-limit
   (`FAILED_LIMIT`/`FAILED_WINDOW_SECONDS`) logic intact — password
   guessing against a token is the same attack the comment already
   describes for OTP.

## PART B — Fix staff invite eligibility

Change `onboarding.service.ts`'s invite-candidate filter from "has a
phone" to "has an email" (staff records should already collect a work
email — check `db/schema/06-staff.ts`'s `workEmail` field and use it if
`users.email` isn't populated). Staff invite fan-out should default to
`channels: ['email']` — SMS/in-app can stay as secondary if you want, but
email is now the primary and required channel, not phone.

## PART C — Build student invites (new)

1. Add `student_invite` to wherever the join-token `purpose` enum is
   defined (find it — likely near the `joinTokens` table definition).
2. Build a way for a school admin to trigger a student invite — likely a
   new endpoint under the students module, per-student, that: collects/
   confirms a student email (real schools frequently do **not** have a
   student's own email on file — check with Abhishek whether this should
   be a required field added to the student record, or entered ad hoc at
   invite time; don't assume), creates a `users` row (`kind: 'student'`)
   if `students.userId` is null, links it, assigns the `student` role via
   `userRoleAssignments` (`scopeType: 'self'`, mirroring how
   `parentRole`/`teacherRole` assignment works in `db/seeds/demo.ts`),
   creates the join token, and fans it out via the same
   `fanOutInvites()`-style mechanism.
3. Extend `join.service.ts`'s `join()`/new activate endpoint to branch on
   `student_invite` the same way it branches on `staff_invite` today.

## PART D — Move parent/guardian to email, remove phone+OTP login

1. Parent invite fan-out already supports email — confirm/default it to
   `channels: ['email']` the same way as PART B.
2. Find and remove (or clearly deprecate, gated behind a flag if you'd
   rather not delete outright) the standalone phone+OTP login path used
   for **ongoing** guardian logins — `apps/api/src/modules/auth/otp.service.ts`
   and whatever `auth.controller.ts` endpoints call it for login (not
   registration/join). Replace with the same email+password login every
   other role now uses.
3. Phone stays on the `users`/`guardians` record as a contact field — do
   not remove the column or break SMS notification code paths that read
   it. This is strictly an authentication change.

## PART E — Frontend/mobile

Update every login/registration screen that currently assumes phone+OTP:

- `apps/mobile-family` and `apps/web-family` — currently phone+OTP entry;
  needs email+password login, plus a new "set your password" screen that
  opens from the emailed invite link/deep link.
- Check `apps/mobile-admin`/`apps/web-admin` and `apps/web-control` too —
  staff/platform logins are probably already email+password, but verify
  no phone-first assumption leaked in anywhere (e.g. registration/first-
  run screens).
- `packages/flutter/core_auth` — shared auth logic between the two Flutter
  apps; check what deep-link handling exists today for the join URL
  pattern (`{FAMILY_WEB_URL}/join/:token` per `joinBaseFor()` in
  `onboarding.service.ts`) and whether the mobile apps can open that link
  at all today or only the web apps can.

## PART F — Config and seeds

1. Add `GMAIL_USER` / `GMAIL_APP_PASSWORD` to `.env.example` with a
   comment pointing at an App Password, not the account password (see
   `gmail.provider.ts`'s own header comment). Actually setting real
   values in production is Abhishek's task, not yours.
2. `db/seeds/demo.ts` sets passwords/phone directly, bypassing the invite
   flow entirely — that's fine and should keep working as a fast local
   testing shortcut. Update its printed "Parent phone: ... (OTP login)"
   messaging once OTP login is gone — give the demo parent an email +
   `Demo@12345` too, consistent with the other three demo logins.

## Constraints that don't change

Everything else about this codebase's discipline still applies: RLS/
tenant isolation via `db.asTenant()`, argon2id for all password hashing,
audit logging on auth events (mirror `join.service.ts`'s `writeAudit`),
and the CI tenant-isolation + verify jobs must still pass. Don't touch
billing/subscription logic (PART G of the previous work order) — unrelated
to this change.
