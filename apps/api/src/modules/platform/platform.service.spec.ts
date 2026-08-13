import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';

import { ApiException } from '../../common/errors/api.exception';
import { RequestContextStore, createEmptyContext } from '../../common/context/request-context';
import { FeatureFlagsService } from './feature-flags.service';
import { PlatformService } from './platform.service';
import { RollupService } from './rollup.service';

describe('FeatureFlagsService.bucket', () => {
  it('is stable for the same tenant+flag', () => {
    const svc = Object.create(FeatureFlagsService.prototype) as FeatureFlagsService;
    const a = svc.bucket('tenant-aaa', 'module.transport');
    const b = svc.bucket('tenant-aaa', 'module.transport');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
  });
});

describe('RollupService.score', () => {
  const rollup = Object.create(RollupService.prototype) as RollupService;

  const base = {
    tenantId: 't1',
    day: '2026-08-10',
    branchCount: 1,
    studentCount: 100,
    staffCount: 20,
    guardianCount: 80,
    activeClassCount: 10,
    dauStaff: 0,
    dauParents: 0,
    mauStaff: 0,
    mauParents: 0,
    parentActivationBp: 0,
    attendanceRegistersMarked: 8,
    attendanceRegistersExpected: 10,
    homeworkPosted: 2,
    announcementsSent: 1,
    messagesSent: 0,
    marksEntered: 0,
    reportCardsPublished: 0,
    booksOpened: 0,
    tripsRun: 0,
    invoicesRaised: 0,
    feesCollectedPaise: 0,
    feesOutstandingPaise: 0,
    onlinePaymentCount: 0,
    smsSent: 0,
    smsCostPaise: 0,
    whatsappSent: 0,
    pushSent: 0,
    storageBytes: 0,
    apiRequests: 0,
    egressBytes: 0,
    apaarGenerated: 0,
    apaarPending: 0,
    consentPending: 0,
  };

  it('flags at_risk when attendance <60% for 3 consecutive days', () => {
    const result = rollup.score(base, [0.4, 0.5, 0.3]);
    expect(result.band).toBe('at_risk');
    expect(result.riskReasons[0]).toMatch(/3 consecutive/);
  });

  it('scores healthy when engagement is strong and no risk streak', () => {
    const result = rollup.score(base, [0.9, 0.85, 0.8]);
    expect(result.band).toBe('healthy');
    expect(result.riskReasons).toHaveLength(0);
  });
});

describe('PlatformService.createSupportSession', () => {
  it('rejects reason under 20 characters', async () => {
    const svc = new PlatformService(
      { run: async () => undefined } as never,
      { notify: async () => ({ queued: 0, deferred: false }) } as never,
    );

    await expect(
      RequestContextStore.run(
        {
          ...createEmptyContext('r1'),
          tenantId: null,
          userId: 'agent-1',
          isPlatformAdmin: true,
        },
        () =>
          svc.createSupportSession({
            tenantId: '11111111-1111-1111-1111-111111111111',
            reason: 'too short',
          }),
      ),
    ).rejects.toMatchObject({ code: 'REASON_TOO_SHORT' } as Partial<ApiException>);
  });
});

describe('platform module import hygiene', () => {
  it('does not import forbidden tenant-data tables from @saw/db', () => {
    const check = execSync(
      `grep -rE "from '@saw/db'" src/modules/platform --include='*.ts' --exclude='*.spec.ts' | grep -E "\\\\bstudents\\\\b|\\\\bguardians\\\\b|\\\\bmarks\\\\b|\\\\binvoices\\\\b|\\\\bmessages\\\\b|\\\\bpayments\\\\b" || true`,
      { encoding: 'utf8' },
    );
    expect(check.trim()).toBe('');
  });
});
