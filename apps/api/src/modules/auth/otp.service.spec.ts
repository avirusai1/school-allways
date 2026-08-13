import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiException } from '../../common/errors/api.exception';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  const redis = {
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
  };

  const repo = {
    findUserByPhone: vi.fn(),
    findUserByEmail: vi.fn(),
    invalidateOtps: vi.fn(),
    insertOtp: vi.fn(),
    findLatestOtp: vi.fn(),
    incrementOtpAttempts: vi.fn(),
    consumeOtp: vi.fn(),
  };

  const db = {
    runUnscoped: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    runAsActingUser: vi.fn(async (_id: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => [],
              }),
            }),
          }),
        }),
      }),
    ),
  };

  const config = {
    get: vi.fn((key: string) => {
      if (key === 'OTP_TTL_SECONDS') return 300;
      if (key === 'OTP_MAX_ATTEMPTS') return 5;
      if (key === 'NODE_ENV') return 'test';
      return undefined;
    }),
  };

  let service: OtpService;

  beforeEach(() => {
    vi.clearAllMocks();
    redis.incr.mockResolvedValue(1);
    repo.findUserByPhone.mockResolvedValue(null);
    repo.findUserByEmail.mockResolvedValue(null);
    service = new OtpService(config as never, db as never, repo as never, redis as never);
  });

  it('rejects expired OTP with OTP_INVALID', async () => {
    repo.findLatestOtp.mockResolvedValue({
      id: 'otp-1',
      codeHash: 'abc',
      expiresAt: new Date(Date.now() - 1000),
      consumedAt: null,
      attemptCount: 0,
    });

    await expect(
      service.verifyOtp({ phone: '919876543210', purpose: 'login', code: '123456' }),
    ).rejects.toMatchObject({ code: 'OTP_INVALID' });
  });

  it('invalidates OTP after max attempts', async () => {
    repo.findLatestOtp.mockResolvedValue({
      id: 'otp-1',
      codeHash: 'expected',
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      attemptCount: 4,
    });

    await expect(
      service.verifyOtp({ phone: '919876543210', purpose: 'login', code: '000000' }),
    ).rejects.toBeInstanceOf(ApiException);

    expect(repo.consumeOtp).toHaveBeenCalledWith({}, 'otp-1');
  });

  it('rate limits OTP requests per phone', async () => {
    redis.incr.mockResolvedValue(4);
    redis.ttl.mockResolvedValue(120);

    await expect(
      service.requestOtp({ phone: '919876543210', purpose: 'login' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
