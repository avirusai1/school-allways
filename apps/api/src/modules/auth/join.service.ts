import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray } from 'drizzle-orm';
import type Redis from 'ioredis';

import {
  auditLogs,
  classes,
  guardians,
  joinTokens,
  sections,
  staff,
  studentEnrollments,
  studentGuardians,
  students,
  tenants,
  userTenantMemberships,
  users,
} from '@saw/db';

import { hashPassword, MIN_PASSWORD_LENGTH } from '../../common/auth/password.util';
import { RequestContextStore } from '../../common/context/request-context';
import { TenantDbService, type Tx } from '../../common/database/tenant-db.service';
import { ApiException } from '../../common/errors/api.exception';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { sha256 } from '../../common/utils/crypto.util';
import { publicFileUrl } from '../../common/utils/url.util';
import { AuthService } from './auth.service';
import type { JoinResponseDto, JoinStudentDto } from './dto/auth.response';

type JoinTokenRow = {
  id: string;
  tenantId: string;
  branchId: string | null;
  purpose: string;
  studentId: string | null;
  userId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
};

type InspectResult =
  | { kind: 'closed'; response: JoinResponseDto }
  | { kind: 'open'; token: JoinTokenRow; schoolName: string };

/**
 * Failed lookups per IP per hour. Matches OTP's IP ceiling, because guessing
 * tokens and guessing OTP codes are the same attack.
 *
 * Only failures count. A school's parents can share one wifi and open their
 * links within a minute of each other, and throttling successes would lock out
 * the legitimate crowd on the exact day the invitations go out. A caller
 * presenting valid tokens is by definition not enumerating.
 */
const FAILED_LIMIT = 10;
const FAILED_WINDOW_SECONDS = 3600;

@Injectable()
export class JoinService {
  private readonly logger = new Logger(JoinService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly db: TenantDbService,
    private readonly auth: AuthService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Validate the link and name the school. Does not consume the token or
   * issue a session — the UI uses this to say "Welcome to Sunrise Public
   * School" before asking for a password.
   */
  async preview(rawToken: string): Promise<JoinResponseDto> {
    const found = await this.inspect(rawToken);
    if (found.kind === 'closed') return found.response;
    return this.welcomePayload(found.token, found.schoolName, 'pending');
  }

  /**
   * Re-validate, hash the password onto the invited user, then consume the
   * token / activate membership / issue a session — the sequence `join()`
   * used to do in one shot.
   */
  async activate(rawToken: string, password: string): Promise<JoinResponseDto> {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
    }

    const found = await this.inspect(rawToken);
    if (found.kind === 'closed') return found.response;

    const { token, schoolName } = found;
    const passwordHash = await hashPassword(password);

    await this.db.asTenant(token.tenantId, async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash,
          emailVerifiedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        })
        .where(eq(users.id, token.userId!));

      await tx
        .update(joinTokens)
        .set({ consumedAt: new Date() })
        .where(and(eq(joinTokens.id, token.id), eq(joinTokens.tenantId, token.tenantId)));

