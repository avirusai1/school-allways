/**
 * Gate visitors + authorised pickup / handover.
 * Full ID numbers are never stored — idLast4 only.
 */

import { createHash, randomInt } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import {
  authorisedPickups,
  classes,
  gatePasses,
  pickupEvents,
  sections,
  studentEnrollments,
  students,
  visitors,
} from '@saw/db';

import {
  RequestContextStore,
  type GrantedPermission,
} from '../../common/context/request-context';
import { TenantDbService } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { assertInScope } from '../../common/rbac/scope.util';
import { NotificationService } from '../notifications/notification.service';
import type {
  CreateAuthorisedPickupDto,
  CreateGatePassDto,
  CreateVisitorDto,
  PickupHandoverDto,
  PickupOtpDto,
  PickupVerifyDto,
  PreRegisterVisitorDto,
} from './dto/safety.dto';

@Injectable()
export class SafetyService {
  constructor(
    private readonly db: TenantDbService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
  ) {}

  // ---------------------------------------------------------------------------
  // Visitors
  // ---------------------------------------------------------------------------

  async listVisitors(day?: string) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: visitors.id,
          fullName: visitors.fullName,
          phone: visitors.phone,
          purpose: visitors.purpose,
          hostStaffId: visitors.hostStaffId,
          studentId: visitors.studentId,
          badgeNo: visitors.badgeNo,
          idType: visitors.idType,
          idLast4: visitors.idLast4,
          checkInAt: visitors.checkInAt,
          checkOutAt: visitors.checkOutAt,
          isApproved: visitors.isApproved,
          isBlacklisted: visitors.isBlacklisted,
        })
        .from(visitors)
        .where(
          and(
            eq(visitors.branchId, ctx.branchId!),
            day
              ? sql`${visitors.checkInAt}::date = ${day}`
              : undefined,
          ),
        )
        .orderBy(desc(visitors.checkInAt))
        .limit(100);

      // Never expose anything beyond idLast4 — belt and braces.
      return {
        data: rows.map((r) => ({
          ...r,
          idNumber: undefined,
        })),
      };
    });
  }

  async createVisitor(dto: CreateVisitorDto) {
    this.assertIdLast4Only(dto.idLast4);
    const ctx = RequestContextStore.get();

    return this.db.run(async (tx) => {
      if (dto.phone) {
        const [blacklisted] = await tx
          .select({ id: visitors.id })
          .from(visitors)
          .where(
            and(
              eq(visitors.tenantId, ctx.tenantId!),
              eq(visitors.phone, dto.phone),
              eq(visitors.isBlacklisted, true),
            ),
          )
          .limit(1);
        if (blacklisted) {
          throw new ApiException(
            403,
            'BLACKLISTED',
            'This visitor phone is on the school blacklist. Entry denied.',
          );
        }
      }

      const [row] = await tx
        .insert(visitors)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          fullName: dto.fullName,
          phone: dto.phone,
          photoPath: dto.photoPath,
          idType: dto.idType,
          idLast4: dto.idLast4,
          organisation: dto.organisation,
          purpose: dto.purpose ?? 'other',
          hostStaffId: dto.hostStaffId,
          studentId: dto.studentId,
          badgeNo: dto.badgeNo,
          checkInAt: dto.checkInNow ? new Date() : null,
          isApproved: false,
          recordedByUserId: ctx.userId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: visitors.id,
          fullName: visitors.fullName,
          idLast4: visitors.idLast4,
          checkInAt: visitors.checkInAt,
        });
      return row;
    });
  }

  async preRegister(dto: PreRegisterVisitorDto) {
    this.assertIdLast4Only(dto.idLast4);
    const ctx = RequestContextStore.get();
    const code = `PR${randomInt(100000, 999999)}`;

    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(visitors)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          fullName: dto.fullName,
          phone: dto.phone,
          photoPath: dto.photoPath,
          idType: dto.idType,
          idLast4: dto.idLast4,
          organisation: dto.organisation,
          purpose: dto.purpose ?? 'other',
          hostStaffId: dto.hostStaffId,
          studentId: dto.studentId,
          preRegisteredCode: code,
          expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
          isApproved: true,
          approvedByUserId: ctx.userId,
          approvedAt: new Date(),
          recordedByUserId: ctx.userId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: visitors.id,
          preRegisteredCode: visitors.preRegisteredCode,
          expectedAt: visitors.expectedAt,
        });
      return {
        ...row,
        qrPayload: `saw:visitor:${row!.preRegisteredCode}`,
      };
    });
  }

  async checkoutVisitor(id: string) {
    return this.db.run(async (tx) => {
      const [row] = await tx
        .update(visitors)
        .set({ checkOutAt: new Date(), updatedAt: new Date() })
        .where(and(eq(visitors.id, id), isNull(visitors.checkOutAt)))
        .returning({
          id: visitors.id,
          checkOutAt: visitors.checkOutAt,
          fullName: visitors.fullName,
        });
      if (!row) throw new ApiException(404, 'NOT_FOUND', 'Visitor not found or already checked out');
      return row;
    });
  }

  /** Who is currently on premises — one index lookup. */
  async insideNow() {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: visitors.id,
          fullName: visitors.fullName,
          purpose: visitors.purpose,
          hostStaffId: visitors.hostStaffId,
          badgeNo: visitors.badgeNo,
          checkInAt: visitors.checkInAt,
          idLast4: visitors.idLast4,
        })
        .from(visitors)
        .where(
          and(
            eq(visitors.branchId, ctx.branchId!),
            sql`${visitors.checkInAt} is not null`,
            isNull(visitors.checkOutAt),
          ),
        )
        .orderBy(desc(visitors.checkInAt))
        .limit(200);
      return { data: rows, count: rows.length };
    });
  }

  async createGatePass(dto: CreateGatePassDto) {
    const ctx = RequestContextStore.get();
    if (!dto.studentId && !dto.staffId) {
      throw new ApiException(400, 'VALIDATION_ERROR', 'Provide studentId or staffId.');
    }
    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(gatePasses)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          studentId: dto.studentId,
          staffId: dto.staffId,
          day: dto.day,
          passType: dto.passType,
          exitTime: dto.exitTime,
          returnTime: dto.returnTime,
          reason: dto.reason,
          collectedByName: dto.collectedByName,
          approvedByUserId: ctx.userId,
          recordedByUserId: ctx.userId,
        })
        .returning({
          id: gatePasses.id,
          passType: gatePasses.passType,
          day: gatePasses.day,
          studentId: gatePasses.studentId,
        });
      // Attendance write-back is a follow-on — gate pass is the source of truth here.
      return row;
    });
  }

  // ---------------------------------------------------------------------------
  // Authorised pickup
  // ---------------------------------------------------------------------------

  async listAuthorised(studentId: string, grant: GrantedPermission) {
    assertInScope(grant, { studentId });
    return this.db.run(async (tx) => {
      const rows = await tx
        .select({
          id: authorisedPickups.id,
          fullName: authorisedPickups.fullName,
          relation: authorisedPickups.relation,
          phone: authorisedPickups.phone,
          photoPath: authorisedPickups.photoPath,
          idType: authorisedPickups.idType,
          idLast4: authorisedPickups.idLast4,
          isPermanent: authorisedPickups.isPermanent,
          validFrom: authorisedPickups.validFrom,
          validTo: authorisedPickups.validTo,
        })
        .from(authorisedPickups)
        .where(
          and(
            eq(authorisedPickups.studentId, studentId),
            eq(authorisedPickups.isActive, true),
            isNull(authorisedPickups.revokedAt),
          ),
        );
      return { data: rows };
    });
  }

  async addAuthorised(dto: CreateAuthorisedPickupDto, grant: GrantedPermission) {
    assertInScope(grant, { studentId: dto.studentId });
    if (!dto.photoPath) {
      throw new ApiException(
        422,
        'PHOTO_REQUIRED',
        'Photo is mandatory on every authorised person. A guard matches a face, not a name.',
      );
    }
    this.assertIdLast4Only(dto.idLast4);
    const ctx = RequestContextStore.get();

    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(authorisedPickups)
        .values({
          tenantId: ctx.tenantId!,
          studentId: dto.studentId,
          guardianId: dto.guardianId,
          fullName: dto.fullName,
          relation: dto.relation,
          phone: dto.phone,
          photoPath: dto.photoPath,
          idType: dto.idType,
          idLast4: dto.idLast4,
          isPermanent: dto.isPermanent ?? true,
          validFrom: dto.validFrom,
          validTo: dto.validTo,
          authorisedByUserId: ctx.userId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning({
          id: authorisedPickups.id,
          fullName: authorisedPickups.fullName,
          photoPath: authorisedPickups.photoPath,
        });
      return row;
    });
  }

  async revokeAuthorised(id: string, grant: GrantedPermission) {
    const ctx = RequestContextStore.get();
    return this.db.run(async (tx) => {
      // Read first so we can prove ownership BEFORE mutating. 404 vs 403
      // matters: the parent needs to know it wasn't their record.
      const [existing] = await tx
        .select({
          id: authorisedPickups.id,
          studentId: authorisedPickups.studentId,
        })
        .from(authorisedPickups)
        .where(eq(authorisedPickups.id, id))
        .limit(1);

      if (!existing) {
        throw new ApiException(404, 'NOT_FOUND', 'Authorised pickup not found');
      }

      assertInScope(grant, { studentId: existing.studentId });

      const [row] = await tx
        .update(authorisedPickups)
        .set({
          revokedAt: new Date(),
          isActive: false,
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
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

  async generatePickupOtp(dto: PickupOtpDto, grant: GrantedPermission) {
    const ctx = RequestContextStore.get();
    const code = String(randomInt(100000, 999999));
    const hash = this.hashOtp(code);
    const expires = new Date(Date.now() + 2 * 60 * 60 * 1000);

    return this.db.run(async (tx) => {
      const [person] = await tx
        .select({
          id: authorisedPickups.id,
          studentId: authorisedPickups.studentId,
          fullName: authorisedPickups.fullName,
        })
        .from(authorisedPickups)
        .where(eq(authorisedPickups.id, dto.authorisedPickupId))
        .limit(1);
      if (!person) throw new ApiException(404, 'NOT_FOUND', 'Authorised person not found');
      assertInScope(grant, { studentId: person.studentId });

      await tx
        .update(authorisedPickups)
        .set({
          otpCodeHash: hash,
          otpExpiresAt: expires,
          otpUsedAt: null,
          updatedAt: new Date(),
          updatedBy: ctx.userId,
        })
        .where(eq(authorisedPickups.id, person.id));

      return {
        authorisedPickupId: person.id,
        otp: code,
        validUntil: expires.toISOString(),
        personName: person.fullName,
      };
    });
  }

  /**
   * Guard lookup — returns face-match payload (photos + idLast4), never full IDs.
   */
  async verifyPickup(dto: PickupVerifyDto) {
    const filesBase = this.config.getOrThrow<string>('FILES_BASE_URL').replace(/\/$/, '');

    return this.db.run(async (tx) => {
      let person: {
        id: string;
        studentId: string;
        fullName: string;
        relation: string | null;
        photoPath: string;
        idLast4: string | null;
        otpExpiresAt: Date | null;
        otpUsedAt: Date | null;
        otpCodeHash: string | null;
      } | undefined;

      if (dto.otp) {
        const hash = this.hashOtp(dto.otp);
        const [row] = await tx
          .select({
            id: authorisedPickups.id,
            studentId: authorisedPickups.studentId,
            fullName: authorisedPickups.fullName,
            relation: authorisedPickups.relation,
            photoPath: authorisedPickups.photoPath,
            idLast4: authorisedPickups.idLast4,
            otpExpiresAt: authorisedPickups.otpExpiresAt,
            otpUsedAt: authorisedPickups.otpUsedAt,
            otpCodeHash: authorisedPickups.otpCodeHash,
          })
          .from(authorisedPickups)
          .where(
            and(
              eq(authorisedPickups.otpCodeHash, hash),
              eq(authorisedPickups.isActive, true),
              isNull(authorisedPickups.revokedAt),
            ),
          )
          .limit(1);
        person = row;
        if (!person) {
          return { authorised: false, reason: 'Invalid or unknown code' };
        }
        if (person.otpUsedAt) {
          return { authorised: false, reason: 'Code already used' };
        }
        if (!person.otpExpiresAt || person.otpExpiresAt.getTime() < Date.now()) {
          return { authorised: false, reason: 'Code expired' };
        }
      } else if (dto.authorisedPickupId) {
        const [row] = await tx
          .select({
            id: authorisedPickups.id,
            studentId: authorisedPickups.studentId,
            fullName: authorisedPickups.fullName,
            relation: authorisedPickups.relation,
            photoPath: authorisedPickups.photoPath,
            idLast4: authorisedPickups.idLast4,
            otpExpiresAt: authorisedPickups.otpExpiresAt,
            otpUsedAt: authorisedPickups.otpUsedAt,
            otpCodeHash: authorisedPickups.otpCodeHash,
          })
          .from(authorisedPickups)
          .where(
            and(
              eq(authorisedPickups.id, dto.authorisedPickupId),
              eq(authorisedPickups.isActive, true),
              isNull(authorisedPickups.revokedAt),
            ),
          )
          .limit(1);
        person = row;
      }

      if (!person) {
        return { authorised: false, reason: 'Not authorised' };
      }
      if (dto.studentId && dto.studentId !== person.studentId) {
        return { authorised: false, reason: 'Person not authorised for this student' };
      }

      const [student] = await tx
        .select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          photoPath: students.photoPath,
          className: classes.name,
          sectionName: sections.name,
        })
        .from(students)
        .leftJoin(
          studentEnrollments,
          and(
            eq(studentEnrollments.studentId, students.id),
            sql`${studentEnrollments.status} in ('active','admitted','on_leave')`,
          ),
        )
        .leftJoin(classes, eq(classes.id, studentEnrollments.classId))
        .leftJoin(sections, eq(sections.id, studentEnrollments.sectionId))
        .where(eq(students.id, person.studentId))
        .limit(1);

      const classLabel =
        student?.className && student?.sectionName
          ? `${student.className}-${student.sectionName}`
          : (student?.className ?? null);

      return {
        authorised: true,
        person: {
          id: person.id,
          name: person.fullName,
          relation: person.relation,
          photoUrl: `${filesBase}/${person.photoPath}`,
          idLast4: person.idLast4,
        },
        student: {
          id: student?.id,
          name: [student?.firstName, student?.lastName].filter(Boolean).join(' '),
          class: classLabel,
          photoUrl: student?.photoPath ? `${filesBase}/${student.photoPath}` : null,
        },
        validUntil: person.otpExpiresAt?.toISOString() ?? null,
      };
    });
  }

  async handover(dto: PickupHandoverDto) {
    const ctx = RequestContextStore.get();
    const isOverride = dto.verificationMethod === 'manual_override';

    if (isOverride) {
      if (!dto.overrideReason || dto.overrideReason.trim().length < 20) {
        throw new ApiException(
          422,
          'OVERRIDE_REASON_REQUIRED',
          'Pickup override requires a typed reason of at least 20 characters.',
        );
      }
    }

    return this.db.run(async (tx) => {
      if (dto.authorisedPickupId && dto.verificationMethod === 'otp') {
        await tx
          .update(authorisedPickups)
          .set({ otpUsedAt: new Date(), updatedAt: new Date() })
          .where(eq(authorisedPickups.id, dto.authorisedPickupId));
      }

      const [event] = await tx
        .insert(pickupEvents)
        .values({
          tenantId: ctx.tenantId!,
          branchId: ctx.branchId!,
          studentId: dto.studentId,
          day: new Date().toISOString().slice(0, 10),
          method: dto.method as
            | 'parent'
            | 'authorised_person'
            | 'school_bus'
            | 'self'
            | 'private_transport'
            | 'staff_ward',
          authorisedPickupId: dto.authorisedPickupId,
          handedOverAt: new Date(),
          releasedByUserId: ctx.userId,
          verificationMethod: dto.verificationMethod ?? 'photo_match',
          overrideReason: isOverride ? dto.overrideReason : null,
          capturedPhotoPath: dto.capturedPhotoPath,
          parentNotifiedAt: new Date(),
        })
        .returning({
          id: pickupEvents.id,
          studentId: pickupEvents.studentId,
          verificationMethod: pickupEvents.verificationMethod,
          overrideReason: pickupEvents.overrideReason,
        });

      await this.notifications.notify({
        tenantId: ctx.tenantId!,
        templateCode: isOverride ? 'pickup.override' : 'pickup.handover',
        recipients: [{ userId: ctx.userId!, studentId: dto.studentId }],
        variables: { studentId: dto.studentId },
        priority: isOverride ? 'critical' : 'high',
        channels: ['push', 'in_app'],
      });

      if (isOverride) {
        RequestContextStore.addAudit({
          action: 'pickup.handover.override',
          entityType: 'pickup_events',
          entityId: event!.id,
        });
      }

      return event;
    });
  }

  private assertIdLast4Only(idLast4?: string) {
    if (idLast4 == null) return;
    if (!/^\d{4}$/.test(idLast4) && !/^[A-Za-z0-9]{4}$/.test(idLast4)) {
      throw new ApiException(
        400,
        'ID_LAST4_ONLY',
        'Only the last 4 characters of an ID may be stored. Never send a full ID number.',
      );
    }
    // Reject if someone pasted a longer number truncated wrongly — length already capped by DTO.
  }

  private hashOtp(code: string): string {
    const secret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    return createHash('sha256').update(`${code}:${secret}`).digest('hex');
  }
}
