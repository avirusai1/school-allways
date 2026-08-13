import { joinTokens, userTenantMemberships } from '@saw/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../../common/context/request-context';
import { JoinService } from './join.service';

/**
 * The token row the lookup finds. Individual tests override what they care
 * about; everything else stays valid so a failure points at one cause.
 */
function tokenRow(over: Record<string, unknown> = {}) {
  return {
    id: 'tok-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    purpose: 'staff_invite',
    studentId: null,
    userId: 'user-1',
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    ...over,
  };
}

describe('JoinService', () => {
  const redis = { get: vi.fn(), incr: vi.fn(), expire: vi.fn(), ttl: vi.fn() };
  const auth = { issueSessionForVerifiedUser: vi.fn() };
  const config = { getOrThrow: vi.fn(() => 'http://files.test') };

  let lookupRows: unknown[] = [];
  const updated: unknown[] = [];

  /**
   * Enough of drizzle's builder to record what the service tried to do. The
   * shapes here mirror the real chains: select().from().where().limit() for
   * reads, update().set().where() for writes.
   */
  function selectChain(rows: unknown[]) {
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy']) {
      chain[m] = () => chain;
    }
    chain.limit = () => Promise.resolve(rows);
    // Awaiting without .limit() (the students query) resolves the same rows.
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(rows).then(res);
    return chain;
  }

  const tx = {
    select: () => selectChain(lookupRows),
    update: (table: unknown) => {
      updated.push(table);
      return { set: () => ({ where: () => Promise.resolve([]) }) };
    },
    insert: () => ({ values: () => Promise.resolve([]) }),
  };

  const db = {
    runWithJoinToken: vi.fn(async (_h: string, fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    asTenant: vi.fn(async (_t: string, fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };

  let service: JoinService;

  beforeEach(() => {
    vi.clearAllMocks();
    updated.length = 0;
    lookupRows = [];
    // The rate limiter keys on the caller's IP, which only exists on a request.
    vi.spyOn(RequestContextStore, 'peek').mockReturnValue({ ip: '203.0.113.9' } as never);
    redis.get.mockResolvedValue('0');
    redis.incr.mockResolvedValue(1);
    auth.issueSessionForVerifiedUser.mockResolvedValue({ accessToken: 'jwt' });
    service = new JoinService(config as never, db as never, auth as never, redis as never);
  });

  it('reports an unknown token as invalid without saying so', async () => {
    lookupRows = [];

    const res = await service.join('nope');

    expect(res.status).toBe('invalid');
    // No school named, no hint that the token space was probed successfully.
    expect(res.schoolName).toBeUndefined();
    expect(auth.issueSessionForVerifiedUser).not.toHaveBeenCalled();
  });

  it('reports an expired token separately so the UI can offer a resend', async () => {
    lookupRows = [tokenRow({ expiresAt: new Date(Date.now() - 1000) })];

    const res = await service.join('old');

    expect(res.status).toBe('expired');
    expect(auth.issueSessionForVerifiedUser).not.toHaveBeenCalled();
    expect(updated).toHaveLength(0);
  });

  it('treats a second tap as already activated, not as an error', async () => {
    lookupRows = [tokenRow({ consumedAt: new Date() })];

    const res = await service.join('again');

    expect(res.status).toBe('already_activated');
    // Nothing re-consumed, and no second session handed out.
    expect(updated).toHaveLength(0);
    expect(auth.issueSessionForVerifiedUser).not.toHaveBeenCalled();
  });

  it('consumes the token, activates the membership and issues a session', async () => {
    lookupRows = [tokenRow()];

    const res = await service.join('good');

    expect(res.status).toBe('joined');
    expect(res.auth).toEqual({ accessToken: 'jwt' });
    // Both writes, in the same tenant-scoped transaction.
    expect(updated).toEqual([joinTokens, userTenantMemberships]);
    expect(auth.issueSessionForVerifiedUser).toHaveBeenCalledWith('user-1');
  });

  it('refuses a token with no account behind it', async () => {
    // Parent tokens are issued even when the guardian has no login, so the row
    // can exist with a null user. There is nobody to log in as.
    lookupRows = [tokenRow({ userId: null })];

    const res = await service.join('orphan');

    expect(res.status).toBe('invalid');
  });

  it('counts only failures towards the flood limit', async () => {
    lookupRows = [];
    await service.join('nope');
    expect(redis.incr).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    redis.get.mockResolvedValue('0');
    lookupRows = [tokenRow()];
    await service.join('good');
    // A school's parents all opening their links at once must not lock the
    // shared wifi out of the endpoint.
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('will not let a signup handoff code open an invitation', async () => {
    lookupRows = [tokenRow({ purpose: 'signup_handoff' })];

    const res = await service.join('handoff-code');

    // Same opaque answer as an unknown token: the two doors are not
    // interchangeable, and saying so would confirm the code exists.
    expect(res.status).toBe('invalid');
    expect(updated).toHaveLength(0);
  });

  it('spends a handoff code and issues the session without flipping anything', async () => {
    lookupRows = [tokenRow({ purpose: 'signup_handoff' })];

    const res = await service.handoff('handoff-code');

    expect(res.status).toBe('joined');
    expect(res.auth).toEqual({ accessToken: 'jwt' });
    // Signup already created the membership active — only the code is spent.
    expect(updated).toEqual([joinTokens]);
  });

  it('will not let an invitation be spent as a handoff', async () => {
    lookupRows = [tokenRow({ purpose: 'parent_profile' })];

    const res = await service.handoff('a-parent-link');

    expect(res.status).toBe('invalid');
    expect(updated).toHaveLength(0);
  });

  it('treats a replayed handoff redirect as already activated', async () => {
    lookupRows = [tokenRow({ purpose: 'signup_handoff', consumedAt: new Date() })];

    const res = await service.handoff('handoff-code');

    expect(res.status).toBe('already_activated');
    expect(auth.issueSessionForVerifiedUser).not.toHaveBeenCalled();
  });

  it('stops answering once an IP has burned through its failures', async () => {
    redis.get.mockResolvedValue(String(10));
    redis.ttl.mockResolvedValue(600);

    await expect(service.join('guess')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