      // `listActiveMemberships` filters on 'active', so without this flip the
      // session we are about to issue would carry no school at all.
      await tx
        .update(userTenantMemberships)
        .set({ status: 'active', joinedAt: new Date() })
        .where(
          and(
            eq(userTenantMemberships.tenantId, token.tenantId),
            eq(userTenantMemberships.userId, token.userId!),
            eq(userTenantMemberships.status, 'invited'),
          ),
        );
    });

    const auth = await this.auth.issueSessionForVerifiedUser(token.userId!);
    await this.writeAudit(
      token.tenantId,
      token.branchId,
      token.userId!,
      token.id,
      token.purpose,
    );

    return this.welcomePayload(token, schoolName, 'joined', auth);
  }

  private async inspect(rawToken: string): Promise<InspectResult> {
    const ctx = RequestContextStore.peek();
    await this.assertNotFlooding(ctx?.ip);

    const token = await this.lookup(rawToken);

    // No row, a row nobody can be logged in as, or a code meant for a different
    // door. All are "this link isn't valid" to the caller — saying which would
    // confirm that a token exists.
    if (!token || !token.userId || token.purpose === 'signup_handoff') {
      await this.countFailure(ctx?.ip);
      return { kind: 'closed', response: { status: 'invalid' } };
    }

    const schoolName = await this.schoolName(token.tenantId);

    if (token.expiresAt.getTime() < Date.now()) {
      return { kind: 'closed', response: { status: 'expired', schoolName } };
    }

    if (token.consumedAt) {
      // Not a failure. The parent opened the message on a second device, or
      // tapped it twice. The app sends them to the normal login screen.
      return { kind: 'closed', response: { status: 'already_activated', schoolName } };
    }

    return { kind: 'open', token, schoolName };
  }

  private async welcomePayload(
    token: JoinTokenRow,
    schoolName: string,
    status: 'pending' | 'joined',
    auth?: JoinResponseDto['auth'],
  ): Promise<JoinResponseDto> {
    if (token.purpose === 'staff_invite') {
      const member = await this.staffFor(token.tenantId, token.userId!);
      return {
        status,
        purpose: 'staff_invite',
        schoolName,
        ...(auth ? { auth } : {}),
        ...(member ? { staff: member } : {}),
      };
    }

    if (token.purpose === 'student_invite') {
      return {
        status,
        purpose: 'student_invite',
        schoolName,
        ...(auth ? { auth } : {}),
      };
    }

    return {
      status,
      purpose: 'parent_profile',
      schoolName,
      ...(auth ? { auth } : {}),
      students: await this.studentsFor(token.tenantId, token.userId!, token.studentId),
    };
  }

  /**
   * Redeems the code the public signup form was redirected with. Same token
   * mechanics as a join link, different situation: the person is seconds old as
   * a user, is already verified by the OTP they just typed on the marketing
   * site, and is mid-navigation between two of our own origins.
   *
   * Their membership is created `active` by signup, so unlike `join` there is
   * nothing to flip — this only spends the code and issues the session.
   */
  async handoff(rawCode: string): Promise<JoinResponseDto> {
    const ctx = RequestContextStore.peek();
    await this.assertNotFlooding(ctx?.ip);

    const token = await this.lookup(rawCode);

    if (!token || !token.userId || token.purpose !== 'signup_handoff') {
      await this.countFailure(ctx?.ip);
      return { status: 'invalid' };
    }

    const schoolName = await this.schoolName(token.tenantId);

    if (token.expiresAt.getTime() < Date.now()) {
      return { status: 'expired', schoolName };
    }
    if (token.consumedAt) {
      // The browser replayed the redirect, or they hit back. Their session was
      // already established; the app sends them to sign in rather than erroring.
      return { status: 'already_activated', schoolName };
    }

    await this.db.asTenant(token.tenantId, async (tx) => {
      await tx
        .update(joinTokens)
        .set({ consumedAt: new Date() })
        .where(and(eq(joinTokens.id, token.id), eq(joinTokens.tenantId, token.tenantId)));
    });

    const auth = await this.auth.issueSessionForVerifiedUser(token.userId);
    await this.writeAudit(
      token.tenantId,
      token.branchId,
      token.userId,
      token.id,
      token.purpose,
    );

    return { status: 'joined', purpose: 'signup_handoff', schoolName, auth };
  }

  /**
   * The one read that happens without a tenant. See 004_join_token_lookup.sql
   * for why it is safe: the policy is keyed on the hash of the token the caller
   * just presented, so it can only ever return the row they already hold.
   */
  private async lookup(rawToken: string) {
    const tokenHash = sha256(rawToken);
    const [row] = await this.db.runWithJoinToken(tokenHash, (tx) =>
      tx
        .select({
          id: joinTokens.id,
          tenantId: joinTokens.tenantId,
          branchId: joinTokens.branchId,
          purpose: joinTokens.purpose,
          studentId: joinTokens.studentId,
          userId: joinTokens.userId,
          expiresAt: joinTokens.expiresAt,
          consumedAt: joinTokens.consumedAt,
        })
        .from(joinTokens)
        .where(eq(joinTokens.tokenHash, tokenHash))
        .limit(1),
    );
    return row ?? null;
  }

  /**
   * Every child this guardian has at the school, not only the one the token was
   * issued for. A parent with two children who taps the link in the message
   * about the younger one should still see both — being shown half their family
   * reads as the product not knowing who they are.
   */
  private async studentsFor(
    tenantId: string,
    guardianUserId: string,
    fallbackStudentId: string | null,
  ): Promise<JoinStudentDto[]> {
    const filesBaseUrl = this.config.getOrThrow<string>('FILES_BASE_URL');

    return this.db.asTenant(tenantId, async (tx) => {
      const ids = await this.studentIdsFor(tx, tenantId, guardianUserId, fallbackStudentId);
      if (ids.length === 0) return [];

      const rows = await tx
        .select({
          id: students.id,
          firstName: students.firstName,
          middleName: students.middleName,
          lastName: students.lastName,
          photoPath: students.photoPath,
          dateOfBirth: students.dateOfBirth,
          bloodGroup: students.bloodGroup,
          addressLine1: students.addressLine1,
          className: classes.name,
          sectionName: sections.name,
        })
        .from(students)
        .leftJoin(
          studentEnrollments,
          and(
            eq(studentEnrollments.studentId, students.id),
            inArray(studentEnrollments.status, ['active', 'admitted']),
          ),
        )
        .leftJoin(sections, eq(sections.id, studentEnrollments.sectionId))
        .leftJoin(classes, eq(classes.id, sections.classId))
        .where(and(eq(students.tenantId, tenantId), inArray(students.id, ids)));

      return rows.map((r) => ({
        id: r.id,
        name: [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' '),
        className: r.className,
        sectionName: r.sectionName,
        photoUrl: publicFileUrl(filesBaseUrl, r.photoPath),
        // Only what is actually blank. A bulk import usually carries name, DOB
        // and class but never a photo or a home address, and asking a parent on
        // a phone to re-enter what the school already sent us wastes the one
        // burst of attention this screen gets.
        missingFields: [
          ...(r.addressLine1 ? [] : (['address'] as const)),
          ...(r.photoPath ? [] : (['photo'] as const)),
          ...(r.dateOfBirth ? [] : (['dateOfBirth'] as const)),
          ...(r.bloodGroup && r.bloodGroup !== 'unknown' ? [] : (['bloodGroup'] as const)),
        ],
      }));
    });
  }

  private async studentIdsFor(
    tx: Tx,
    tenantId: string,
    guardianUserId: string,
    fallbackStudentId: string | null,
  ): Promise<string[]> {
    const linked = await tx
      .select({ studentId: studentGuardians.studentId })
      .from(studentGuardians)
      .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
      .where(and(eq(guardians.tenantId, tenantId), eq(guardians.userId, guardianUserId)));

    const ids = [...new Set(linked.map((l) => l.studentId))];
    if (ids.length > 0) return ids;
    return fallbackStudentId ? [fallbackStudentId] : [];
  }

  private async staffFor(tenantId: string, userId: string) {
    const [row] = await this.db.asTenant(tenantId, (tx) =>
      tx
        .select({
          id: staff.id,
          firstName: staff.firstName,
          middleName: staff.middleName,
          lastName: staff.lastName,
          designation: staff.designation,
          department: staff.department,
        })
        .from(staff)
        .where(and(eq(staff.tenantId, tenantId), eq(staff.userId, userId)))
        .limit(1),
    );

    if (!row) return null;
    return {
      id: row.id,
      name: [row.firstName, row.middleName, row.lastName].filter(Boolean).join(' '),
      designation: row.designation,
      department: row.department,
    };
  }

  private async schoolName(tenantId: string): Promise<string> {
    const [row] = await this.db.asTenant(tenantId, (tx) =>
      tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
    );
    return row?.name ?? 'Your school';
  }

  /**
   * Account activation, logged in the same category as the login endpoints.
   * Never lets a logging failure fail the join — the parent is already through.
   */
  private async writeAudit(
    tenantId: string,
    branchId: string | null,
    userId: string,
    tokenId: string,
    purpose: string,
  ): Promise<void> {
    const ctx = RequestContextStore.peek();
    try {
      await this.db.asTenant(tenantId, async (tx) => {
        await tx.insert(auditLogs).values({
          tenantId,
          branchId,
          actorUserId: userId,
          // Purpose is in the action rather than the payload: `changes` is a
          // field diff, and the two join kinds are genuinely different events.
          action: `auth.join.${purpose}`,
          entityType: 'join_tokens',
          entityId: tokenId,
          changes: { membershipStatus: { from: 'invited', to: 'active' } },
          ip: ctx?.ip ?? null,
          userAgent: ctx?.userAgent ?? null,
          requestId: ctx?.requestId ?? null,
        });
      });
    } catch (err) {
      this.logger.error(
        `Failed to write join audit user=${userId} tenant=${tenantId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  private async assertNotFlooding(ip?: string): Promise<void> {
    if (!ip) return;
    const count = Number(await this.redis.get(this.failKey(ip)));
    if (count >= FAILED_LIMIT) {
      const retryAfter = await this.redis.ttl(this.failKey(ip));
      throw new ApiException(429, 'RATE_LIMITED', 'Too many attempts. Please wait.', {
        retryAfterSeconds: Math.max(retryAfter, 1),
      });
    }
  }

  private async countFailure(ip?: string): Promise<void> {
    if (!ip) return;
    const key = this.failKey(ip);
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, FAILED_WINDOW_SECONDS);
  }

  private failKey(ip: string): string {
    return `join:fail:${ip}`;
  }
}
