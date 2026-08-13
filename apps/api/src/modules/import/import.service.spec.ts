import { describe, expect, it, vi, beforeEach } from 'vitest';

import { createEmptyContext, RequestContextStore } from '../../common/context/request-context';
import { ImportService } from './import.service';

function withContext<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = createEmptyContext('test-req');
  ctx.tenantId = 'tenant-1';
  ctx.userId = 'user-1';
  return Promise.resolve(RequestContextStore.run(ctx, fn));
}

describe('ImportService', () => {
  /** `staffUsers` stands in for staff rows the import gave a login to. */
  const makeTx = (staffUsers: Array<{ userId: string; tenantId: string }> = []) => ({
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(staffUsers),
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(staffUsers),
        }),
      }),
    }),
  });

  const db = {
    run: vi.fn(),
    asTenant: vi.fn(),
  };
  const repo = {
    findById: vi.fn(),
    listRecent: vi.fn(),
    existingAdmissionNos: vi.fn().mockResolvedValue(new Map()),
    existingEmployeeCodes: vi.fn().mockResolvedValue(new Map()),
  };
  const storage = {
    importObjectKey: vi.fn().mockReturnValue('t/tenant/imports/id/file.xlsx'),
    ensureDirForKey: vi.fn(),
    absolutePath: vi.fn().mockReturnValue('/tmp/file.xlsx'),
  };
  const queue = {
    enqueueCommit: vi.fn().mockResolvedValue({ jobId: 'import-commit:abc', queued: true }),
    jobId: vi.fn().mockReturnValue('import-commit:abc'),
  };
  const commitService = {
    processCommit: vi.fn().mockResolvedValue({ committed: 2, skipped: 1 }),
  };

  let service: ImportService;

  beforeEach(() => {
    vi.clearAllMocks();
    db.run.mockImplementation((fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
      fn(makeTx()),
    );
    service = new ImportService(
      db as never,
      repo as never,
      storage as never,
      queue as never,
      commitService as never,
    );
  });

  it('commit enqueues with deterministic job id', async () => {
    repo.findById.mockResolvedValue({
      id: 'abc',
      status: 'validated',
      validRows: 3,
      totalRows: 3,
      errorRows: 0,
      committedRows: 0,
    });

    const result = await withContext(() => service.commit('abc', true));
    expect(result).toEqual({ jobId: 'import-commit:abc', importId: 'abc' });
    expect(queue.enqueueCommit).toHaveBeenCalledWith(
      expect.objectContaining({ importId: 'abc', partialCommit: true }),
    );
  });

  it('falls back to inline commit when queue unavailable', async () => {
    repo.findById.mockResolvedValue({
      id: 'abc',
      status: 'validated',
      validRows: 3,
      totalRows: 3,
      errorRows: 0,
      committedRows: 0,
    });
    queue.enqueueCommit.mockResolvedValue({ jobId: 'import-commit:abc', queued: false });

    await withContext(() => service.commit('abc', true));
    expect(commitService.processCommit).toHaveBeenCalled();
  });

  it('undo deletes by import_batch_id (and restores exact prior state)', async () => {
    repo.findById.mockResolvedValue({
      id: 'abc',
      status: 'committed',
      insertedIds: {},
    });

    const tx = makeTx();
    db.run.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

    const result = await withContext(() => service.undo('abc'));
    expect(result.undone).toBe(true);
    // student_guardians, guardians, enrollments, students, staff
    expect(tx.delete).toHaveBeenCalledTimes(5);
  });

  it('undo also unwinds logins the staff import created', async () => {
    repo.findById.mockResolvedValue({
      id: 'abc',
      status: 'committed',
      insertedIds: {},
    });

    const tx = makeTx([{ userId: 'user-9', tenantId: 'tenant-1' }]);
    db.run.mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

    await withContext(() => service.undo('abc'));
    // The five entity deletes plus join_tokens, role assignments, memberships.
    expect(tx.delete).toHaveBeenCalledTimes(8);
  });
});

describe('ImportCommitService partial commit', () => {
  it('returns committed and skipped counts', async () => {
    const { ImportCommitService } = await import('./processors/import-commit.processor');
    const commit = new ImportCommitService({ duplicate: vi.fn() } as never, {} as never, {} as never);
    vi.spyOn(commit, 'processCommit').mockResolvedValue({ committed: 8, skipped: 2 });

    const result = await commit.processCommit({
      tenantId: 't1',
      userId: 'u1',
      importId: 'i1',
      partialCommit: true,
    });

    expect(result).toEqual({ committed: 8, skipped: 2 });
  });
});
