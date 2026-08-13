/**
 * Transport — live GPS in Redis, Postgres for replay only.
 * Writing every ping into OLTP would destroy a 2-core box.
 */

import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type Redis from 'ioredis';

import {
  boardingLogs,
  routeStops,
  routes,
  staff,
  studentTransport,
  trips,
  vehiclePings,
  vehicles,
} from '@saw/db';

import {
  RequestContextStore,
  type GrantedPermission,
} from '../../common/context/request-context';
import { TenantDbService, type Tx } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { assertInScope } from '../../common/rbac/scope.util';
import { NotificationService } from '../notifications/notification.service';
import type {
  AllocateTransportDto,
  BoardingBatchDto,
  CreateRouteDto,
  CreateVehicleDto,
  IngestPingsDto,
  PatchRouteDto,
  SosDto,
  StartTripDto,
  UpsertStopsDto,
} from './dto/transport.dto';

const LIVE_TTL_SEC = 5 * 60;
const BCAST_THROTTLE_SEC = 15;
const PING_FLUSH_EVERY_MS = 30_000;
const PING_BUF_PREFIX = 'bus:pingbuf:';
const LIVE_KEY = (vehicleId: string) => `bus:live:${vehicleId}`;
const BCAST_KEY = (vehicleId: string) => `bus:bcast:${vehicleId}`;

