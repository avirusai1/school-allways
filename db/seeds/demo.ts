/**
 * Demo school for local / pilot testing.
 *
 * Idempotent: deletes the `sunrise-demo` tenant (cascade) then recreates it.
 *
 *   pnpm db:seed:demo         Sunrise — fully onboarded, lands straight in the app
 *   pnpm db:seed:onboarding   Onboarding Test — deliberately un-onboarded wizard fixture
 *
 * Sunrise is seeded onboarding-COMPLETE on purpose: the wizard exists to convert
 * new signups, not to be re-run by everyone who seeds a dev database. The
 * un-onboarded fixture below keeps the wizard and its gate testable without
 * hand-editing tenants.
 *
 * Logins (password for all four: Demo@12345)
 *   principal@sunrise.demo  — Principal
 *   teacher@sunrise.demo    — Class teacher (V-A)
 *   admin@sunrise.demo      — School admin
 *   parent@sunrise.demo     — Parent (Aarav + Ananya)
 */

import * as argon2 from 'argon2';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  academicSessions,
  attendanceRegisters,
  branches,
  classes,
  guardians,
  incidents,
  leaveRequests,
  payments,
  roles as rolesTable,
  sections,
  staff,
  staffAttendance,
  staffSectionAssignments,
  studentAttendance,
  studentConcessions,
  studentEnrollments,
  studentGuardians,
  students,
  tenants,
  userRoleAssignments,
  userTenantMemberships,
  users,
} from '../schema/index';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Demo seed runs as the owner role.');
}

const DEMO_SLUG = 'sunrise-demo';
const DEMO_PASSWORD = 'Demo@12345';
const PARENT_PHONE = '919876543210';
const PARENT_EMAIL = 'parent@sunrise.demo';

/** Un-onboarded fixture — the only tenant that should ever hit OnboardingGate. */
const ONBOARDING_SLUG = 'saw-onboarding-test';
const ONBOARDING_ADMIN_EMAIL = 'admin@onboarding.demo';

const FRESH_TENANT =
  process.argv.includes('--fresh-tenant') || process.env.SEED_FRESH_TENANT === '1';

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client);

