import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiException } from '../../common/errors/api.exception';
import { BooksService } from './books.service';

describe('BooksService', () => {
  const tx = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };

  const db = {
    run: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'FILES_BASE_URL') return 'https://files.example.com';
      if (key === 'JWT_ACCESS_SECRET') return 'x'.repeat(32);
      throw new Error(key);
    }),
    get: vi.fn(() => undefined),
  };

  let service: BooksService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BooksService(db as never, config as never);
  });

  it('rejects school_upload without copyright acceptance', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    await expect(
      RequestContextStore.run(
        {
          ...createEmptyContext('r1'),
          tenantId: 'ten-1',
          branchId: 'br-1',
          userId: 'u-1',
        },
        () =>
          service.createBook({
            title: 'Math Textbook',
            source: 'school_upload',
            copyrightAccepted: false,
          }),
      ),
    ).rejects.toMatchObject({ code: 'COPYRIGHT_REQUIRED' } as Partial<ApiException>);
  });

  it('signed download URL verifies with HMAC', () => {
    const url = service['signFileUrl']('t/ten/books/b1/v1/ch01.pdf');
    const u = new URL(url);
    const expires = Number(u.searchParams.get('expires'));
    const sig = u.searchParams.get('sig')!;
    expect(service.verifySignedUrl('t/ten/books/b1/v1/ch01.pdf', expires, sig)).toBe(
      true,
    );
    expect(service.verifySignedUrl('t/ten/books/b1/v1/ch01.pdf', expires, 'deadbeef')).toBe(
      false,
    );
  });

  it('a student cannot list files of a book not mapped to their class', async () => {
    const { RequestContextStore, createEmptyContext } = await import(
      '../../common/context/request-context'
    );

    let selectCalls = 0;
    tx.select.mockImplementation(() => {
      selectCalls += 1;
      const rows =
        selectCalls === 1
          ? [{ id: 'book-other', status: 'published', source: 'school_upload', externalUrl: null, subjectId: null }]
          : selectCalls === 2
            ? [{ sectionId: 'sec-other', classId: 'class-other' }]
            : [];
      return {
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(rows),
            orderBy: () => Promise.resolve(rows),
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve(rows).then(resolve, reject),
          }),
        }),
      };
    });

    const grant = {
      code: 'book.read',
      scope: 'self' as const,
      studentIds: ['child-1'],
    };

    await expect(
      RequestContextStore.run(
        {
          ...createEmptyContext('book-files-idor'),
          tenantId: 'ten-1',
          branchId: 'br-1',
          userId: 'student-1',
        },
        () => service.listFiles('book-other', grant),
      ),
    ).rejects.toMatchObject({ code: 'SCOPE_VIOLATION' } as Partial<ApiException>);
  });
});
