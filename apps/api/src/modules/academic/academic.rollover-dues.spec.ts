import { describe, expect, it, vi } from 'vitest';

import { unpaidDuesWarning } from './academic.rollover';

describe('unpaidDuesWarning', () => {
  it('omits the warning when every promoted student is clear', async () => {
    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const result = await unpaidDuesWarning(tx as never, 'session-1', ['s1', 's2']);
    expect(result).toBeNull();
  });

  it('aggregates outstanding balances in one grouped result', async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { studentId: 's1', totalPaise: 1_250_00 },
      { studentId: 's2', totalPaise: 500_00 },
      { studentId: 's3', totalPaise: 2_480_00 },
    ]);
    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ groupBy }),
        }),
      }),
    };

    const result = await unpaidDuesWarning(tx as never, 'session-1', [
      's1',
      's2',
      's3',
      's4',
    ]);

    expect(result).toEqual({
      type: 'unpaid_dues',
      count: 3,
      totalPaise: 4_230_00,
      studentIds: ['s1', 's2', 's3'],
    });
    expect(groupBy).toHaveBeenCalledTimes(1);
  });

  it('returns null for an empty promotee list without querying', async () => {
    const select = vi.fn();
    const result = await unpaidDuesWarning({ select } as never, 'session-1', []);
    expect(result).toBeNull();
    expect(select).not.toHaveBeenCalled();
  });

  it('caps studentIds at 50', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      studentId: `s${i}`,
      totalPaise: 100,
    }));
    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    };

    const result = await unpaidDuesWarning(
      tx as never,
      'session-1',
      rows.map((r) => r.studentId),
    );
    expect(result?.count).toBe(60);
    expect(result?.studentIds).toHaveLength(50);
    expect(result?.totalPaise).toBe(6000);
  });
});
