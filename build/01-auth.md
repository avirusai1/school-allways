# 01 — Authentication & Session

**Depends on:** nothing. **Unblocks:** everything.
**Read first:** `build/00-reference-implementation.md`.

---

## PROMPT

Build `apps/api/src/modules/auth/` implementing every contract below exactly.
Phone-first: parents have mobile numbers, often no email. One human = one
`users` row; `user_tenant_memberships` links them to schools, so a parent with
children in two schools has ONE login and two memberships.

---

## 1. Files

```
modules/auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── otp.service.ts
├── token.service.ts
├── session.service.ts           builds the /session payload
├── dto/
│   ├── request-otp.dto.ts
│   ├── verify-otp.dto.ts
│   ├── password-login.dto.ts
│   ├── refresh.dto.ts
│   ├── select-tenant.dto.ts
│   └── auth.response.ts
├── auth.service.spec.ts
└── otp.service.spec.ts

common/interceptors/idempotency.interceptor.ts   (§6, used by every module)
```

---

## 2. Endpoints

### `POST /v1/auth/otp/request` · `@Public()`

```jsonc
// Request
{ "phone": "919876543210", "purpose": "login" }
```
```jsonc
// 200 — IDENTICAL whether or not the phone exists
{ "sent": true, "expiresInSeconds": 300, "resendAfterSeconds": 60,
  "devOtp": "482913" }   // ONLY when NODE_ENV === 'development'
```

**Validation:** `phone` matches `/^91[6-9]\d{9}$/`. `purpose` ∈
`login | signup | phone_change | guardian_consent`.

**Rate limit:** 3 per phone per 15 min, 10 per IP per hour →
`429 RATE_LIMITED` with `details.retryAfterSeconds`.

> **The response must never reveal whether the phone is registered.** Different
> responses for known vs unknown numbers turn this endpoint into an oracle that
> tells an attacker which numbers belong to parents at a given school. Same
> body, same timing, always.

### `POST /v1/auth/otp/verify` · `@Public()`

```jsonc
{ "phone": "919876543210", "code": "482913", "purpose": "login",
  "deviceId": "a3f2...", "deviceName": "Redmi Note 12",
  "platform": "android", "appVersion": "1.0.3" }
```
```jsonc
// 200 — user belongs to exactly ONE school: auto-scoped, ready to use
{
  "accessToken": "eyJ...", "refreshToken": "eyJ...",
  "expiresIn": 900,
  "requiresTenantSelection": false,
  "user": { "id": "uuid", "fullName": "Sunita Sharma",
            "preferredLanguage": "hi", "kind": "guardian", "isMinor": false },
  "tenants": [ { "id": "uuid", "name": "Delhi Public School, Rohini",
                 "slug": "dps-rohini", "logoUrl": "https://...",
                 "branchId": "uuid", "branchName": "Main" } ]
}
```
```jsonc
// 200 — multiple schools: tid is null until /select-tenant
{ "accessToken": "eyJ...", "refreshToken": "eyJ...", "expiresIn": 900,
  "requiresTenantSelection": true, "user": {...}, "tenants": [ {...}, {...} ] }
```

Errors: `401 OTP_INVALID` (wrong, expired, or attempts exhausted — one code for
all three), `429 RATE_LIMITED`.

> A parent with one school must not have to tap twice. Auto-scope when
> `tenants.length === 1`.

### `POST /v1/auth/password/login` · `@Public()`

```jsonc
{ "email": "principal@dpsrohini.edu.in", "password": "..." }
```
Same response shape. `401 UNAUTHENTICATED` for both wrong email and wrong
password — one message: *"Email or password is incorrect."*
After 10 failures lock 15 min → `401` with
`details.lockedUntil`.

### `POST /v1/auth/select-tenant` · `@NoTenantRequired()`

```jsonc
{ "tenantId": "uuid", "branchId": "uuid" }   // branchId optional
```
```jsonc
{ "accessToken": "eyJ...", "expiresIn": 900 }
```
Must verify an **active** `user_tenant_memberships` row.
`403 TENANT_MISMATCH` otherwise, **and write an audit row** — someone asking for
a school they don't belong to is worth recording.

### `POST /v1/auth/refresh` · `@Public()`

```jsonc
{ "refreshToken": "eyJ..." }
→ { "accessToken": "eyJ...", "refreshToken": "eyJ...", "expiresIn": 900 }
```

**Rotation with reuse detection:**
1. Hash the presented token, look up `sessions`.
2. Not found → `401 UNAUTHENTICATED`.
3. Found but `revokedAt` is set → **the token was stolen and replayed.** Revoke
   every session for this user, write a security audit row, return `401`.
4. Otherwise revoke this row, issue a new pair, return.

### `GET /v1/auth/session` · authed

The single most important response in the product — it drives client navigation.

