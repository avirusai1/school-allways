import { Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
  academicSessions,
  branches,
  classes,
  guardians,
  joinTokens,
  onboardingEvents,
  plans,
  referrals,
  roles,
  sections,
  studentEnrollments,
  studentGuardians,
  students,
  subscriptions,
  tenantSignups,
  tenants,
  userRoleAssignments,
  userTenantMemberships,
  users,
} from '@saw/db';

import {
  RequestContextStore,
} from '../../common/context/request-context';
import { TenantDbService, type Tx } from '../../common/database/tenant-db.service';
import { ensureStayConnectedFee } from '../subscriptions/stay-connected.util';
import { ApiException } from '../../common/errors/api.exception';
import { generateOpaqueToken, sha256 } from '../../common/utils/crypto.util';
import { TokenService } from '../auth/token.service';
import { OtpService } from '../auth/otp.service';
import { normalizePhone } from '../import/import.util';
import {
  SAMPLE_STUDENT_NAMES,
  type OnboardingStep,
} from './onboarding.constants';
import type { PublicSignupDto } from './dto/onboarding.dto';

@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    private readonly db: TenantDbService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
  ) {}

  async startSignup(dto: PublicSignupDto, requestIp?: string) {
    const phone = normalizePhone(dto.contactPhone);
    if (!phone) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'Enter a valid Indian mobile number (10 digits).',
      );
    }

    const email = dto.contactEmail.trim().toLowerCase();
    if (!email) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'Enter a work email — we send the verification code there.',
      );
    }

    // Phone and email are both unique on `users`, so both have to be checked
    // here. Only checking the phone let a principal signing up a second school
    // with the same work address get as far as provisioning before the insert
    // failed on `users_email_uq` — an opaque 500 in place of "you already have
    // an account".
    const existing = await this.db.runUnscoped(async (tx) => {
      const [u] = await tx
        .select({ phone: users.phone, email: users.email })
        .from(users)
        .where(or(eq(users.phone, phone), eq(users.email, email)))
        .limit(1);
      return u;
    });

    if (existing) {
      throw new ApiException(
        409,
        'ALREADY_EXISTS',
        existing.phone === phone
          ? 'An account with this phone already exists. Sign in instead.'
          : 'An account with this email already exists. Sign in instead.',
      );
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [signup] = await this.db.runUnscoped(async (tx) => {
      return tx
        .insert(tenantSignups)
        .values({
          schoolName: dto.schoolName.trim(),
          board: dto.board,
          city: dto.city.trim(),
          state: dto.state.trim(),
          approxStudentCount: dto.approxStudentCount ?? null,
          contactName: dto.contactName.trim(),
          contactPhone: phone,
          contactEmail: email,
          referralCode: dto.referralCode?.trim().toUpperCase() ?? null,
          expiresAt,
        })
        .returning({ id: tenantSignups.id });
    });

    const otpResult = await this.otp.requestOtp({
      phone,
      email,
      purpose: 'signup',
      requestIp,
      deliverToEmail: email,
    });

    return {
      signupId: signup.id,
      otpSent: true as const,
      expiresInSeconds: otpResult.expiresInSeconds,
      ...(process.env.NODE_ENV === 'development' ? { devOtp: otpResult.code } : {}),
    };
  }

  async verifySignup(signupId: string, code: string) {
    const signup = await this.db.runUnscoped(async (tx) => {
      const [row] = await tx
        .select({
          id: tenantSignups.id,
          schoolName: tenantSignups.schoolName,
          board: tenantSignups.board,
          city: tenantSignups.city,
          state: tenantSignups.state,
          contactName: tenantSignups.contactName,
          contactPhone: tenantSignups.contactPhone,
          contactEmail: tenantSignups.contactEmail,
          referralCode: tenantSignups.referralCode,
          verifiedAt: tenantSignups.verifiedAt,
          expiresAt: tenantSignups.expiresAt,
          tenantId: tenantSignups.tenantId,
        })
        .from(tenantSignups)
        .where(eq(tenantSignups.id, signupId))
        .limit(1);
      return row ?? null;
    });

    if (!signup) {
      throw new ApiException(404, 'NOT_FOUND', 'Signup not found. Start again.');
    }
    if (signup.verifiedAt || signup.tenantId) {
      throw new ApiException(409, 'ALREADY_EXISTS', 'This signup was already verified.');
    }
    if (signup.expiresAt < new Date()) {
      throw new ApiException(410, 'GONE', 'This signup expired. Start again.');
    }

    await this.otp.verifyOtp({
      phone: signup.contactPhone,
      email: signup.contactEmail ?? undefined,
      purpose: 'signup',
      code,
    });

    const tenantId = randomUUID();
    const userId = randomUUID();
    const branchId = randomUUID();
    const slug = await this.allocateSlug(signup.schoolName);

    await this.db.asTenant(tenantId, async (tx) => {
      await tx.insert(tenants).values({
        id: tenantId,
        slug,
        name: signup.schoolName,
        status: 'onboarding',
        planTier: 'free',
        ownerName: signup.contactName,
        ownerPhone: signup.contactPhone,
        ownerEmail: signup.contactEmail,
        onboardingStep: 'school_profile',
        hasSampleData: true,
      });

      await tx.insert(branches).values({
        id: branchId,
        tenantId,
        code: 'MAIN',
        name: signup.schoolName,
        board: signup.board as never,
        city: signup.city,
        state: signup.state,
      });

      await tx.insert(users).values({
        id: userId,
        phone: signup.contactPhone,
        phoneVerifiedAt: new Date(),
        email: signup.contactEmail,
        emailVerifiedAt: signup.contactEmail ? new Date() : null,
        fullName: signup.contactName,
        kind: 'staff',
      });

      await tx.insert(userTenantMemberships).values({
        userId,
        tenantId,
        branchId,
        status: 'active',
        joinedAt: new Date(),
      });

      const [adminRole] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.code, 'school_admin'), isNull(roles.tenantId)))
        .limit(1);

      if (!adminRole) {
        throw new ApiException(
          503,
          'SERVICE_UNAVAILABLE',
          'School admin role is not seeded. Contact support.',
        );
      }

      await tx.insert(userRoleAssignments).values({
        tenantId,
        userId,
        roleId: adminRole.id,
        branchId,
        scopeType: 'tenant',
        isPrimary: true,
      });

      const [freePlan] = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.code, 'free'))
        .limit(1);

      if (freePlan) {
        await tx.insert(subscriptions).values({
          tenantId,
          planId: freePlan.id,
          status: 'active',
          amountPaise: 0,
        });
      }

      await this.seedSampleData(tx, {
        tenantId,
        branchId,
        board: signup.board,
        createdBy: userId,
      });

      await tx.insert(onboardingEvents).values({
        tenantId,
        step: 'signup',
        action: 'completed',
        durationSeconds: null,
        itemCount: 1,
      });

      if (signup.referralCode) {
        // Handled after asTenant — referral row belongs to the referrer tenant.
      }
    });

    if (signup.referralCode) {
      await this.attributeReferral(
        tenantId,
        signup.referralCode,
        signup.schoolName,
        signup.contactPhone,
      );
    }

    // Claiming the signup writes a real tenant_id onto it, so it runs under
    // that tenant: unscoped, the row's new owner would not match the (empty)
    // current tenant and RLS would refuse the write.
    await this.db.asTenant(tenantId, async (tx) => {
      await tx
        .update(tenantSignups)
        .set({ tenantId, verifiedAt: new Date() })
        .where(eq(tenantSignups.id, signupId));
    });

    const tokens = await this.tokens.createSession({
      userId,
      tenantId,
      branchId,
    });

    const handoffUrl = await this.issueHandoff(tenantId, branchId, userId);

    this.logger.log(`Tenant provisioned slug=${slug} tenant=${tenantId}`);

    return {
      tenantId,
      slug,
      // Kept for clients that live on one origin and can use a session directly
      // — the Flutter apps sign up and stay put. The marketing site cannot, and
      // uses handoffUrl instead.
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      onboardingStep: 'school_profile' as OnboardingStep,
      handoffUrl,
    };
  }

  /**
   * The signup form and the admin app are different origins, so the new admin
   * has to cross one to reach the wizard. Putting the access token in that URL
   * would write a live session into server logs, browser history and the
   * Referer header of the next request they make.
   *
   * Instead we hand over the same shape of credential the invitation links use:
   * one opaque code, hashed at rest, single-use, redeemed for a session by the
   * app that receives it. `join_tokens` already models exactly this, down to
   * the RLS policy that allows a pre-tenant lookup by hash, so this is a third
   * purpose on that table rather than a second mechanism to keep safe.
   *
   * Five minutes: this is a redirect that happens immediately, not an
   * invitation someone opens next week.
   */
  private async issueHandoff(
    tenantId: string,
    branchId: string,
    userId: string,
  ): Promise<string> {
    const adminBase = process.env.ADMIN_WEB_URL?.replace(/\/+$/, '');
    if (!adminBase) {
      // Loudly, rather than sending a school that just signed up to
      // "undefined/handoff?code=...".
      this.logger.error(
        'ADMIN_WEB_URL is not set — a verified signup has nowhere to hand off to.',
      );
      throw new ApiException(
        503,
        'SERVICE_UNAVAILABLE',
        'Your school was created, but we could not open the setup wizard. ' +
          'Sign in to continue.',
      );
    }

    const code = generateOpaqueToken();
    await this.db.asTenant(tenantId, async (tx) => {
      await tx.insert(joinTokens).values({
        tenantId,
        branchId,
        tokenHash: sha256(code),
        purpose: 'signup_handoff',
        userId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });
    });

    return `${adminBase}/handoff?code=${code}`;
  }

  /**
   * India has a great many schools called "Sunrise Public School", so the slug
   * has to be probed for collisions rather than assumed unique.
   *
   * That probe has to see every tenant, and the `tenant_self` policy shows a
   * caller only their own — unscoped, it matches nothing and every school would
   * be told its name is free. So it runs in the platform-admin context, the
   * same way `attributeReferral` crosses tenants below. It reads one column of
   * one row and writes nothing.
   *
   * Two identically-named schools verifying in the same instant would still
   * collide on the unique index; the loser sees an error and can retry. Not
   * worth serialising every signup to close.
   */
  private async allocateSlug(schoolName: string): Promise<string> {
    const base = slugify(schoolName) || 'school';

    return RequestContextStore.run(
      {
        requestId: `signup-slug-${base}`,
        userId: null,
        tenantId: null,
        branchId: null,
        sessionId: null,
        roleCodes: [],
        permissions: new Map(),
        isPlatformAdmin: true,
        impersonatorUserId: null,
        auditTrail: [],
        piiReads: [],
      },
      () =>
        this.db.run(async (tx) => {
          let candidate = base;
          let n = 2;
          for (;;) {
            const [hit] = await tx
              .select({ id: tenants.id })
              .from(tenants)
              .where(eq(tenants.slug, candidate))
              .limit(1);
            if (!hit) return candidate;
            candidate = `${base}-${n}`;
            n += 1;
            if (n > 100) {
              return `${base}-${generateOpaqueToken().slice(0, 6)}`;
            }
          }
        }),
    );
  }

  private async attributeReferral(
    referredTenantId: string,
    code: string,
    schoolName: string,
    contactPhone: string,
  ): Promise<void> {
    // Referral rows are owned by the referrer tenant. Platform-admin context
    // is the only way to attribute across tenants without opening a hole in RLS.
    await RequestContextStore.run(
      {
        requestId: `signup-referral-${referredTenantId}`,
        userId: null,
        tenantId: null,
        branchId: null,
        sessionId: null,
        roleCodes: [],
        permissions: new Map(),
        isPlatformAdmin: true,
        impersonatorUserId: null,
        auditTrail: [],
        piiReads: [],
      },
      async () => {
        await this.db.run(async (tx) => {
          const [ref] = await tx
            .select({ id: referrals.id, status: referrals.status })
            .from(referrals)
            .where(eq(referrals.code, code))
            .limit(1);

          if (!ref || ref.status === 'expired') return;

          await tx
            .update(referrals)
            .set({
              referredTenantId,
              invitedSchoolName: schoolName,
              invitedContactPhone: contactPhone,
              status: 'signed_up',
              signedUpAt: new Date(),
            })
            .where(eq(referrals.id, ref.id));
        });
      },
    );
  }

  /** One demo class + ~20 placeholder students. Wipeable via sample-data/wipe. */
  private async seedSampleData(
    tx: Tx,
    params: {
      tenantId: string;
      branchId: string;
      board: string;
      createdBy: string;
    },
  ): Promise<void> {
    const year = new Date().getFullYear();
    const sessionName = `${year}-${String(year + 1).slice(-2)}`;
    const startDate = `${year}-04-01`;
    const endDate = `${year + 1}-03-31`;

    const [session] = await tx
      .insert(academicSessions)
      .values({
        tenantId: params.tenantId,
        branchId: params.branchId,
        name: sessionName,
        startDate,
        endDate,
        isCurrent: true,
        createdBy: params.createdBy,
      })
      .returning({ id: academicSessions.id, name: academicSessions.name, endDate: academicSessions.endDate });

    if (session) {
      await ensureStayConnectedFee(tx, {
        tenantId: params.tenantId,
        academicSessionId: session.id,
        sessionName: session.name,
        sessionEndDate: session.endDate,
        userId: params.createdBy,
      });
    }

    const [klass] = await tx
      .insert(classes)
      .values({
        tenantId: params.tenantId,
        branchId: params.branchId,
        name: 'Demo V',
        level: 5,
        stage: 'primary',
      })
      .returning({ id: classes.id });

    const [section] = await tx
      .insert(sections)
      .values({
        tenantId: params.tenantId,
        branchId: params.branchId,
        classId: klass.id,
        academicSessionId: session.id,
        name: 'A',
        capacity: 40,
      })
      .returning({ id: sections.id });

    for (let i = 0; i < SAMPLE_STUDENT_NAMES.length; i++) {
      const full = SAMPLE_STUDENT_NAMES[i]!;
      const [first, ...rest] = full.split(' ');
      const [student] = await tx
        .insert(students)
        .values({
          tenantId: params.tenantId,
          branchId: params.branchId,
          admissionNo: `DEMO-${String(i + 1).padStart(3, '0')}`,
          firstName: first!,
          lastName: rest.join(' ') || null,
          gender: i % 2 === 0 ? 'male' : 'female',
          customFields: { isSample: true },
          createdBy: params.createdBy,
        })
        .returning({ id: students.id });

      await tx.insert(studentEnrollments).values({
        tenantId: params.tenantId,
        branchId: params.branchId,
        studentId: student.id,
        academicSessionId: session.id,
        classId: klass.id,
        sectionId: section.id,
        rollNo: String(i + 1),
        status: 'active',
        createdBy: params.createdBy,
      });

      const [guardian] = await tx
        .insert(guardians)
        .values({
          tenantId: params.tenantId,
          fullName: `Demo Parent ${i + 1}`,
          phone: `91000000${String(1000 + i).slice(-4)}`,
          createdBy: params.createdBy,
        })
        .returning({ id: guardians.id });

      await tx.insert(studentGuardians).values({
        tenantId: params.tenantId,
        studentId: student.id,
        guardianId: guardian.id,
        isPrimary: true,
        relation: 'father',
        createdBy: params.createdBy,
      });
    }
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
    .replace(/-$/, '');
}
