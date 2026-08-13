import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SyncService } from './sync.service';

describe('SyncService scope', () => {
  const tx = {
    select: vi.fn(),
    insert: vi.fn(),
  };

  const db = {
    run: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  let service: SyncService;

  function selectChain(rows: unknown[]) {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.from = self;
    chain.innerJoin = self;
    chain.where = self;
    chain.orderBy = self;
    chain.limit = () => Promise.resolve(rows);
    Object.assign(chain, {
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    });
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SyncService(db as never);
  });

  it('status returns counts only (no payloads) and pendingCount', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    // countPending + maxRowVersion per entity (3) + tombstone count + tombstone max
    tx.select.mockImplementation(() => selectChain([{ n: 0, max: '0' }]));

    const status = await RequestContextStore.run(
      {
        ...createEmptyContext('r1'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'teacher-a',
        permissions: new Map([
          [
            'homework.read',
            {
              code: 'homework.read',
              scope: 'section',
              sectionIds: ['sec-a'],
              subjectIds: [],
              studentIds: [],
            },
          ],
        ]),
      },
      () => service.status({ cursor: 100, entities: 'homework' }),
    );

    expect(status).toMatchObject({
      cursor: 100,
      hasChanges: false,
      pendingCount: 0,
    });
    expect(status).not.toHaveProperty('changes');
    expect(JSON.stringify(status).length).toBeLessThan(500);
  });

  it('pull applies section scope — empty section grant yields no rows', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    tx.select.mockImplementation(() => selectChain([]));

    const page = await RequestContextStore.run(
      {
        ...createEmptyContext('r2'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'teacher-a',
        permissions: new Map([
          [
            'homework.read',
            {
              code: 'homework.read',
              scope: 'section',
              sectionIds: [], // empty = MATCH NOTHING
              subjectIds: [],
              studentIds: [],
            },
          ],
        ]),
      },
      () => service.pull({ cursor: 0, entities: 'homework', limit: 50 }),
    );

    expect(page.changes).toEqual([]);
    expect(page.hasMore).toBe(false);
  });
});
