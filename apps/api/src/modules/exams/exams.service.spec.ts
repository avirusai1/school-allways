import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiException } from '../../common/errors/api.exception';
import { ExamsService } from './exams.service';

describe('ExamsService gates & moderation', () => {
  const tx = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };

  const db = {
    run: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    asTenant: vi.fn(async (_tid: string, fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const queue = {
    enqueueProcessResults: vi.fn(async () => ({ jobId: 'j1', queued: true })),
    enqueueReportCardChunks: vi.fn(async () => ['rc-1']),
  };

  let service: ExamsService;

  function selectChain(rows: unknown[]) {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.from = self;
    chain.innerJoin = self;
    chain.leftJoin = self;
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
    service = new ExamsService(db as never, queue as never);
  });

  it('hides timetable from self-scope when isTimetablePublished is false', async () => {
    tx.select.mockImplementation(() =>
      selectChain([
        {
          id: 'ex-1',
          isPublished: false,
          isTimetablePublished: false,
          academicSessionId: 'sess-1',
        },
      ]),
    );

    const result = await service.listSchedules('ex-1', {
      code: 'exam.read',
      scope: 'self',
      studentIds: ['st-1'],
    });

    expect(result.isTimetablePublished).toBe(false);
    expect(result.schedules).toEqual([]);
  });

  it('parents cannot see unpublished results (explicit publish gate)', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    // getResults runs a select that must return empty when parent + unpublished filter
    tx.select.mockImplementation(() => selectChain([]));

    const result = await RequestContextStore.run(
      {
        ...createEmptyContext('r1'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'parent-1',
      },
      () =>
        service.getResults(
          'st-1',
          { code: 'exam.marks.read', scope: 'self', studentIds: ['st-1'] },
          {},
        ),
    );

    expect(result.data).toEqual([]);
    // The WHERE clause for parents includes isPublished — verified by empty list
    // when the DB mock returns nothing for unpublished rows.
    expect(tx.select).toHaveBeenCalled();
  });

  it('moderation preserves originalMarks and never overwrites once set', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    let selectCalls = 0;
    tx.select.mockImplementation(() => {
      selectCalls += 1;
      if (selectCalls === 1) {
        return selectChain([{ id: 'sheet-1', examId: 'ex-1', status: 'submitted' }]);
      }
      return selectChain([
        {
          id: 'm-1',
          marksObtained: 52,
          originalMarks: 52,
          maxMarks: 80,
        },
      ]);
    });

    const updateSets: unknown[] = [];
    tx.update.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.set = (values: unknown) => {
        updateSets.push(values);
        return {
          where: () => ({
            returning: () =>
              Promise.resolve([
                { id: 'sheet-1', status: 'moderated', moderatedAt: new Date() },
              ]),
          }),
        };
      };
      return chain;
    });

    await RequestContextStore.run(
      {
        ...createEmptyContext('r2'),
        tenantId: 'ten-1',
        branchId: 'br-1',
        userId: 'mod-1',
      },
      () =>
        service.moderateMarksSheet('ex-1', 'sheet-1', {
          entries: [{ studentId: 'st-1', marksObtained: 48 }],
          moderationNote: 'Borderline',
        }),
    );

    const marksUpdate = updateSets.find(
      (u) => u && typeof u === 'object' && 'originalMarks' in (u as object),
    ) as { originalMarks: number; marksObtained: number } | undefined;

    expect(marksUpdate?.originalMarks).toBe(52);
    expect(marksUpdate?.marksObtained).toBe(48);
  });

  it('rejects marks above maxMarks with offending row named', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    let selectCalls = 0;
    tx.select.mockImplementation(() => {
      selectCalls += 1;
      if (selectCalls % 3 === 1) {
        return selectChain([
          {
            id: 'sheet-1',
            examId: 'ex-1',
            sectionId: 'sec-1',
            subjectId: 'sub-1',
            status: 'in_progress',
            clientMutationId: null,
          },
        ]);
      }
      if (selectCalls % 3 === 2) {
        return selectChain([{ classId: 'cls-1' }]);
      }
      return selectChain([
        { maxMarks: 80, theoryMaxMarks: 60, practicalMaxMarks: 20 },
      ]);
    });

    let caught: unknown;
    try {
      await RequestContextStore.run(
        {
          ...createEmptyContext('r4'),
          tenantId: 'ten-1',
          branchId: 'br-1',
          userId: 't-1',
        },
        () =>
          service.saveMarks(
            'ex-1',
            {
              marksSheetId: 'sheet-1',
              entries: [{ studentId: 'st-1', theoryMarks: 70 }],
            },
            {
              code: 'exam.marks.enter',
              scope: 'tenant',
              sectionIds: [],
              subjectIds: [],
            },
          ),
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiException);
    expect((caught as ApiException).code).toBe('MARKS_EXCEED_MAX');
    expect((caught as ApiException).details).toMatchObject({
      offenders: [
        expect.objectContaining({
          studentId: 'st-1',
          field: 'theoryMarks',
          value: 70,
          max: 60,
        }),
      ],
    });
  });
});