```jsonc
{
  "user": { "id": "uuid", "fullName": "Priya Menon", "displayName": "Priya",
            "photoUrl": "https://...", "preferredLanguage": "en",
            "kind": "staff", "isMinor": false },
  "tenant": { "id": "uuid", "name": "Delhi Public School, Rohini",
              "slug": "dps-rohini", "logoUrl": "https://...",
              "primaryColor": "#1B5E9C", "board": "cbse",
              "currentAcademicSessionId": "uuid",
              "currentAcademicSessionName": "2026-27" },
  "branch": { "id": "uuid", "name": "Main Campus", "code": "MAIN" },
  "roles": [
    { "code": "class_teacher", "name": "Class Teacher", "isPrimary": true },
    { "code": "exam_controller", "name": "Exam Controller", "isPrimary": false }
  ],
  "permissions": ["attendance.student.mark", "exam.marks.enter", "..."],
  "scopes": {
    "sectionIds": ["uuid-5a"],
    "subjectIds": ["uuid-maths"],
    "studentIds": []
  },
  "navManifest": ["teacher_home","take_attendance","my_class","homework",
                  "marks_entry","messages","timetable","leave"],
  "homeScreen": "teacher_home",
  "features": { "safeReporting": false, "transport": true, "books": true,
                "canteen": false, "onlinePayments": true },
  "settings": { "attendanceMode": "daily", "quietHoursStart": "21:00",
                "quietHoursEnd": "07:00" }
}
```

**Both Flutter apps render navigation from `navManifest` and `homeScreen`.**
Never hardcode role→screen mapping in a client, or every permission tweak
becomes a Play Store release. This is how one staff binary serves 26 roles.

**Performance:** ≤ 2 queries (the resolver is Redis-cached). Target < 100 ms.

### `POST /v1/auth/logout` · authed
Revokes the current session, deactivates the device token. `204`.

### `GET /v1/auth/me` · `@NoTenantRequired()`
Profile + tenant list, for the school switcher before a tenant is chosen.

---

## 3. Tokens

```ts
// Access — 15 minutes
interface AccessTokenClaims {
  sub: string;          // userId
  tid: string | null;   // tenantId — THE authoritative source, never a header
  bid: string | null;   // branchId
  sid: string;          // sessionId
  pa?: boolean;         // platform admin
  imp?: string;         // impersonator userId (support sessions)
  iat: number; exp: number;
}

// Refresh — 30 days, opaque to the client, SHA-256 stored in sessions
```

`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must differ in production (already
enforced by `config/env.validation.ts`).

---

## 4. OTP rules

```ts
crypto.randomInt(100000, 1000000)   // never Math.random
```

- Store **SHA-256 only**. Never plaintext, never in a log, never in an audit diff.
- TTL `OTP_TTL_SECONDS` (300). Max 5 verify attempts → invalidate.
- Invalidate all prior unconsumed OTPs for that (phone, purpose) on a new request.
- Send via `NotificationService` (`build/04`) with the DLT template
  `OTP_LOGIN`. **Dev mode logs it instead of sending.**
- Mask phones in every log line: `919876543210` → `9198XXXX3210`.

## 5. Passwords

argon2id, `{ memoryCost: 19456, timeCost: 2, parallelism: 1 }` (OWASP 2024
minimum). Always run the hash comparison even when the user doesn't exist, using
a dummy hash — otherwise response timing reveals which emails are registered.

---

## 6. Idempotency interceptor (build here, used everywhere)

`common/interceptors/idempotency.interceptor.ts`

```
On any POST/PATCH carrying X-Client-Mutation-Id:
  1. SELECT from idempotency_keys WHERE client_mutation_id = ?
  2. Hit  -> return the stored { status, body }. Do NOT re-execute.
  3. Miss -> execute, then store { status, body } with a 24h expiry.
  4. Concurrent duplicate (unique violation on insert) -> 409 CONFLICT
     with details.retryable = true.
```

This is what makes offline replay safe on a flaky 2G connection: the same
mutation posted ten times applies once and returns the same response every time.

---

## 7. Acceptance criteria

- [ ] OTP response is byte-identical for known and unknown phones
- [ ] Replaying a revoked refresh token revokes the entire session family
- [ ] Single-membership user is auto-scoped; multi-membership gets `tid: null`
- [ ] `select-tenant` for a non-member → `403 TENANT_MISMATCH` + audit row
- [ ] `/auth/session` ≤ 2 queries, returns a correct `navManifest`
- [ ] Password login timing is constant for existing vs non-existent emails
- [ ] No OTP or full phone number appears in any log
- [ ] Same `X-Client-Mutation-Id` posted 10× applies once
- [ ] Unit tests: OTP expiry, attempt exhaustion, rotation, reuse detection,
      tenant-mismatch rejection