function log(step: string, detail = '') {
  process.stdout.write(`  ${step.padEnd(34)} ${detail}\n`);
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const TODAY = isoDay(new Date());

function daysAgo(n: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return isoDay(d);
}

/**
 * The Indian academic year runs April to March, derived from today rather than
 * hard-coded: a seed pinned to 2025-26 quietly becomes a school whose "current"
 * session ended months ago, and every session-scoped screen goes empty.
 */
function currentAcademicYear(): { name: string; startDate: string; endDate: string } {
  const now = new Date();
  const startYear = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return {
    name: `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
    startDate: `${startYear}-04-01`,
    endDate: `${startYear + 1}-03-31`,
  };
}

/** The last `count` weekdays, oldest first. Nobody marks a register on Sunday. */
/**
 * A rotating absence and one habitual late arrival. Deterministic so a re-seed
 * does not silently change the numbers a screenshot was taken against.
 */
function staffStatusFor(
  day: string,
  index: number,
  total: number,
): 'present' | 'absent' | 'late' {
  const dayNumber = Number(day.slice(8));
  if (index === dayNumber % total) return 'absent';
  if (index === (dayNumber + 1) % total) return 'late';
  return 'present';
}

function recentSchoolDays(count: number): string[] {
  const out: string[] = [];
  for (let back = 0; out.length < count; back += 1) {
    const day = daysAgo(back);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (dow !== 0) out.push(day);
  }
  return out.reverse();
}

/**
 * The audit trail is deliberately immutable (`002_rls.sql`), but `audit_logs`
 * and `pii_access_logs` cascade from `tenants` — so the moment a demo tenant
 * has done anything auditable, deleting it trips the append-only trigger and
 * the seed stops being re-runnable. This is the one place we step around that,
 * as the owner role, on a local database. The triggers go back on even if the
 * delete throws.
 */
async function withAuditTriggersDisabled<T>(fn: () => Promise<T>): Promise<T> {
  await db.execute(sql`ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_immutable`);
  await db.execute(sql`ALTER TABLE pii_access_logs DISABLE TRIGGER trg_pii_immutable`);
  try {
    return await fn();
  } finally {
    await db.execute(sql`ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_immutable`);
    await db.execute(sql`ALTER TABLE pii_access_logs ENABLE TRIGGER trg_pii_immutable`);
  }
}

async function roleId(code: string): Promise<string> {
  const [row] = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(sql`${rolesTable.code} = ${code} AND ${rolesTable.tenantId} IS NULL`)
    .limit(1);
  if (!row) throw new Error(`System role missing: ${code}. Run pnpm db:seed first.`);
  return row.id;
}

/**
 * Un-onboarded tenant, mirroring exactly what self-serve signup leaves behind:
 * a tenant, one branch, and one school_admin at tenant scope. No academic
 * session, no classes, no subjects, no students — the wizard creates those, and
 * seeding them here would defeat the point of the fixture.
 *
 * school_admin (not principal) is deliberate: `tenant.onboarding.manage` only
 * comes from school_admin's `tenant.*` wildcard, and signup.service.ts assigns
 * the same role. A principal-only login cannot run the wizard.
 */
async function seedOnboardingTestTenant() {
  process.stdout.write('\nSeeding un-onboarded tenant (Onboarding Test School)\n\n');

  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  await withAuditTriggersDisabled(async () => {
    await db.delete(tenants).where(eq(tenants.slug, ONBOARDING_SLUG));
    await db.delete(users).where(eq(users.email, ONBOARDING_ADMIN_EMAIL));
  });
  log('cleanup', `removed previous ${ONBOARDING_SLUG}`);

  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: ONBOARDING_SLUG,
      name: 'Onboarding Test School',
      status: 'onboarding',
      planTier: 'free',
      ownerName: 'Wizard Tester',
      ownerPhone: '919800000001',
      ownerEmail: ONBOARDING_ADMIN_EMAIL,
      // The whole point of this fixture: null completion => OnboardingGate fires.
      onboardingStep: 'school_profile',
      onboardingCompletedAt: null,
      hasSampleData: false,
    })
    .returning();
  log('tenant', `${tenant.name} (${tenant.slug})`);

  const [branch] = await db
    .insert(branches)
    .values({
      tenantId: tenant.id,
      code: 'MAIN',
      name: 'Main Campus',
      board: 'cbse',
    })
    .returning();
  log('branch', `${branch.name} (address filled in by step 1)`);

  const [user] = await db
    .insert(users)
    .values({
      email: ONBOARDING_ADMIN_EMAIL,
      emailVerifiedAt: new Date(),
      phone: '919800000001',
      phoneVerifiedAt: new Date(),
      passwordHash,
      fullName: 'Wizard Tester',
      displayName: 'Wizard',
      kind: 'staff',
      isMinor: false,
    })
    .returning();

  await db.insert(userTenantMemberships).values({
    tenantId: tenant.id,
    userId: user.id,
    branchId: branch.id,
    status: 'active',
    joinedAt: new Date(),
  });

  await db.insert(userRoleAssignments).values({
    tenantId: tenant.id,
    userId: user.id,
    roleId: await roleId('school_admin'),
    branchId: branch.id,
    scopeType: 'tenant',
    scopeRefs: {},
    // No session yet — step 2 of the wizard creates the first one.
    academicSessionId: null,
    isPrimary: true,
  });
  log('admin', ONBOARDING_ADMIN_EMAIL);

  process.stdout.write(`
Done. Log in to land on the onboarding wizard:

  Email:           ${ONBOARDING_ADMIN_EMAIL}
  Password:        ${DEMO_PASSWORD}

  Tenant slug:     ${ONBOARDING_SLUG}
  Tenant id:       ${tenant.id}

  Re-run this command for a clean wizard at any time. The Sunrise demo tenant
  is untouched and stays onboarding-complete.

`);
}

const FIRST_NAMES = [
  'Aditya', 'Ishaan', 'Vihaan', 'Arjun', 'Reyansh', 'Kabir', 'Rudra', 'Advik',
  'Dhruv', 'Krishna', 'Saanvi', 'Aadhya', 'Kiara', 'Diya', 'Myra', 'Anika',
  'Navya', 'Riya', 'Ira', 'Pari', 'Vivaan', 'Aryan', 'Neel', 'Tara',
  'Meera', 'Kavya', 'Rohan', 'Sara', 'Yash', 'Nitya', 'Om', 'Zoya', 'Veer',
];
const LAST_NAMES = [
  'Reddy', 'Iyer', 'Nair', 'Gowda', 'Rao', 'Shetty', 'Kulkarni', 'Desai',
  'Menon', 'Patil', 'Joshi', 'Hegde',
];

/** Deterministic filler so a re-seed produces the same class list. */
function rosterFiller(
  sectionId: string,
  classId: string,
  count: number,
  birthYear: number,
) {
  return Array.from({ length: count }, (_, i) => ({
    firstName: FIRST_NAMES[i % FIRST_NAMES.length]!,
    lastName: LAST_NAMES[(i * 7) % LAST_NAMES.length]!,
    dob: `${birthYear}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
    gender: (i % 2 === 0 ? 'male' : 'female') as 'male' | 'female',
    sectionId,
    classId,
  }));
}

