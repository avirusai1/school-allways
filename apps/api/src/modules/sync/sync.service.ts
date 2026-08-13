/**
 * Click-to-sync engine (docs/04 + build/08).
 *
 * /sync/status is the ONLY cold-start call — counts only, no payloads.
 * /sync/pull is user-triggered and MUST apply scopeFilter per entity —
 * treating sync as "infrastructure" is the most likely leak in the product.
 */

import { Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

import {
  announcements,
  homework,
  marks,
  marksSheets,
  syncCursors,
  syncTombstones,
} from '@saw/db';

import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService, type Tx } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { scopeFilter, type ScopeColumns } from '../../common/rbac/scope.util';
import {
  SYNC_ENTITY_TYPES,
  type SyncAckDto,
  type SyncEntityType,
} from './dto/sync.dto';

export interface SyncEntityChange {
  entity: string;
  id: string;
  rowVersion: number;
  payload: Record<string, unknown>;
  deleted: boolean;
}

@Injectable()
export class SyncService {
  constructor(private readonly db: TenantDbService) {}

  async status(opts: {
    cursor?: number;
    deviceId?: string;
    entities?: string;
  }) {
    const cursor = BigInt(opts.cursor ?? 0);
    const entities = this.parseEntities(opts.entities);

    return this.db.run(async (tx) => {
      const pending: Record<string, number> = {};
      let pendingCount = 0;
      let serverCursor = Number(cursor);

      for (const entity of entities) {
        const count = await this.countPending(tx, entity, cursor);
        pending[entity] = count;
        pendingCount += count;

        const maxRv = await this.maxRowVersion(tx, entity);
        if (maxRv > serverCursor) serverCursor = maxRv;
      }

      const tombstoneCount = await this.countTombstones(tx, entities, cursor);
      pendingCount += tombstoneCount;
      if (tombstoneCount > 0) pending.tombstones = tombstoneCount;

      const tombstoneMax = await this.maxTombstoneVersion(tx, entities);
      if (tombstoneMax > serverCursor) serverCursor = tombstoneMax;

      // Keep status tiny — no payloads, just the badge numbers.
      return {
        cursor: Number(cursor),
        serverCursor,
        hasChanges: pendingCount > 0,
        pending,
        pendingCount,
        lastSyncedAt: null as string | null,
      };
    });
  }

  async pull(opts: {
    cursor?: number;
    entities?: string;
    limit?: number;
    deviceId?: string;
  }) {
    const cursor = BigInt(opts.cursor ?? 0);
    // Cap at 500 regardless of the request — protects the 2-core box.
    const limit = Math.min(opts.limit ?? 200, 500);
    const entities = this.parseEntities(opts.entities);
    const ctx = RequestContextStore.get();

    return this.db.run(async (tx) => {
      const changes: SyncEntityChange[] = [];
      let maxSeen = Number(cursor);

      for (const entity of entities) {
        const rows = await this.pullEntity(tx, entity, cursor, limit);
        for (const row of rows) {
          changes.push(row);
          if (row.rowVersion > maxSeen) maxSeen = row.rowVersion;
        }
      }

      const tombs = await this.pullTombstones(tx, entities, cursor, limit);
      for (const t of tombs) {
        changes.push({
          entity: t.entityType,
          id: t.entityId,
          rowVersion: Number(t.rowVersion),
          payload: {},
          deleted: true,
        });
        if (Number(t.rowVersion) > maxSeen) maxSeen = Number(t.rowVersion);
      }

      // Sort by rowVersion so the client can advance the cursor monotonically.
      changes.sort((a, b) => a.rowVersion - b.rowVersion);
      const page = changes.slice(0, limit);
      const hasMore = changes.length > limit;
      const nextCursor =
        page.length > 0 ? page[page.length - 1]!.rowVersion : Number(cursor);

      if (opts.deviceId && ctx.userId) {
        // Record progress server-side — never trust the client's claim alone.
        for (const entity of entities) {
          await tx
            .insert(syncCursors)
            .values({
              tenantId: ctx.tenantId!,
              userId: ctx.userId,
              deviceId: opts.deviceId,
              entityType: entity,
              lastRowVersion: BigInt(nextCursor),
              lastSyncedAt: new Date(),
              pendingCount: 0,
            })
            .onConflictDoUpdate({
              target: [
                syncCursors.userId,
                syncCursors.deviceId,
                syncCursors.entityType,
              ],
              set: {
                lastRowVersion: BigInt(nextCursor),
                lastSyncedAt: new Date(),
                pendingCount: 0,
                updatedAt: new Date(),
              },
            });
        }
      }

      return {
        changes: page,
        tombstones: tombs.map((t) => ({
          entityType: t.entityType,
          entityId: t.entityId,
          rowVersion: Number(t.rowVersion),
        })),
        cursor: nextCursor,
        nextCursor,
        hasMore,
      };
    });
  }

