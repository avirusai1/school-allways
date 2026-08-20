import { describe, expect, it, vi } from 'vitest';

import type { GrantedPermission } from '../../common/context/request-context';
import { FamilyService } from './family.service';

const config = {
  getOrThrow: vi.fn((key: string) => {
    if (key === 'FILES_BASE_URL') return 'https://files.example.com';
    throw new Error(key);
  }),
};


const subscriptions = {
  statusForStudents: vi.fn(async (ids: string[]) => {
    const map = new Map();
    for (const id of ids) {
      map.set(id, {
        studentId: id,
        subscribed: true,
        status: 'active',
        expiresAt: null,
        graceEndsAt: null,
      });
    }
    return map;
  }),
  assertSubscribed: vi.fn(async () => undefined),
};

describe('FamilyService.listChildren', () => {
  const storage = { writeBuffer: vi.fn() };
  const listChain = {
    from: () => listChain,
    leftJoin: () => listChain,
    where: () => listChain,
    limit: async () => [
      {
        id: 's1',
        firstName: 'Aarav',
        lastName: 'Sharma',
        photoPath: null,
        className: '5',
        sectionName: 'A',
      },
    ],
  };
  const db = {
    run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: () => listChain,
      }),
    ),
  };

  const fees = {
    outstandingPaiseForStudent: vi.fn(async () => 0),
    familyFeesOverview: vi.fn(),
  };

  it('returns nothing when self-scope has empty studentIds', async () => {
    const grant: GrantedPermission = {
      code: 'family.child.read',
      scope: 'self',
      sectionIds: [],
      subjectIds: [],
      studentIds: [],
    };
    // Empty self scope must not query — MATCH NOTHING.
    const emptyChain = {
      from: () => emptyChain,
      leftJoin: () => emptyChain,
      where: () => emptyChain,
      limit: async () => [],
    };
    const emptyDb = {
      run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          select: () => emptyChain,
        }),
      ),
    };
    const transport = {
      familyBusForStudent: vi.fn().mockResolvedValue(null),
    };
    const svc = new FamilyService(emptyDb as never, fees as never, transport as never, storage as never, subscriptions as never, config as never);
    const result = await svc.listChildren(grant);
    expect(result.data).toEqual([]);
  });

  it('lists children in self scope', async () => {
    const transport = {
      familyBusForStudent: vi.fn().mockResolvedValue(null),
    };
    const service = new FamilyService(db as never, fees as never, transport as never, storage as never, subscriptions as never, config as never);
    const grant: GrantedPermission = {
      code: 'family.child.read',
      scope: 'self',
      sectionIds: [],
      subjectIds: [],
      studentIds: ['s1'],
    };
    const result = await service.listChildren(grant);
    expect(result.data[0]?.fullName).toBe('Aarav Sharma');
    expect(result.data[0]?.classLabel).toBe('Class 5-A');
  });
});

describe('FamilyService.updateChildProfile', () => {
  const storage = { writeBuffer: vi.fn() };
  const fees = { outstandingPaiseForStudent: vi.fn() };
  const transport = { familyBusForStudent: vi.fn() };

  const selfGrant: GrantedPermission = {
    code: 'family.child.profile.manage',
    scope: 'self',
    sectionIds: [],
    subjectIds: [],
    studentIds: ['mine'],
  };

  function serviceWritingBack(row: Record<string, unknown>) {
    const written: Record<string, unknown>[] = [];
    const db = {
      run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          update: () => ({
            set: (patch: Record<string, unknown>) => {
              written.push(patch);
              return { where: () => ({ returning: async () => [row] }) };
            },
          }),
        }),
      ),
    };
    return {
      written,
      service: new FamilyService(db as never, fees as never, transport as never, storage as never, subscriptions as never, config as never),
    };
  }

  it("refuses to touch another family's child", async () => {
    const { service } = serviceWritingBack({ id: 'theirs' });

    await expect(
      service.updateChildProfile('theirs', { city: 'Pune' }, selfGrant),
    ).rejects.toThrow();
  });

  it('writes only the fields the parent actually filled', async () => {
    const { service, written } = serviceWritingBack({
      id: 'mine',
      addressLine1: '14 MG Road',
      photoPath: null,
      dateOfBirth: null,
      bloodGroup: 'unknown',
    });

    const res = await service.updateChildProfile(
      'mine',
      { addressLine1: '14 MG Road' },
      selfGrant,
    );

    // A partial save must not null the fields the form never showed.
    expect(written[0]).toEqual({ addressLine1: '14 MG Road' });
    // And what is still blank comes back, so the screen knows if it is done.
    expect(res.missingFields).toEqual(['photo', 'dateOfBirth', 'bloodGroup']);
  });

  it('rejects an empty save rather than pretending it worked', async () => {
    const { service } = serviceWritingBack({ id: 'mine' });

    await expect(service.updateChildProfile('mine', {}, selfGrant)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});

describe('FamilyService.selfHome', () => {
  function build(rows: Record<string, unknown[]>) {
    let call = 0;
    // Query order in selfHome(): student, attendance, dueHomework, overdue, notices.
    const order = ['student', 'attendance', 'homework', 'overdue', 'notices'];
    const chain = () => {
      const key = order[call++] ?? 'notices';
      const c: Record<string, unknown> = {};
      const self = () => c;
      c.from = self;
      c.innerJoin = self;
      c.leftJoin = self;
      c.where = self;
      c.orderBy = self;
      c.limit = () => Promise.resolve(rows[key] ?? []);
      Object.assign(c, {
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(rows[key] ?? []).then(res, rej),
      });
      return c;
    };
    const db = {
      run: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select: () => chain() }),
      ),
    };
    return new FamilyService(
      db as never,
      { outstandingPaiseForStudent: vi.fn() } as never,
      {} as never,
      { writeBuffer: vi.fn() } as never,
      subscriptions as never,
      config as never,
    );
  }

  const grant: GrantedPermission = {
    code: 'student.self.read',
    scope: 'self',
    sectionIds: [],
    subjectIds: [],
    studentIds: ['stu-1'],
  };

  it('returns the student their own feed without any fee figure', async () => {
    const svc = build({
      student: [
        {
          id: 'stu-1',
          firstName: 'Aadhya',
          lastName: 'Shetty',
          photoPath: null,
          className: '5',
          sectionName: 'A',
          rollNo: '12',
        },
      ],
      attendance: [{ status: 'present', inTime: '08:41' }],
      homework: [],
      overdue: [],
      notices: [],
    });

    const res = await svc.selfHome(grant);
    expect(res.student.id).toBe('stu-1');
    expect(res.student.classLabel).toBe('5-A');
    // A student holds !fee.invoice.read — the feed must never carry a real figure.
    expect(res.today.feesDuePaise).toBe(0);
    expect(res).not.toHaveProperty('bus');
  });

  it('refuses an account with no linked student record', async () => {
    const svc = build({});
    await expect(
      svc.selfHome({ ...grant, studentIds: [] }),
    ).rejects.toThrow(/not linked to a student/i);
  });
});