/**
 * A fortnight of school, so the dashboard has something to show.
 *
 * Without this the demo tenant renders every tile as an em dash, which is
 * correct and useless — the screen a principal is meant to judge us on cannot
 * be judged on an empty database. Deliberately imperfect: one class has not
 * marked today, a cheque bounced, and there are things waiting for approval.
 */
async function seedDayInTheLife(ctx: {
  tenantId: string;
  branchId: string;
  academicSessionId: string;
  sections: Array<{ id: string; studentIds: string[] }>;
  enrollmentByStudent: Map<string, string>;
  teacherStaffId: string;
  principalUserId: string;
}) {
  const days = recentSchoolDays(12);

  const registerValues: Array<typeof attendanceRegisters.$inferInsert> = [];
  const marks: Array<{
    day: string;
    sectionId: string;
    studentIds: string[];
    absentCount: number;
  }> = [];

  for (const day of days) {
    for (const [index, section] of ctx.sections.entries()) {
      // The second section has not marked today — the unmarked banner is a
      // real state a principal sees most mornings, not a rare one.
      if (day === days.at(-1) && index === 1) continue;

      const total = section.studentIds.length;
      // 0-3 absent, varying by day so the trend is not a flat line.
      const absent = (day.charCodeAt(9) + index) % 4;
      registerValues.push({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        academicSessionId: ctx.academicSessionId,
        sectionId: section.id,
        day,
        mode: 'daily',
        markedByStaffId: ctx.teacherStaffId,
        markedAt: new Date(`${day}T03:45:00Z`),
        isLocked: true,
        presentCount: total - absent,
        absentCount: absent,
        totalCount: total,
      });
      marks.push({
        day,
        sectionId: section.id,
        studentIds: section.studentIds,
        absentCount: absent,
      });
    }
  }

  const registers = await db
    .insert(attendanceRegisters)
    .values(registerValues)
    .returning({
      id: attendanceRegisters.id,
      day: attendanceRegisters.day,
      sectionId: attendanceRegisters.sectionId,
    });

  const registerKey = new Map(registers.map((r) => [`${r.day}|${r.sectionId}`, r.id]));

  const attendanceValues = marks.flatMap((m) =>
    m.studentIds.map((studentId, i) => ({
      tenantId: ctx.tenantId,
      registerId: registerKey.get(`${m.day}|${m.sectionId}`)!,
      studentId,
      enrollmentId: ctx.enrollmentByStudent.get(studentId) ?? null,
      day: m.day,
      sectionId: m.sectionId,
      status: (i < m.absentCount ? 'absent' : 'present') as 'absent' | 'present',
    })),
  );

  for (let i = 0; i < attendanceValues.length; i += 500) {
    await db.insert(studentAttendance).values(attendanceValues.slice(i, i + 500));
  }
  log('attendance', `${days.length} school days, ${attendanceValues.length} marks`);

  // --- staff attendance -----------------------------------------------------
  // The same days as the student registers, so `/attendance/staff/summary` has
  // a month to total rather than the single row the dashboard tile needs.
  const staffRows = await db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.branchId, ctx.branchId));

  const staffMarks = days.flatMap((day) =>
    staffRows.map((s, i) => ({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      staffId: s.id,
      day,
      // One person out each day, rotating, plus a late arrival — enough shape
      // that a monthly summary is not a column of identical numbers.
      status: staffStatusFor(day, i, staffRows.length),
      inTime: '08:45',
      outTime: '16:30',
      workedMinutes: 465,
      markedByUserId: ctx.principalUserId,
    })),
  );

  for (let i = 0; i < staffMarks.length; i += 500) {
    await db.insert(staffAttendance).values(staffMarks.slice(i, i + 500));
  }
  log(
    'staff attendance',
    `${days.length} days, ${staffMarks.length} marks (${staffMarks.filter((m) => m.day === TODAY && m.status !== 'absent').length}/${staffRows.length} in today)`,
  );

  // --- fee collection over the fortnight ------------------------------------
  const payer = ctx.sections[0]!.studentIds[0]!;
  const takings: Array<[number, number]> = [
    [13, 4_20_000], [11, 1_85_000], [10, 96_000], [8, 3_10_000],
    [6, 1_45_000], [4, 2_80_000], [3, 62_000], [1, 1_98_000], [0, 1_24_500],
  ];

  await db.insert(payments).values([
    ...takings.map(([ago, rupees], i) => ({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      studentId: payer,
      receiptNo: `RCPT-${String(i + 1).padStart(4, '0')}`,
      paymentDate: daysAgo(ago),
      amountPaise: rupees * 100,
      mode: 'upi' as const,
      status: 'success' as const,
    })),
    // A bounced cheque, so the daybook has something to reconcile and the
    // collected figure has a reason to exclude a row.
    {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      studentId: payer,
      receiptNo: 'RCPT-0099',
      paymentDate: daysAgo(2),
      amountPaise: 5_00_000,
      mode: 'cheque' as const,
      status: 'success' as const,
      bouncedAt: new Date(`${daysAgo(1)}T06:00:00Z`),
      bounceCharges: 50_000,
    },
  ]);

  // --- things waiting on the principal --------------------------------------
  await db.insert(leaveRequests).values([
    {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      staffId: ctx.teacherStaffId,
      fromDate: daysAgo(-2),
      toDate: daysAgo(-3),
      dayCount: 2,
      reason: 'Family wedding in Mysuru',
      status: 'pending' as const,
    },
    {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      studentId: ctx.sections[0]!.studentIds[1]!,
      fromDate: daysAgo(-1),
      toDate: daysAgo(-1),
      dayCount: 1,
      reason: 'Dental appointment',
      status: 'pending' as const,
      requestedByUserId: null,
    },
  ]);

  // The younger of two siblings, so the concession names the elder's class —
  // not the class the applicant is already sitting in.
  await db.insert(studentConcessions).values({
    tenantId: ctx.tenantId,
    studentId: ctx.sections[0]!.studentIds[0]!,
    academicSessionId: ctx.academicSessionId,
    type: 'sibling',
    percentageBp: 1500,
    reason: 'Elder sibling in VI-A',
    status: 'pending',
  });

  await db.insert(incidents).values([
    {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      category: 'injury',
      severity: 'low',
      title: 'Grazed knee in the playground',
      description: 'First aid given, parent informed by phone.',
      status: 'open',
      sensitivity: 'confidential',
      occurredAt: new Date(`${daysAgo(1)}T05:20:00Z`),
      reportedByUserId: ctx.principalUserId,
    },
    {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      category: 'property',
      severity: 'low',
      title: 'Broken window, science block',
      status: 'open',
      sensitivity: 'confidential',
      occurredAt: new Date(`${daysAgo(3)}T09:00:00Z`),
      reportedByUserId: ctx.principalUserId,
    },
  ]);

  log('day in the life', 'fees, approvals, incidents, staff attendance');
}