  async ack(dto: SyncAckDto) {
    const ctx = RequestContextStore.get();
    if (!ctx.userId) {
      throw new ApiException(401, 'UNAUTHENTICATED', 'Missing access token');
    }
    const deviceId = dto.deviceId ?? 'unknown';
    const entities = dto.entities.filter((e) =>
      (SYNC_ENTITY_TYPES as readonly string[]).includes(e),
    ) as SyncEntityType[];

    return this.db.run(async (tx) => {
      for (const entity of entities) {
        await tx
          .insert(syncCursors)
          .values({
            tenantId: ctx.tenantId!,
            userId: ctx.userId!,
            deviceId,
            entityType: entity,
            lastRowVersion: BigInt(dto.cursor),
            lastSyncedAt: new Date(),
            pendingCount: 0,
          })
          .onConflictDoUpdate({
            target: [
              syncCursors.userId,
              syncCursors.deviceId,
              syncCursors.entityType,
            ],
            set: {
              lastRowVersion: BigInt(dto.cursor),
              lastSyncedAt: new Date(),
              pendingCount: 0,
              updatedAt: new Date(),
            },
          });
      }
      return { ok: true, cursor: dto.cursor, entities };
    });
  }

  // ---------------------------------------------------------------------------

  private parseEntities(raw?: string): SyncEntityType[] {
    if (!raw) return [...SYNC_ENTITY_TYPES];
    const requested = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const allowed = requested.filter((e) =>
      (SYNC_ENTITY_TYPES as readonly string[]).includes(e),
    ) as SyncEntityType[];
    if (allowed.length === 0) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        `Unknown entities. Allowed: ${SYNC_ENTITY_TYPES.join(', ')}`,
      );
    }
    return allowed;
  }

  private grantFor(entity: SyncEntityType) {
    const ctx = RequestContextStore.get();
    // Map entity → the permission that defines list scope for that domain.
    const code =
      entity === 'homework'
        ? 'homework.read'
        : entity === 'announcements'
          ? 'comms.announcement.read'
          : 'exam.marks.read';
    return (
      ctx.permissions.get(code) ?? {
        code,
        scope: 'tenant' as const,
        sectionIds: [] as string[],
        subjectIds: [] as string[],
        studentIds: [] as string[],
      }
    );
  }

  private async countPending(
    tx: Tx,
    entity: SyncEntityType,
    cursor: bigint,
  ): Promise<number> {
    const grant = this.grantFor(entity);
    const ctx = RequestContextStore.get();

    if (entity === 'homework') {
      const predicate = scopeFilter(
        grant,
        { sectionId: homework.sectionId },
        { branchId: ctx.branchId },
      );
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
        .from(homework)
        .where(
          and(
            gt(homework.rowVersion, cursor),
            isNull(homework.deletedAt),
            predicate,
          ),
        );
      return row?.n ?? 0;
    }

    if (entity === 'announcements') {
      const predicate = scopeFilter(
        grant,
        { branchId: announcements.branchId },
        { branchId: ctx.branchId },
      );
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
        .from(announcements)
        .where(
          and(
            gt(announcements.rowVersion, cursor),
            isNull(announcements.deletedAt),
            predicate,
          ),
        );
      return row?.n ?? 0;
    }

    // marks — scope via the sheet's section/subject
    const predicate = scopeFilter(
      grant,
      {
        sectionId: marksSheets.sectionId,
        subjectId: marksSheets.subjectId,
      },
      { branchId: ctx.branchId },
    );
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
      .from(marks)
      .innerJoin(marksSheets, eq(marksSheets.id, marks.marksSheetId))
      .where(and(gt(marks.rowVersion, cursor), isNull(marks.deletedAt), predicate));
    return row?.n ?? 0;
  }

  private async maxRowVersion(tx: Tx, entity: SyncEntityType): Promise<number> {
    const table =
      entity === 'homework'
        ? homework
        : entity === 'announcements'
          ? announcements
          : marks;
    const [row] = await tx
      .select({
        max: sql<string>`coalesce(max(${table.rowVersion}), 0)`,
      })
      .from(table);
    return Number(row?.max ?? 0);
  }

  private async countTombstones(
    tx: Tx,
    entities: SyncEntityType[],
    cursor: bigint,
  ): Promise<number> {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
      .from(syncTombstones)
      .where(
        and(
          inArray(syncTombstones.entityType, entities),
          gt(syncTombstones.rowVersion, cursor),
        ),
      );
    return row?.n ?? 0;
  }

  private async maxTombstoneVersion(
    tx: Tx,
    entities: SyncEntityType[],
  ): Promise<number> {
    const [row] = await tx
      .select({
        max: sql<string>`coalesce(max(${syncTombstones.rowVersion}), 0)`,
      })
      .from(syncTombstones)
      .where(inArray(syncTombstones.entityType, entities));
    return Number(row?.max ?? 0);
  }

  private async pullTombstones(
    tx: Tx,
    entities: SyncEntityType[],
    cursor: bigint,
    limit: number,
  ) {
    return tx
      .select({
        entityType: syncTombstones.entityType,
        entityId: syncTombstones.entityId,
        rowVersion: syncTombstones.rowVersion,
      })
      .from(syncTombstones)
      .where(
        and(
          inArray(syncTombstones.entityType, entities),
          gt(syncTombstones.rowVersion, cursor),
        ),
      )
      .orderBy(syncTombstones.rowVersion)
      .limit(limit);
  }

  private async pullEntity(
    tx: Tx,
    entity: SyncEntityType,
    cursor: bigint,
    limit: number,
  ): Promise<SyncEntityChange[]> {
    const grant = this.grantFor(entity);
    const ctx = RequestContextStore.get();

    if (entity === 'homework') {
      const predicate = scopeFilter(
        grant,
        { sectionId: homework.sectionId } satisfies ScopeColumns,
        { branchId: ctx.branchId },
      );
      const rows = await tx
        .select({
          id: homework.id,
          rowVersion: homework.rowVersion,
          sectionId: homework.sectionId,
          subjectId: homework.subjectId,
          title: homework.title,
          description: homework.description,
          assignedOn: homework.assignedOn,
          dueOn: homework.dueOn,
          status: homework.status,
          requiresSubmission: homework.requiresSubmission,
          maxMarks: homework.maxMarks,
          updatedAt: homework.updatedAt,
        })
        .from(homework)
        .where(
          and(
            gt(homework.rowVersion, cursor),
            isNull(homework.deletedAt),
            predicate,
          ),
        )
        .orderBy(homework.rowVersion)
        .limit(limit);

      return rows.map((r) => ({
        entity,
        id: r.id,
        rowVersion: Number(r.rowVersion),
        deleted: false,
        payload: {
          sectionId: r.sectionId,
          subjectId: r.subjectId,
          title: r.title,
          description: r.description,
          assignedOn: r.assignedOn,
          dueOn: r.dueOn,
          status: r.status,
          requiresSubmission: r.requiresSubmission,
          maxMarks: r.maxMarks,
          updatedAt: r.updatedAt?.toISOString() ?? null,
        },
      }));
    }

    if (entity === 'announcements') {
      const predicate = scopeFilter(
        grant,
        { branchId: announcements.branchId },
        { branchId: ctx.branchId },
      );
      const rows = await tx
        .select({
          id: announcements.id,
          rowVersion: announcements.rowVersion,
          title: announcements.title,
          body: announcements.body,
          type: announcements.type,
          sentAt: announcements.sentAt,
          requiresAcknowledgement: announcements.requiresAcknowledgement,
          updatedAt: announcements.updatedAt,
        })
        .from(announcements)
        .where(
          and(
            gt(announcements.rowVersion, cursor),
            isNull(announcements.deletedAt),
            predicate,
          ),
        )
        .orderBy(announcements.rowVersion)
        .limit(limit);

      return rows.map((r) => ({
        entity,
        id: r.id,
        rowVersion: Number(r.rowVersion),
        deleted: false,
        payload: {
          title: r.title,
          body: r.body,
          type: r.type,
          sentAt: r.sentAt?.toISOString() ?? null,
          requiresAcknowledgement: r.requiresAcknowledgement,
          updatedAt: r.updatedAt?.toISOString() ?? null,
        },
      }));
    }

    const predicate = scopeFilter(
      grant,
      {
        sectionId: marksSheets.sectionId,
        subjectId: marksSheets.subjectId,
      },
      { branchId: ctx.branchId },
    );
    const rows = await tx
      .select({
        id: marks.id,
        rowVersion: marks.rowVersion,
        studentId: marks.studentId,
        examId: marks.examId,
        subjectId: marks.subjectId,
        marksObtained: marks.marksObtained,
        maxMarks: marks.maxMarks,
        grade: marks.grade,
        isAbsent: marks.isAbsent,
        sectionId: marksSheets.sectionId,
        updatedAt: marks.updatedAt,
      })
      .from(marks)
      .innerJoin(marksSheets, eq(marksSheets.id, marks.marksSheetId))
      .where(and(gt(marks.rowVersion, cursor), isNull(marks.deletedAt), predicate))
      .orderBy(marks.rowVersion)
      .limit(limit);

    return rows.map((r) => ({
      entity,
      id: r.id,
      rowVersion: Number(r.rowVersion),
      deleted: false,
      payload: {
        studentId: r.studentId,
        examId: r.examId,
        subjectId: r.subjectId,
        sectionId: r.sectionId,
        marksObtained: r.marksObtained,
        maxMarks: r.maxMarks,
        grade: r.grade,
        isAbsent: r.isAbsent,
        updatedAt: r.updatedAt?.toISOString() ?? null,
      },
    }));
  }
}