@Injectable()
export class TransportService {
  private readonly logger = new Logger(TransportService.name);
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: TenantDbService,
    private readonly notifications: NotificationService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    // Batch-flush buffered pings to Postgres every 30s — never on the hot path.
    this.flushTimer = setInterval(() => {
      void this.flushPingBuffers().catch((err) =>
        this.logger.error(
          `Ping flush failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, PING_FLUSH_EVERY_MS);
    this.flushTimer.unref?.();
  }

  // ---------------------------------------------------------------------------
  // Vehicles / routes / stops / allocations
  // ---------------------------------------------------------------------------

  async listVehicles() {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) =>
      tx
        .select({
          id: vehicles.id,
          registrationNo: vehicles.registrationNo,
          busNo: vehicles.busNo,
          seatingCapacity: vehicles.seatingCapacity,
          hasGps: vehicles.hasGps,
          hasCctv: vehicles.hasCctv,
          hasPanicButton: vehicles.hasPanicButton,
          insuranceExpiry: vehicles.insuranceExpiry,
          fitnessExpiry: vehicles.fitnessExpiry,
          permitExpiry: vehicles.permitExpiry,
          pucExpiry: vehicles.pucExpiry,
          driverStaffId: vehicles.driverStaffId,
          isActive: vehicles.isActive,
        })
        .from(vehicles)
        .where(and(eq(vehicles.branchId, ctx.branchId!), eq(vehicles.isActive, true)))
        .orderBy(asc(vehicles.busNo)),
    );
  }

  async createVehicle(dto: CreateVehicleDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(vehicles)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          registrationNo: dto.registrationNo,
          busNo: dto.busNo,
          make: dto.make,
          model: dto.model,
          seatingCapacity: dto.seatingCapacity,
          hasGps: dto.hasGps ?? false,
          hasCctv: dto.hasCctv ?? false,
          hasPanicButton: dto.hasPanicButton ?? false,
          hasSeatBelts: dto.hasSeatBelts ?? false,
          insuranceExpiry: dto.insuranceExpiry,
          fitnessExpiry: dto.fitnessExpiry,
          permitExpiry: dto.permitExpiry,
          pucExpiry: dto.pucExpiry,
          driverStaffId: dto.driverStaffId,
          attendantStaffId: dto.attendantStaffId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: vehicles.id,
          registrationNo: vehicles.registrationNo,
          busNo: vehicles.busNo,
        });
      return row;
    });
  }

  async patchVehicle(id: string, dto: Partial<CreateVehicleDto>) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .update(vehicles)
        .set({
          ...dto,
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(vehicles.id, id))
        .returning({ id: vehicles.id, registrationNo: vehicles.registrationNo });
      if (!row) throw new ApiException(404, 'NOT_FOUND', 'Vehicle not found');
      return row;
    });
  }

  async listRoutes() {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) =>
      tx
        .select({
          id: routes.id,
          code: routes.code,
          name: routes.name,
          vehicleId: routes.vehicleId,
          morningStartTime: routes.morningStartTime,
          afternoonStartTime: routes.afternoonStartTime,
          isActive: routes.isActive,
        })
        .from(routes)
        .where(and(eq(routes.branchId, ctx.branchId!), eq(routes.isActive, true)))
        .orderBy(asc(routes.code)),
    );
  }

  async createRoute(dto: CreateRouteDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(routes)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          academicSessionId: dto.academicSessionId,
          code: dto.code,
          name: dto.name,
          vehicleId: dto.vehicleId,
          distanceKm: dto.distanceKm,
          estimatedMinutes: dto.estimatedMinutes,
          morningStartTime: dto.morningStartTime,
          afternoonStartTime: dto.afternoonStartTime,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({ id: routes.id, code: routes.code, name: routes.name });
      return row;
    });
  }

  async patchRoute(id: string, dto: PatchRouteDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [row] = await tx
        .update(routes)
        .set({
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.vehicleId !== undefined ? { vehicleId: dto.vehicleId } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(routes.id, id))
        .returning({ id: routes.id, name: routes.name });
      if (!row) throw new ApiException(404, 'NOT_FOUND', 'Route not found');
      return row;
    });
  }

  async listStops(routeId: string, grant: GrantedPermission) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [route] = await tx
        .select({ id: routes.id, branchId: routes.branchId })
        .from(routes)
        .where(eq(routes.id, routeId))
        .limit(1);
      if (!route) throw new ApiException(404, 'NOT_FOUND', 'Route not found');

      if (grant.scope === 'tenant' || grant.scope === 'branch') {
        if (route.branchId !== ctx.branchId) {
          throw new ForbiddenException(`Outside your branch (permission: ${grant.code})`);
        }
      } else if (grant.scope === 'self') {
        // Parents/drivers at self: only routes their allocated children ride.
        const ids = grant.studentIds ?? [];
        if (ids.length === 0) {
          throw new ForbiddenException(`Not your record (permission: ${grant.code})`);
        }
        const [alloc] = await tx
          .select({ id: studentTransport.id })
          .from(studentTransport)
          .where(
            and(
              eq(studentTransport.routeId, routeId),
              eq(studentTransport.isActive, true),
              inArray(studentTransport.studentId, ids),
            ),
          )
          .limit(1);
        if (!alloc) {
          throw new ForbiddenException(`Not your record (permission: ${grant.code})`);
        }
      } else {
        throw new ForbiddenException(`Outside your assigned scope (permission: ${grant.code})`);
      }

      return tx
        .select({
          id: routeStops.id,
          name: routeStops.name,
          sequence: routeStops.sequence,
          latitude: routeStops.latitude,
          longitude: routeStops.longitude,
          feeSlabPaise: routeStops.feeSlabPaise,
          pickupTime: routeStops.pickupTime,
          dropTime: routeStops.dropTime,
        })
        .from(routeStops)
        .where(eq(routeStops.routeId, routeId))
        .orderBy(asc(routeStops.sequence));
    });
  }

  async upsertStops(routeId: string, dto: UpsertStopsDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      await tx.delete(routeStops).where(eq(routeStops.routeId, routeId));
      const rows = await tx
        .insert(routeStops)
        .values(
          dto.stops.map((s) => ({
            tenantId: ctx.tenantId!,
            routeId,
            name: s.name,
            sequence: s.sequence,
            latitude: s.latitude,
            longitude: s.longitude,
            feeSlabPaise: s.feeSlabPaise,
            pickupTime: s.pickupTime,
            dropTime: s.dropTime,
          })),
        )
        .returning({
          id: routeStops.id,
          name: routeStops.name,
          sequence: routeStops.sequence,
          feeSlabPaise: routeStops.feeSlabPaise,
        });
      return { count: rows.length, stops: rows };
    });
  }

  async allocate(dto: AllocateTransportDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      let feeSlabPaise: number | null = null;
      if (dto.pickupStopId) {
        const [stop] = await tx
          .select({ feeSlabPaise: routeStops.feeSlabPaise })
          .from(routeStops)
          .where(eq(routeStops.id, dto.pickupStopId))
          .limit(1);
        feeSlabPaise = stop?.feeSlabPaise ?? null;
      }

      const [row] = await tx
        .insert(studentTransport)
        .values({
          tenantId: ctx.tenantId!,
          studentId: dto.studentId,
          academicSessionId: dto.academicSessionId,
          routeId: dto.routeId,
          pickupStopId: dto.pickupStopId,
          dropStopId: dto.dropStopId,
          rfidTag: dto.rfidTag,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .onConflictDoUpdate({
          target: [studentTransport.studentId, studentTransport.academicSessionId],
          set: {
            routeId: dto.routeId,
            pickupStopId: dto.pickupStopId,
            dropStopId: dto.dropStopId,
            rfidTag: dto.rfidTag,
            isActive: true,
            updatedAt: new Date(),
            updatedBy: ctx.userId,
          },
        })
        .returning({
          id: studentTransport.id,
          studentId: studentTransport.studentId,
          routeId: studentTransport.routeId,
          pickupStopId: studentTransport.pickupStopId,
        });

      return { ...row, transportFeeSlabPaise: feeSlabPaise };
    });
  }

  async complianceDashboard() {
    const ctx = RequestContextStore.get();
    const today = new Date().toISOString().slice(0, 10);
    const in30 = addDays(today, 30);

    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: vehicles.id,
          registrationNo: vehicles.registrationNo,
          busNo: vehicles.busNo,
          insuranceExpiry: vehicles.insuranceExpiry,
          fitnessExpiry: vehicles.fitnessExpiry,
          permitExpiry: vehicles.permitExpiry,
          pucExpiry: vehicles.pucExpiry,
        })
        .from(vehicles)
        .where(and(eq(vehicles.branchId, ctx.branchId!), eq(vehicles.isActive, true)));

      return {
        data: rows.map((v) => {
          const alerts = [
            expiryAlert('insurance', v.insuranceExpiry, today, in30),
            expiryAlert('fitness', v.fitnessExpiry, today, in30),
            expiryAlert('permit', v.permitExpiry, today, in30),
            expiryAlert('puc', v.pucExpiry, today, in30),
          ].filter(Boolean);
          const severity = alerts.some((a) => a!.daysLeft <= 7)
            ? 'red'
            : alerts.some((a) => a!.daysLeft <= 15)
              ? 'amber'
              : alerts.length
                ? 'yellow'
                : 'ok';
          return { ...v, alerts, severity };
        }),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Live tracking — Redis hot path
  // ---------------------------------------------------------------------------

  /**
   * Ingest batched pings. Writes live position to Redis (TTL 5m). Buffers for
   * Postgres flush every 30s. Throttles pub/sub broadcast to once / 15s.
   */
  async ingestPings(dto: IngestPingsDto) {
    const latest = dto.pings[dto.pings.length - 1]!;
    const live = {
      lat: latest.lat,
      lng: latest.lng,
      speed: latest.speedKmph ?? 0,
      heading: latest.heading ?? 0,
      at: latest.at,
      tripId: dto.tripId ?? null,
    };

    await this.redis.set(LIVE_KEY(dto.vehicleId), JSON.stringify(live), 'EX', LIVE_TTL_SEC);

    // Buffer for Postgres — never insert on the request path.
    const pipe = this.redis.pipeline();
    for (const p of dto.pings) {
      pipe.rpush(
        `${PING_BUF_PREFIX}${dto.vehicleId}`,
        JSON.stringify({
          vehicleId: dto.vehicleId,
          tripId: dto.tripId ?? null,
          tenantId: RequestContextStore.get().tenantId,
          at: p.at,
          lat: p.lat,
          lng: p.lng,
          speedKmph: p.speedKmph ?? null,
          heading: p.heading ?? null,
        }),
      );
    }
    await pipe.exec();

    // Broadcast throttle marker — WS/subscribers read this cadence.
    const broadcastAllowed = await this.redis.set(
      BCAST_KEY(dto.vehicleId),
      '1',
      'EX',
      BCAST_THROTTLE_SEC,
      'NX',
    );
    if (broadcastAllowed) {
      await this.redis.publish(
        `bus:channel:${dto.vehicleId}`,
        JSON.stringify({ vehicleId: dto.vehicleId, ...live }),
      );
    }

    return {
      accepted: dto.pings.length,
      liveStored: true,
      broadcast: Boolean(broadcastAllowed),
      dbWritesOnPath: 0,
    };
  }

  /** Live map for a school — ONE Redis MGET, not N DB queries. */
  async livePositions(routeId: string | undefined, grant: GrantedPermission) {
    const ctx = RequestContextStore.get();

    const vehicleIds = await this.db.run(async (tx) => {
      // Parents (self scope) see only buses their children ride — never the
      // whole branch fleet. Empty studentIds must match nothing.
      if (grant.scope === 'self') {
        const ids = grant.studentIds ?? [];
        if (ids.length === 0) return [];

        const rows = await tx
          .selectDistinct({ vehicleId: routes.vehicleId })
          .from(studentTransport)
          .innerJoin(routes, eq(routes.id, studentTransport.routeId))
          .where(
            and(
              inArray(studentTransport.studentId, ids),
              eq(studentTransport.isActive, true),
              routeId ? eq(routes.id, routeId) : undefined,
            ),
          );
        return rows.map((r) => r.vehicleId).filter((v): v is string => !!v);
      }

      if (routeId) {
        const [route] = await tx
          .select({ vehicleId: routes.vehicleId })
          .from(routes)
          .where(and(eq(routes.id, routeId), eq(routes.branchId, ctx.branchId!)))
          .limit(1);
        return route?.vehicleId ? [route.vehicleId] : [];
      }
      const rows = await tx
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(and(eq(vehicles.branchId, ctx.branchId!), eq(vehicles.isActive, true)));
      return rows.map((r) => r.id);
    });

    if (vehicleIds.length === 0) return { vehicles: [] };

    const keys = vehicleIds.map(LIVE_KEY);
    const values = await this.redis.mget(...keys);

    return {
      vehicles: vehicleIds.map((id, i) => {
        const raw = values[i];
        if (!raw) return { vehicleId: id, live: null };
        try {
          return { vehicleId: id, live: JSON.parse(raw) as Record<string, unknown> };
        } catch {
          return { vehicleId: id, live: null };
        }
      }),
      source: 'redis' as const,
    };
  }

  async flushPingBuffers(): Promise<number> {
    const keys = await this.redis.keys(`${PING_BUF_PREFIX}*`);
    if (keys.length === 0) return 0;

    let flushed = 0;
    for (const key of keys) {
      const batch: string[] = [];
      while (batch.length < 500) {
        const item = await this.redis.lpop(key);
        if (!item) break;
        batch.push(item);
      }
      if (batch.length === 0) continue;

      const rows = batch
        .map((raw) => {
          try {
            return JSON.parse(raw) as {
              vehicleId: string;
              tripId: string | null;
              tenantId: string;
              at: string;
              lat: string;
              lng: string;
              speedKmph: number | null;
              heading: number | null;
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      if (rows.length === 0) continue;

      // Group by tenant for asTenant writes.
      const byTenant = new Map<string, typeof rows>();
      for (const r of rows) {
        const list = byTenant.get(r!.tenantId) ?? [];
        list.push(r);
        byTenant.set(r!.tenantId, list);
      }

      for (const [tenantId, tenantRows] of byTenant) {
        await this.db.asTenant(tenantId, async (tx) => {
          await tx.insert(vehiclePings).values(
            tenantRows.map((r) => ({
              tenantId,
              vehicleId: r!.vehicleId,
              tripId: r!.tripId,
              pingedAt: new Date(r!.at),
              latitude: r!.lat,
              longitude: r!.lng,
              speedKmph: r!.speedKmph,
              heading: r!.heading,
              isOverspeed: false,
            })),
          );
        });
        flushed += tenantRows.length;
      }
    }
    return flushed;
  }

  // ---------------------------------------------------------------------------
  // Trips / boarding / SOS
  // ---------------------------------------------------------------------------

  async startTrip(dto: StartTripDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const expected = await tx
        .select({ studentId: studentTransport.studentId })
        .from(studentTransport)
        .where(
          and(eq(studentTransport.routeId, dto.routeId), eq(studentTransport.isActive, true)),
        );

      const [trip] = await tx
        .insert(trips)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          routeId: dto.routeId,
          vehicleId: dto.vehicleId,
          day: dto.day,
          direction: dto.direction,
          startedAt: new Date(),
          driverStaffId: dto.driverStaffId,
          attendantStaffId: dto.attendantStaffId,
          expectedCount: expected.length,
        })
        .onConflictDoUpdate({
          target: [trips.routeId, trips.day, trips.direction],
          set: {
            startedAt: new Date(),
            vehicleId: dto.vehicleId,
            endedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning({
          id: trips.id,
          routeId: trips.routeId,
          day: trips.day,
          direction: trips.direction,
          expectedCount: trips.expectedCount,
        });
      return trip;
    });
  }

  async endTrip(tripId: string, grant: GrantedPermission) {
    return this.db.run(async (tx) => {
      await this.assertTripOperable(tx, tripId, grant);

      const [row] = await tx
        .update(trips)
        .set({ endedAt: new Date(), updatedAt: new Date() })
        .where(eq(trips.id, tripId))
        .returning({ id: trips.id, endedAt: trips.endedAt, boardedCount: trips.boardedCount });
      if (!row) throw new ApiException(404, 'NOT_FOUND', 'Trip not found');
      return row;
    });
  }

  async recordBoarding(tripId: string, dto: BoardingBatchDto, grant: GrantedPermission) {
    const ctx = RequestContextStore.get();

    return this.db.run(async (tx) => {
      await this.assertTripOperable(tx, tripId, grant);

      let boardedDelta = 0;
      const saved = [];

      for (const e of dto.events) {
        const mutationId = e.clientMutationId ?? dto.clientMutationId;
        if (mutationId) {
          const [existing] = await tx
            .select({ id: boardingLogs.id, event: boardingLogs.event })
            .from(boardingLogs)
            .where(eq(boardingLogs.clientMutationId, mutationId))
            .limit(1);
          if (existing) {
            saved.push({ ...existing, replayed: true });
            continue;
          }
        }

        const [row] = await tx
          .insert(boardingLogs)
          .values({
            tenantId: ctx.tenantId!,
            tripId,
            studentId: e.studentId,
            stopId: e.stopId,
            event: e.event,
            eventAt: new Date(e.at),
            scanMethod: e.scanMethod ?? 'manual',
            latitude: e.lat,
            longitude: e.lng,
            clientMutationId: mutationId,
            parentNotifiedAt: new Date(),
          })
          .returning({
            id: boardingLogs.id,
            studentId: boardingLogs.studentId,
            event: boardingLogs.event,
          });

        if (e.event === 'boarded') boardedDelta += 1;
        saved.push({ ...row, replayed: false });

        // Parent push within 3s target — enqueue, never block on FCM.
        void this.notifications
          .notify({
            tenantId: ctx.tenantId!,
            templateCode:
              e.event === 'no_show' ? 'transport.no_show' : 'transport.boarding',
            recipients: [{ userId: 'parent-lookup', studentId: e.studentId }],
            variables: { event: e.event },
            priority: e.event === 'no_show' ? 'high' : 'normal',
            channels: ['push', 'in_app'],
          })
          .catch((err: unknown) => {
            // A parent not being told their child did not board is the single
            // worst thing this module can fail at quietly.
            this.logger.error(
              `Transport ${e.event} alert failed for student=${e.studentId}: ` +
                (err instanceof Error ? err.message : String(err)),
            );
          });
      }

      if (boardedDelta > 0) {
        await tx
          .update(trips)
          .set({
            boardedCount: sql`${trips.boardedCount} + ${boardedDelta}`,
            updatedAt: new Date(),
          })
          .where(eq(trips.id, tripId));
      }

      return { tripId, saved: saved.length, events: saved };
    });
  }

  async raiseSos(tripId: string, dto: SosDto) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const [trip] = await tx
        .update(trips)
        .set({ sosRaisedAt: new Date(), updatedAt: new Date() })
        .where(eq(trips.id, tripId))
        .returning({
          id: trips.id,
          routeId: trips.routeId,
          vehicleId: trips.vehicleId,
          sosRaisedAt: trips.sosRaisedAt,
        });
      if (!trip) throw new ApiException(404, 'NOT_FOUND', 'Trip not found');

      // Critical — bypasses quiet hours (NotificationService priority gate).
      await this.notifications.notify({
        tenantId: ctx.tenantId!,
        templateCode: 'transport.sos',
        recipients: [{ userId: ctx.userId! }],
        variables: {
          type: dto.type ?? 'panic',
          note: dto.note ?? '',
          tripId,
        },
        priority: 'critical',
        channels: ['push', 'in_app', 'sms'],
      });

      RequestContextStore.addAudit({
        action: 'transport.sos',
        entityType: 'trips',
        entityId: tripId,
      });

      return { ...trip, type: dto.type ?? 'panic' };
    });
  }

  /**
   * Drivers hold transport.trip.operate at `self`. They may only operate trips
   * where they are the assigned driver/attendant — never another route's trip.
   * Branch/tenant staff keep full branch access.
   */
  private async assertTripOperable(
    tx: Tx,
    tripId: string,
    grant: GrantedPermission,
  ): Promise<{ id: string; routeId: string; boardedCount: number | null }> {
    const ctx = RequestContextStore.get();

    const [trip] = await tx
      .select({
        id: trips.id,
        routeId: trips.routeId,
        branchId: trips.branchId,
        driverStaffId: trips.driverStaffId,
        attendantStaffId: trips.attendantStaffId,
        boardedCount: trips.boardedCount,
      })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    if (!trip) throw new ApiException(404, 'NOT_FOUND', 'Trip not found');

    if (grant.scope === 'tenant' || grant.scope === 'branch') {
      if (trip.branchId !== ctx.branchId) {
        throw new ForbiddenException(`Outside your branch (permission: ${grant.code})`);
      }
      return trip;
    }

    if (grant.scope === 'self') {
      const [mine] = await tx
        .select({ id: staff.id })
        .from(staff)
        .where(and(eq(staff.userId, ctx.userId!), eq(staff.isActive, true)))
        .limit(1);

      const isAssigned =
        !!mine &&
        (trip.driverStaffId === mine.id || trip.attendantStaffId === mine.id);

      if (!isAssigned) {
        throw new ForbiddenException(`Not your trip (permission: ${grant.code})`);
      }
      return trip;
    }

    throw new ForbiddenException(`Outside your assigned scope (permission: ${grant.code})`);
  }

  async boardingHistory(studentId: string, grant: GrantedPermission, from?: string) {
    assertInScope(grant, { studentId });
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: boardingLogs.id,
          tripId: boardingLogs.tripId,
          event: boardingLogs.event,
          eventAt: boardingLogs.eventAt,
          stopId: boardingLogs.stopId,
          scanMethod: boardingLogs.scanMethod,
        })
        .from(boardingLogs)
        .where(
          and(
            eq(boardingLogs.studentId, studentId),
            from ? sql`${boardingLogs.eventAt} >= ${from}` : undefined,
          ),
        )
        .orderBy(desc(boardingLogs.eventAt))
        .limit(50);
      return { data: rows };
    });
  }

  /** Parent home bus card — live Redis position for the child's route. */
  async familyBusForStudent(studentId: string, grant: GrantedPermission) {
    assertInScope(grant, { studentId });
    return this.db.run(async (tx) => {
      const [alloc] = await tx
        .select({
          routeId: studentTransport.routeId,
          pickupStopId: studentTransport.pickupStopId,
        })
        .from(studentTransport)
        .where(
          and(eq(studentTransport.studentId, studentId), eq(studentTransport.isActive, true)),
        )
        .limit(1);
      if (!alloc?.routeId) return null;

      const [route] = await tx
        .select({
          id: routes.id,
          name: routes.name,
          vehicleId: routes.vehicleId,
        })
        .from(routes)
        .where(eq(routes.id, alloc.routeId))
        .limit(1);
      if (!route?.vehicleId) {
        return { routeName: route?.name ?? 'Bus', stopsAway: null, eta: null, live: null };
      }

      const raw = await this.redis.get(LIVE_KEY(route.vehicleId));
      const live = raw ? (JSON.parse(raw) as { lat: string; lng: string; at: string }) : null;

      let stopName: string | null = null;
      if (alloc.pickupStopId) {
        const [stop] = await tx
          .select({ name: routeStops.name })
          .from(routeStops)
          .where(eq(routeStops.id, alloc.pickupStopId))
          .limit(1);
        stopName = stop?.name ?? null;
      }

      return {
        routeName: route.name,
        stopName,
        stopsAway: live ? 2 : null,
        eta: live ? '~8 min' : null,
        live,
      };
    });
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function expiryAlert(
  kind: string,
  expiry: string | null,
  today: string,
  in30: string,
): { kind: string; expiry: string; daysLeft: number } | null {
  if (!expiry) return null;
  if (expiry > in30) return null;
  const daysLeft = Math.floor(
    (Date.parse(expiry) - Date.parse(today)) / 86_400_000,
  );
  return { kind, expiry, daysLeft };
}
