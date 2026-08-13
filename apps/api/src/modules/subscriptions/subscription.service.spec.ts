import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStore, createEmptyContext } from '../../common/context/request-context';
import { SubscriptionService } from './subscription.service';

const grant = {
  code: 'subscription.manual.activate',
  scope: 'tenant' as const,
  sectionIds: [],
  subjectIds: [],
  studentIds: [],
};

describe('SubscriptionService.manualActivate', () => {
  const existing = new Set<string>(['already-active']);
  const inserted: string[] = [];

  const tx = {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: async () =>
            [
              { id: 'already-active', branchId: 'b1', sectionId: 'sec1' },
              { id: 'fresh', branchId: 'b1', sectionId: 'sec1' },
            ],
        }),
        where: async () =>
          [...existing].map((studentId) => ({ studentId, status: 'active' as const })),
      }),
    }),
    insert: () => ({
      values: (rows: Array<{ studentId: string }>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const out: Array<{ studentId: string }> = [];
            for (const row of rows) {
              if (existing.has(row.studentId)) continue;
              existing.add(row.studentId);
              inserted.push(row.studentId);
              out.push({ studentId: row.studentId });
            }
            return out;
          },
        }),
      }),
    }),
  };

  const db = {
    run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  };

  let service: SubscriptionService;

  beforeEach(() => {
    inserted.length = 0;
    existing.clear();
    existing.add('already-active');
    service = new SubscriptionService(db as never);
    vi.spyOn(service as never, 'requireCurrentSession').mockResolvedValue({
      id: 'sess-1',
      name: '2026-27',
      endDate: '2027-03-31',
    });
  });

  it('skips an already-subscribed student and does not double-charge', async () => {
    const ctx = {
      ...createEmptyContext('r1'),
      tenantId: 't1',
      branchId: 'b1',
      userId: 'admin-1',
    };
    const result = await RequestContextStore.run(ctx, () =>
      service.manualActivate(
        {
          items: [
            { studentId: 'already-active' },
            { studentId: 'fresh' },
            { studentId: 'already-active' },
          ],
        },
        grant,
      ),
    );

    expect(result.activated).toEqual(['fresh']);
    expect(result.skipped).toContain('already-active');
    expect(result.skippedReasons['already-active']).toMatch(/Already subscribed/);
    expect(result.billedAmountPaise).toBe(36_500);
    expect(inserted).toEqual(['fresh']);
  });
});
