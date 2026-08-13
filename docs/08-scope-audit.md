# 08 — Scope Enforcement Audit

**Date:** 10 August 2026 · **Scope:** all 215 API endpoints across 20 modules
**Method:** static analysis of `@RequirePermission` / `@Grant` / `scopeFilter` /
`assertInScope` coverage, then manual read of every endpoint returning
student-linked data.

**Result: 2 confirmed issues, 2 minor observations.** For a codebase this size
that is a good outcome, and it means the pattern is being followed.

---

## Why `scopeFilter` count alone was a false alarm

`scopeFilter()` appears only 10 times across the codebase, which initially
looked like systemic under-enforcement. It isn't. Three legitimate patterns are
in use, and the count only captures one:

| Pattern | Where | Verdict |
|---|---|---|
| `scopeFilter()` predicate | students, exams, fees, sync | ✅ correct |
| `assertInScope()` on a resolved id | attendance, homework, safety, books, family | ✅ correct |
| **Natural scoping by join** | communication threads: `eq(threadParticipants.userId, userId)` | ✅ correct, and stronger than a predicate |
| Branch-level master data, no student link | academic, staff, transport vehicles/routes | ✅ RLS + branch permission is sufficient |

Communication in particular is well built — `listMessages` calls
`repo.isParticipant()` before returning anything and throws `SCOPE_VIOLATION`,
and there's an explicit comment marking the phone fields as deliberately
excluded.

**Conclusion: do not mass-retrofit `scopeFilter()`.** Fix the two real gaps.

---

## FINDING 1 — `GET /v1/transport/live` ignores caller scope

**Severity: Medium** · **File:** `modules/transport/transport.service.ts:413`

```ts
async livePositions(routeId?: string) {
  const ctx = RequestContextStore.get();
  const vehicleIds = await this.db.run(async (tx) => {
    if (routeId) { /* single route, branch-checked */ }
    // ↓ No routeId: returns EVERY active vehicle in the branch
    const rows = await tx.select({ id: vehicles.id }).from(vehicles)
      .where(and(eq(vehicles.branchId, ctx.branchId!), eq(vehicles.isActive, true)));
    return rows.map((r) => r.id);
  });
```

`transport.tracking.read` is held by the **parent** role at `self` scope
(`db/seeds/roles.ts`). A parent calling `/v1/transport/live` with no `routeId`
receives the live GPS position of every bus in the school.

Not a cross-tenant leak — RLS holds — and bus coordinates aren't a specific
child's PII. But it violates the documented rule, and "parents can watch every
school bus" is a headline nobody wants.

### Fix

```ts
async livePositions(routeId: string | undefined, grant: GrantedPermission) {
  const ctx = RequestContextStore.get();

  const vehicleIds = await this.db.run(async (tx) => {
    // Self-scoped callers (parents, students) see ONLY the vehicles on routes
    // their own children are allocated to. Resolve from the grant's studentIds
    // rather than trusting a client-supplied routeId.
    if (grant.scope === 'self') {
      const ids = grant.studentIds ?? [];
      if (ids.length === 0) return [];               // match nothing, never all

      const rows = await tx
        .selectDistinct({ vehicleId: routes.vehicleId })
        .from(studentTransport)
        .innerJoin(routes, eq(routes.id, studentTransport.routeId))
        .where(
          and(
            inArray(studentTransport.studentId, ids),
            eq(studentTransport.isActive, true),
            routeId ? eq(routes.id, routeId) : sql`true`,
          ),
        );
      return rows.map((r) => r.vehicleId).filter((v): v is string => !!v);
    }

    // Staff scopes (branch/tenant) keep the existing behaviour.
    /* ...unchanged... */
  });
  /* ...unchanged Redis MGET... */
}
```

Controller:
```ts
@Get('live')
@RequirePermission('transport.tracking.read')
live(
  @Query('routeId') routeId: string | undefined,
  @Grant('transport.tracking.read') grant: GrantedPermission,
) {
  return this.service.livePositions(routeId, grant);
}
```

### Regression test

```ts
it('a parent sees only the bus their child rides', async () => {
  const grant = { ...base, scope: 'self', studentIds: ['child-1'] };
  const res = await service.livePositions(undefined, grant);
  expect(res.vehicles.map(v => v.vehicleId)).toEqual(['bus-of-child-1']);
});

it('a parent with no transport allocation sees no buses', async () => {
  const grant = { ...base, scope: 'self', studentIds: [] };
  expect((await service.livePositions(undefined, grant)).vehicles).toHaveLength(0);
});
```

---

## FINDING 2 — `DELETE /v1/pickup/authorised/:id` has no ownership check (IDOR)

**Severity: Medium-High** · **File:** `modules/safety/safety.service.ts:342`

```ts
async revokeAuthorised(id: string) {
  const ctx = RequestContextStore.get();
  return this.db.run(async (tx) => {
    const [row] = await tx.update(authorisedPickups)
      .set({ revokedAt: new Date(), isActive: false, ... })
      .where(eq(authorisedPickups.id, id))   // ← id only. No student check.
      .returning({ ... });
```

