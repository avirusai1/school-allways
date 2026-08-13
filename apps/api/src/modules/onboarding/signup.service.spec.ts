import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../../common/context/request-context';
import { SignupService } from './signup.service';

/**
 * These cover the two things that only break under real row-level security, so
 * both bugs they guard shipped unnoticed: the slug probe reading `tenants`
 * without a context that can see other schools (every school thinks its name is
 * free, then the insert collides), and the handoff silently pointing at
 * "undefined/handoff" when ADMIN_WEB_URL is unset.
 */
describe('SignupService', () => {
  const db = {
    run: vi.fn(),
    runUnscoped: vi.fn(),
    asTenant: vi.fn(),
  };

  let service: SignupService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SignupService(db as never, {} as never, {} as never);
  });

  describe('allocateSlug', () => {
    /**
     * Answers "taken" to the first `collisions` probes and "free" after that,
     * which is how the database behaves as the candidate gains a suffix.
     */
    function probeWith(collisions: number) {
      let seen = 0;
      return vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => (seen++ < collisions ? [{ id: 'x' }] : []),
              }),
            }),
          }),
        };
        return fn(tx);
      });
    }

    it('probes with a context that can see other schools', async () => {
      let sawPlatformAdmin: boolean | undefined;
      db.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        sawPlatformAdmin = RequestContextStore.peek()?.isPlatformAdmin;
        return probeWith(0)(fn);
      });

      const slug = await (
        service as unknown as { allocateSlug(n: string): Promise<string> }
      ).allocateSlug('Greenfield Academy');

      expect(slug).toBe('greenfield-academy');
      // Without this the `tenant_self` policy hides every existing tenant and
      // the probe is a no-op that always answers "free".
      expect(sawPlatformAdmin).toBe(true);
    });

    it('suffixes when the name is already taken', async () => {
      db.run.mockImplementation(probeWith(1));

      const slug = await (
        service as unknown as { allocateSlug(n: string): Promise<string> }
      ).allocateSlug('Greenfield Academy');

      expect(slug).toBe('greenfield-academy-2');
    });
  });

  describe('issueHandoff', () => {
    const issue = (t: string, b: string, u: string) =>
      (
        service as unknown as {
          issueHandoff(t: string, b: string, u: string): Promise<string>;
        }
      ).issueHandoff(t, b, u);

    it('refuses to hand a new school over to nowhere', async () => {
      const previous = process.env.ADMIN_WEB_URL;
      delete process.env.ADMIN_WEB_URL;

      await expect(issue('t1', 'b1', 'u1')).rejects.toThrow(
        /could not open the setup wizard/i,
      );

      if (previous) process.env.ADMIN_WEB_URL = previous;
    });

    it('hands over a one-time code, never the session', async () => {
      process.env.ADMIN_WEB_URL = 'https://admin.example.com/';
      const values = vi.fn().mockResolvedValue(undefined);
      db.asTenant.mockImplementation(
        async (_t: string, fn: (tx: unknown) => Promise<unknown>) =>
          fn({ insert: () => ({ values }) }),
      );

      const url = await issue('t1', 'b1', 'u1');

      expect(url).toMatch(/^https:\/\/admin\.example\.com\/handoff\?code=.+/);
      const row = values.mock.calls[0][0];
      expect(row.purpose).toBe('signup_handoff');
      // Hashed at rest: the code in the URL must not be recoverable from a
      // database dump.
      expect(url).not.toContain(row.tokenHash);
      // Minutes, not the 30 days an invitation gets.
      expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
    });
  });
});