async function main() {
  if (FRESH_TENANT) {
    await seedOnboardingTestTenant();
    await client.end();
    return;
  }

  process.stdout.write('\nSeeding demo school (Sunrise Public School)\n\n');

  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  await withAuditTriggersDisabled(async () => {
    // Wipe previous demo tenant — cascades memberships, students, etc.
    await db.delete(tenants).where(eq(tenants.slug, DEMO_SLUG));
    // Demo users are global — remove by email/phone so re-seed stays clean.
    // Their audit rows went with the tenant above; audit_logs.actor_user_id is
    // ON DELETE NO ACTION, so this would otherwise fail on a used tenant.
    await db.delete(users).where(
      sql`${users.email} IN ('principal@sunrise.demo','teacher@sunrise.demo','admin@sunrise.demo','parent@sunrise.demo')
        OR ${users.phone} = ${PARENT_PHONE}`,
    );
  });
  log('cleanup', `removed previous ${DEMO_SLUG}`);

  const [tenant] = await db
    .insert(tenants)
    .values({
      slug: DEMO_SLUG,
      name: 'Sunrise Public School',
      legalName: 'Sunrise Education Society',
      status: 'active',
      planTier: 'pilot',
      ownerName: 'Demo Owner',
      ownerPhone: '919811122233',
      ownerEmail: 'owner@sunrise.demo',
      // Onboarding-complete so dev/QA logins skip the wizard. Use
      // `pnpm db:seed:onboarding` when you need to exercise the wizard itself.
      onboardingStep: 'first_attendance',
      onboardingCompletedAt: new Date(),
      activatedAt: new Date(),
      hasSampleData: true,
      primaryColor: '#1B5E9C',
    })
    .returning();
  log('tenant', `${tenant.name} (${tenant.slug})`);

  const [branch] = await db
    .insert(branches)
    .values({
      tenantId: tenant.id,
      code: 'MAIN',
      name: 'Main Campus',
      board: 'cbse',
      udiseCode: '07012345678',
      addressLine1: '12 MG Road',
      city: 'Bengaluru',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      pincode: '560001',
      phone: '918022233344',
      email: 'office@sunrise.demo',
    })
    .returning();
  log('branch', branch.name);

  const year = currentAcademicYear();
  const [session] = await db
    .insert(academicSessions)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      name: year.name,
      startDate: year.startDate,
      endDate: year.endDate,
      isCurrent: true,
    })
    .returning();
  log('session', session.name);

  const classRows = await db
    .insert(classes)
    .values([
      {
        tenantId: tenant.id,
        branchId: branch.id,
        name: 'V',
        level: 5,
        stage: 'primary',
      },
      {
        tenantId: tenant.id,
        branchId: branch.id,
        name: 'VI',
        level: 6,
        stage: 'middle',
      },
    ])
    .returning();
  const classV = classRows.find((c) => c.name === 'V')!;
  const classVi = classRows.find((c) => c.name === 'VI')!;

  const [sectionVa] = await db
    .insert(sections)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      classId: classV.id,
      academicSessionId: session.id,
      name: 'A',
      capacity: 40,
      roomNo: '101',
    })
    .returning();
  const [sectionVia] = await db
    .insert(sections)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      classId: classVi.id,
      academicSessionId: session.id,
      name: 'A',
      capacity: 40,
      roomNo: '201',
    })
    .returning();
  log('classes', 'V-A, VI-A');

  const principalRole = await roleId('principal');
  const teacherRole = await roleId('class_teacher');
  const adminRole = await roleId('school_admin');
  const parentRole = await roleId('parent');

  async function createStaffUser(opts: {
    email: string;
    phone: string;
    fullName: string;
    employeeCode: string;
    designation: string;
    roleId: string;
    scopeType: 'branch' | 'section';
    sectionIds?: string[];
    isTeaching?: boolean;
  }) {
    const [user] = await db
      .insert(users)
      .values({
        email: opts.email,
        emailVerifiedAt: new Date(),
        phone: opts.phone,
        phoneVerifiedAt: new Date(),
        passwordHash,
        fullName: opts.fullName,
        displayName: opts.fullName.split(' ')[0],
        kind: 'staff',
        isMinor: false,
      })
      .returning();

    await db.insert(userTenantMemberships).values({
      tenantId: tenant.id,
      userId: user.id,
      branchId: branch.id,
      status: 'active',
      joinedAt: new Date(),
      memberCode: opts.employeeCode,
    });

    const [staffRow] = await db
      .insert(staff)
      .values({
        tenantId: tenant.id,
        branchId: branch.id,
        userId: user.id,
        employeeCode: opts.employeeCode,
        firstName: opts.fullName.split(' ')[0]!,
        lastName: opts.fullName.split(' ').slice(1).join(' ') || null,
        workEmail: opts.email,
        workPhone: opts.phone,
        designation: opts.designation,
        isTeaching: opts.isTeaching ?? true,
        status: 'active',
        joinedOn: '2024-06-01',
      })
      .returning();

    await db.insert(userRoleAssignments).values({
      tenantId: tenant.id,
      userId: user.id,
      roleId: opts.roleId,
      branchId: branch.id,
      scopeType: opts.scopeType,
      scopeRefs: opts.sectionIds ? { sectionIds: opts.sectionIds } : {},
      academicSessionId: session.id,
      isPrimary: true,
    });

    return { user, staff: staffRow };
  }

  const principal = await createStaffUser({
    email: 'principal@sunrise.demo',
    phone: '919811100001',
    fullName: 'Priya Nair',
    employeeCode: 'EMP001',
    designation: 'Principal',
    roleId: principalRole,
    scopeType: 'branch',
    isTeaching: false,
  });
  log('staff', 'principal@sunrise.demo');

  const teacher = await createStaffUser({
    email: 'teacher@sunrise.demo',
    phone: '919811100002',
    fullName: 'Rahul Mehta',
    employeeCode: 'EMP002',
    designation: 'Class Teacher',
    roleId: teacherRole,
    scopeType: 'section',
    sectionIds: [sectionVa.id],
    isTeaching: true,
  });
  log('staff', 'teacher@sunrise.demo (V-A)');

  await createStaffUser({
    email: 'admin@sunrise.demo',
    phone: '919811100003',
    fullName: 'Sneha Iyer',
    employeeCode: 'EMP003',
    designation: 'School Admin',
    roleId: adminRole,
    scopeType: 'branch',
    isTeaching: false,
  });
  log('staff', 'admin@sunrise.demo');

  await db.insert(staffSectionAssignments).values({
    tenantId: tenant.id,
    staffId: teacher.staff.id,
    sectionId: sectionVa.id,
    academicSessionId: session.id,
    assignmentType: 'class_teacher',
  });

  await db
    .update(sections)
    .set({ classTeacherStaffId: teacher.staff.id })
    .where(eq(sections.id, sectionVa.id));

  const [parentUser] = await db
    .insert(users)
    .values({
      phone: PARENT_PHONE,
      phoneVerifiedAt: new Date(),
      email: PARENT_EMAIL,
      emailVerifiedAt: new Date(),
      passwordHash,
      fullName: 'Vikram Sharma',
      displayName: 'Vikram',
      kind: 'guardian',
      isMinor: false,
    })
    .returning();

  await db.insert(userTenantMemberships).values({
    tenantId: tenant.id,
    userId: parentUser.id,
    branchId: branch.id,
    status: 'active',
    joinedAt: new Date(),
  });

  await db.insert(userRoleAssignments).values({
    tenantId: tenant.id,
    userId: parentUser.id,
    roleId: parentRole,
    branchId: branch.id,
    scopeType: 'self',
    scopeRefs: {},
    academicSessionId: session.id,
    isPrimary: true,
  });

  const [guardian] = await db
    .insert(guardians)
    .values({
      tenantId: tenant.id,
      userId: parentUser.id,
      fullName: 'Vikram Sharma',
      phone: PARENT_PHONE,
      email: 'parent@sunrise.demo',
      occupation: 'Engineer',
    })
    .returning();
  log('parent', `${PARENT_EMAIL} / ${DEMO_PASSWORD}`);

  // Aarav and Ananya are the two named children the parent login is attached
  // to; the rest fill the registers out so attendance is a percentage of a
  // class rather than of two people.
  const namedSpecs = [
    {
      firstName: 'Aarav',
      lastName: 'Sharma',
      dob: '2015-08-12',
      gender: 'male' as const,
      sectionId: sectionVa.id,
      classId: classV.id,
    },
    {
      firstName: 'Ananya',
      lastName: 'Sharma',
      dob: '2014-03-21',
      gender: 'female' as const,
      sectionId: sectionVia.id,
      classId: classVi.id,
    },
  ];

  const studentSpecs = [
    ...namedSpecs,
    ...rosterFiller(sectionVa.id, classV.id, 33, 2015),
    ...rosterFiller(sectionVia.id, classVi.id, 29, 2014),
  ].map((s, i) => ({
    ...s,
    admissionNo: `ADM${year.name.slice(0, 4)}${String(i + 1).padStart(3, '0')}`,
  }));

  const studentRows = await db
    .insert(students)
    .values(
      studentSpecs.map((s) => ({
        tenantId: tenant.id,
        branchId: branch.id,
        admissionNo: s.admissionNo,
        admissionDate: year.startDate,
        firstName: s.firstName,
        lastName: s.lastName,
        dateOfBirth: s.dob,
        gender: s.gender,
        apaarStatus: 'consent_pending' as const,
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
      })),
    )
    .returning({ id: students.id, admissionNo: students.admissionNo });

  const bySection = new Map<string, string[]>();
  const enrollmentRows = await db
    .insert(studentEnrollments)
    .values(
      studentRows.map((row, i) => {
        const spec = studentSpecs[i]!;
        const list = bySection.get(spec.sectionId) ?? [];
        list.push(row.id);
        bySection.set(spec.sectionId, list);
        return {
          tenantId: tenant.id,
          branchId: branch.id,
          studentId: row.id,
          academicSessionId: session.id,
          classId: spec.classId,
          sectionId: spec.sectionId,
          rollNo: String(list.length),
          status: 'active' as const,
          joinedOn: year.startDate,
        };
      }),
    )
    .returning({ id: studentEnrollments.id, studentId: studentEnrollments.studentId });

  const enrollmentByStudent = new Map(
    enrollmentRows.map((e) => [e.studentId, e.id]),
  );

  // Only the two named children hang off the demo parent login.
  await db.insert(studentGuardians).values(
    studentRows.slice(0, 2).map((row) => ({
      tenantId: tenant.id,
      studentId: row.id,
      guardianId: guardian.id,
      relation: 'father' as const,
      isPrimary: true,
      isEmergencyContact: true,
      canPayFees: true,
      canApproveLeave: true,
      canPickup: true,
      canViewAcademics: true,
      canMessageTeachers: true,
    })),
  );
  log('students', `${studentRows.length} across V-A and VI-A`);

  await seedDayInTheLife({
    tenantId: tenant.id,
    branchId: branch.id,
    academicSessionId: session.id,
    sections: [
      { id: sectionVa.id, studentIds: bySection.get(sectionVa.id) ?? [] },
      { id: sectionVia.id, studentIds: bySection.get(sectionVia.id) ?? [] },
    ],
    enrollmentByStudent,
    teacherStaffId: teacher.staff.id,
    principalUserId: principal.user.id,
  });

  process.stdout.write(`
Done. Demo credentials:

  Staff password:  ${DEMO_PASSWORD}
  Principal:       principal@sunrise.demo
  Class teacher:   teacher@sunrise.demo
  School admin:    admin@sunrise.demo
  Parent:          ${PARENT_EMAIL}

  Tenant slug:     ${DEMO_SLUG}
  Tenant id:       ${tenant.id}

`);
  await client.end();
}

main().catch(async (err) => {
  process.stderr.write(
    `\nDemo seed failed: ${err instanceof Error ? err.message : String(err)}\n\n`,
  );
  await client.end();
  process.exit(1);
});