`pickup.authorisation.manage` is held by **parent** at `self` scope. The
controller has no `@Grant`, and the service never verifies the row belongs to
one of the caller's children. Any authenticated parent who knows or guesses a
row UUID can revoke another family's authorised pickup person.

This is worse than it first looks because of **what it does**: revoking an
authorised pickup means that when the grandparent arrives at 3pm, the guard
refuses to release the child. It is a child-safety-adjacent denial-of-service,
not just a data issue.

Mitigating: UUIDv4 ids are not enumerable, so this needs a leaked id. It is
still a straightforward IDOR and should be fixed before any pilot.

Its siblings are correct — `listAuthorised` (line 273) and `generatePickupOtp`
both call `assertInScope`. This one was simply missed.

### Fix

```ts
async revokeAuthorised(id: string, grant: GrantedPermission) {
  const ctx = RequestContextStore.get();

  return this.db.run(async (tx) => {
    // Read first so we can prove ownership BEFORE mutating. Doing the update
    // with an extra WHERE would also work, but returning 404 vs 403 correctly
    // matters here: the parent needs to know it wasn't their record.
    const [existing] = await tx
      .select({ id: authorisedPickups.id, studentId: authorisedPickups.studentId })
      .from(authorisedPickups)
      .where(eq(authorisedPickups.id, id))
      .limit(1);

    if (!existing) throw new ApiException(404, 'NOT_FOUND', 'Authorised pickup not found');

    assertInScope(grant, { studentId: existing.studentId });

    const [row] = await tx.update(authorisedPickups)
      .set({ revokedAt: new Date(), isActive: false, updatedAt: new Date(), updatedBy: ctx.userId })
      .where(eq(authorisedPickups.id, id))
      .returning({ id: authorisedPickups.id, revokedAt: authorisedPickups.revokedAt });

    RequestContextStore.addAudit({
      action: 'pickup.authorisation.revoked',
      entityType: 'authorised_pickups',
      entityId: id,
    });

    return row;
  });
}
```

Controller:
```ts
@Delete('pickup/authorised/:id')
@RequirePermission('pickup.authorisation.manage')
revoke(
  @Param('id', ParseUUIDPipe) id: string,
  @Grant('pickup.authorisation.manage') grant: GrantedPermission,
) {
  return this.service.revokeAuthorised(id, grant);
}
```

### Regression test

```ts
it('a parent cannot revoke another family\'s authorised pickup', async () => {
  const grant = { ...base, scope: 'self', studentIds: ['child-1'] };
  await expect(service.revokeAuthorised('pickup-of-child-99', grant))
    .rejects.toThrow(ForbiddenException);
});
```

---

## MINOR 1 — `POST /books/:id/publish` unscoped

`book.manage` resolves to `section` scope for a subject teacher. Publishing is
by book id with no section check, so a subject teacher could publish a book
belonging to another section. Low impact (publishing, not reading), but add
`assertInScope` against the book's `book_audiences` sections for consistency.

## MINOR 2 — `POST /announcements/:id/acknowledge` unscoped

A user can acknowledge any announcement id. Impact is negligible — it only
writes an acknowledgement row — but it lets someone inflate another audience's
read counters. Verify the caller is in `delivery_attempts` for that announcement
before recording.

---

## Endpoints reviewed and found correct

Worth recording so this isn't re-audited later:

- `students` — `scopeFilter` on list, `assertInScope` on detail ✅
- `attendance` — `assertInScope` on section and student paths ✅
- `homework` — 8 `@Grant`, 6 `assertInScope` ✅
- `exams` — 9 `@Grant`, 8 `assertInScope`, `scopeFilter` on marks list ✅
- `fees` — `FeeStatusDto` / `FeeInvoiceDto` correctly separated ✅
- `family` — 9 `@Grant`, `assertInScope` throughout ✅
- `sync` — 6 `scopeFilter` calls, one per synced entity ✅ *(this is the one I
  expected to be wrong and it isn't)*
- `communication` — participant-join scoping + explicit phone exclusion ✅
- `platform` — zero tenant-table imports, CI grep wired into a spec ✅
- No `tenantId` read from header, query or body anywhere ✅

---

## Recommended CI guard

Add to `.github/workflows/ci.yml` so the next one is caught automatically:

```yaml
- name: Scope guard — :id mutations must declare a grant
  run: |
    # Any @Patch/@Delete on a :id route in a module that has self-scoped
    # permissions must carry @Grant within 12 lines.
    node scripts/check-scope-decorators.mjs
```

The check is mechanical: parse controllers, and for every `:id` mutation whose
permission is legal at `self` or `section` scope (per `db/seeds/permissions.ts`),
require a `@Grant` on the handler. That list of legal scopes already exists in
the seed catalogue, so the guard has a source of truth to compare against.
