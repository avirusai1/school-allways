import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TransportService } from './transport.service';

describe('TransportService', () => {
  const redis = {
    set: vi.fn(),
    mget: vi.fn(),
    get: vi.fn(),
    keys: vi.fn(),
    lpop: vi.fn(),
    pipeline: vi.fn(),
    publish: vi.fn(),
  };

  const pipe = {
    rpush: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };

  const db = {
    run: vi.fn(),
    asTenant: vi.fn(),
  };

  const notifications = {
    notify: vi.fn().mockResolvedValue({ queued: 1, deferred: false }),
  };

  let service: TransportService;

  beforeEach(() => {
    vi.clearAllMocks();
    redis.pipeline.mockReturnValue(pipe);
    redis.set.mockResolvedValue('OK');
    redis.publish.mockResolvedValue(1);
    service = new TransportService(db as never, notifications as never, redis as never);
  });

  it('ingestPings writes Redis live + buffer, zero DB writes on the request path', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    const result = await RequestContextStore.run(
      {
        ...createEmptyContext('r1'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'u-1',
      },
      () =>
        service.ingestPings({
          vehicleId: '11111111-1111-1111-1111-111111111111',
          tripId: '22222222-2222-2222-2222-222222222222',
          pings: [
            {
              at: '2026-08-10T02:31:00Z',
              lat: '28.7041',
              lng: '77.1025',
              speedKmph: 34,
            },
          ],
        }),
    );

    expect(result.dbWritesOnPath).toBe(0);
    expect(result.liveStored).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      'bus:live:11111111-1111-1111-1111-111111111111',
      expect.any(String),
      'EX',
      300,
    );
    expect(pipe.rpush).toHaveBeenCalled();
    expect(db.run).not.toHaveBeenCalled();
    expect(db.asTenant).not.toHaveBeenCalled();
  });

  it('livePositions serves entirely from Redis MGET', async () => {
    db.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: () => ({
          from: () => ({
            where: () =>
              Promise.resolve([{ id: 'v1' }, { id: 'v2' }]),
          }),
        }),
      }),
    );
    redis.mget.mockResolvedValue([
      JSON.stringify({ lat: '1', lng: '2', at: 't' }),
      null,
    ]);

    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    const branchGrant = {
      code: 'transport.tracking.read',
      scope: 'branch' as const,
    };

    const result = await RequestContextStore.run(
      {
        ...createEmptyContext('r2'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'u-1',
      },
      () => service.livePositions(undefined, branchGrant),
    );

    expect(result.source).toBe('redis');
    expect(redis.mget).toHaveBeenCalledWith('bus:live:v1', 'bus:live:v2');
    expect(result.vehicles).toHaveLength(2);
    expect(result.vehicles[0]!.live).toMatchObject({ lat: '1' });
    expect(result.vehicles[1]!.live).toBeNull();
  });

  it('a parent sees only the bus their child rides', async () => {
    db.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        selectDistinct: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => Promise.resolve([{ vehicleId: 'bus-of-child-1' }]),
            }),
          }),
        }),
      }),
    );
    redis.mget.mockResolvedValue([
      JSON.stringify({ lat: '28.7', lng: '77.1', at: 't' }),
    ]);

    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    const grant = {
      code: 'transport.tracking.read',
      scope: 'self' as const,
      studentIds: ['child-1'],
    };

    const result = await RequestContextStore.run(
      {
        ...createEmptyContext('r-parent-bus'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'parent-1',
      },
      () => service.livePositions(undefined, grant),
    );

    expect(result.vehicles.map((v) => v.vehicleId)).toEqual(['bus-of-child-1']);
  });

  it('a parent with no transport allocation sees zero buses', async () => {
    db.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        selectDistinct: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => Promise.resolve([]),
            }),
          }),
        }),
      }),
    );

    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    const emptyKids = {
      code: 'transport.tracking.read',
      scope: 'self' as const,
      studentIds: [] as string[],
    };

    const result = await RequestContextStore.run(
      {
        ...createEmptyContext('r-parent-none'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'parent-1',
      },
      () => service.livePositions(undefined, emptyKids),
    );

    expect(result.vehicles).toHaveLength(0);
    expect(redis.mget).not.toHaveBeenCalled();
    expect(db.run).toHaveBeenCalled();
  });

  it('a principal at branch scope still sees all buses', async () => {
    db.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: () => ({
          from: () => ({
            where: () =>
              Promise.resolve([{ id: 'bus-a' }, { id: 'bus-b' }, { id: 'bus-c' }]),
          }),
        }),
      }),
    );
    redis.mget.mockResolvedValue([null, null, null]);

    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    const grant = {
      code: 'transport.tracking.read',
      scope: 'branch' as const,
    };

    const result = await RequestContextStore.run(
      {
        ...createEmptyContext('r-principal'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'principal-1',
      },
      () => service.livePositions(undefined, grant),
    );

    expect(result.vehicles).toHaveLength(3);
    expect(redis.mget).toHaveBeenCalledWith(
      'bus:live:bus-a',
      'bus:live:bus-b',
      'bus:live:bus-c',
    );
  });

  it('a driver cannot end another driver’s trip', async () => {
    const { ForbiddenException } = await import('@nestjs/common');
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    db.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve([
                  {
                    id: 'trip-other',
                    routeId: 'route-b',
                    branchId: 'br-1',
                    driverStaffId: 'driver-other',
                    attendantStaffId: null,
                    boardedCount: 0,
                  },
                ]),
            }),
          }),
        }),
      }),
    );

    // Second select (staff lookup) — chain for self-scope path after first returns trip.
    let selectCalls = 0;
    db.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      selectCalls = 0;
      return fn({
        select: () => {
          selectCalls += 1;
          return {
            from: () => ({
              where: () => ({
                limit: () =>
                  Promise.resolve(
                    selectCalls === 1
                      ? [
                          {
                            id: 'trip-other',
                            routeId: 'route-b',
                            branchId: 'br-1',
                            driverStaffId: 'driver-other',
                            attendantStaffId: null,
                            boardedCount: 0,
                          },
                        ]
                      : [{ id: 'driver-me' }],
                  ),
              }),
            }),
          };
        },
      });
    });

    const grant = {
      code: 'transport.trip.operate',
      scope: 'self' as const,
    };

    await expect(
      RequestContextStore.run(
        {
          ...createEmptyContext('end-trip-idor'),
          tenantId: 'ten-1',
          branchId: 'br-1',
          userId: 'driver-user',
        },
        () => service.endTrip('trip-other', grant),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a driver cannot record boarding on another route’s trip', async () => {
    const { ForbiddenException } = await import('@nestjs/common');
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    let selectCalls = 0;
    db.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      selectCalls = 0;
      return fn({
        select: () => {
          selectCalls += 1;
          return {
            from: () => ({
              where: () => ({
                limit: () =>
                  Promise.resolve(
                    selectCalls === 1
                      ? [
                          {
                            id: 'trip-other',
                            routeId: 'route-b',
                            branchId: 'br-1',
                            driverStaffId: 'driver-other',
                            attendantStaffId: null,
                            boardedCount: 0,
                          },
                        ]
                      : [{ id: 'driver-me' }],
                  ),
              }),
            }),
          };
        },
      });
    });

    const grant = {
      code: 'transport.trip.operate',
      scope: 'self' as const,
    };

    await expect(
      RequestContextStore.run(
        {
          ...createEmptyContext('board-idor'),
          tenantId: 'ten-1',
          branchId: 'br-1',
          userId: 'driver-user',
        },
        () =>
          service.recordBoarding(
            'trip-other',
            {
              events: [
                {
                  studentId: '11111111-1111-1111-1111-111111111111',
                  event: 'boarded',
                  at: '2026-08-10T02:31:00Z',
                },
              ],
            },
            grant,
          ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a parent cannot list stops for a route their child does not ride', async () => {
    const { ForbiddenException } = await import('@nestjs/common');
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    let selectCalls = 0;
    db.run.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      selectCalls = 0;
      return fn({
        select: () => {
          selectCalls += 1;
          return {
            from: () => ({
              where: () => ({
                limit: () =>
                  Promise.resolve(
                    selectCalls === 1
                      ? [{ id: 'route-b', branchId: 'br-1' }]
                      : [],
                  ),
                orderBy: () => Promise.resolve([]),
              }),
            }),
          };
        },
      });
    });

    const grant = {
      code: 'transport.route.read',
      scope: 'self' as const,
      studentIds: ['child-1'],
    };

    await expect(
      RequestContextStore.run(
        {
          ...createEmptyContext('stops-idor'),
          tenantId: 'ten-1',
          branchId: 'br-1',
          userId: 'parent-1',
        },
        () => service.listStops('route-b', grant),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('broadcast throttle uses NX so only one publish per 15s', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    redis.set
      .mockResolvedValueOnce('OK') // live
      .mockResolvedValueOnce('OK') // bcast NX success
      .mockResolvedValueOnce('OK') // live again
      .mockResolvedValueOnce(null); // bcast NX fail

    await RequestContextStore.run(
      {
        ...createEmptyContext('r3'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'u-1',
      },
      async () => {
        const first = await service.ingestPings({
          vehicleId: 'v-a',
          pings: [{ at: '2026-08-10T02:31:00Z', lat: '1', lng: '2' }],
        });
        const second = await service.ingestPings({
          vehicleId: 'v-a',
          pings: [{ at: '2026-08-10T02:31:05Z', lat: '1.1', lng: '2.1' }],
        });
        expect(first.broadcast).toBe(true);
        expect(second.broadcast).toBe(false);
      },
    );

    expect(redis.publish).toHaveBeenCalledTimes(1);
  });
});
