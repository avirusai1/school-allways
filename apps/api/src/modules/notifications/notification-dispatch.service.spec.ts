import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationDispatchService } from './notification-dispatch.service';
import type { NotificationProvider } from './providers/notification-provider';

/**
 * Drizzle query builders are long chains that resolve at the end. This returns
 * one object that answers every chain method with itself and resolves to the
 * given rows, so a test can say what a query returns without modelling the
 * builder.
 */
function chain(rows: unknown[]): unknown {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => resolve(rows);
      }
      return () => chain(rows);
    },
  });
}

const TEMPLATES = [
  {
    tenantId: null,
    channel: 'sms',
    subject: null,
    body: '{{schoolName}} invited you: {{link}}',
    dltTemplateId: null,
    dltEntityId: null,
  },
  {
    tenantId: null,
    channel: 'whatsapp',
    subject: null,
    body: 'WA: {{link}}',
    dltTemplateId: null,
    dltEntityId: null,
  },
  {
    tenantId: null,
    channel: 'in_app',
    subject: 'Invited',
    body: 'You were invited',
    dltTemplateId: null,
    dltEntityId: null,
  },
  {
    tenantId: null,
    channel: 'push',
    subject: '{{studentName}} is absent',
    body: '{{studentName}} was marked absent on {{date}}',
    dltTemplateId: null,
    dltEntityId: null,
  },
];

describe('NotificationDispatchService', () => {
  let sent: Array<{ channel: string; to: string; body: string }>;
  let persisted: Array<Record<string, unknown>>;
  let templates: unknown[];
  let people: unknown[];
  let tokens: unknown[];
  let provider: NotificationProvider;

  const makeDb = () => {
    // asTenant is called for templates, then device tokens, then each persist.
    let tenantCall = 0;
    return {
      asTenant: vi.fn(async (_t: string, fn: (tx: unknown) => Promise<unknown>) => {
        const call = tenantCall++;
        return fn({
          select: () => chain(call === 0 ? templates : tokens),
          execute: async (query: unknown) => {
            persisted.push(query as Record<string, unknown>);
          },
        });
      }),
      runUnscoped: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select: () => chain(people) }),
      ),
    };
  };

  beforeEach(() => {
    sent = [];
    persisted = [];
    templates = TEMPLATES;
    people = [{ id: 'u1', phone: '919000000001', email: null }];
    tokens = [];
    provider = {
      name: 'test',
      channels: ['push', 'in_app', 'sms', 'whatsapp', 'email'],
      requiresDltTemplate: false,
      isStub: true,
      send: vi.fn(async (req) => {
        sent.push({ channel: req.channel, to: req.to, body: req.body });
        return { status: 'sent' as const, providerRef: 'ref', costPaise: 15 };
      }),
    };
  });

  const dispatch = () =>
    new NotificationDispatchService(makeDb() as never, provider);

  it('stops the paid ladder after the first success so one message is billed once', async () => {
    const result = await dispatch().dispatch({
      tenantId: 't1',
      templateCode: 'PARENT_PROFILE_INVITE',
      priority: 'high',
      variables: {},
      scheduledFor: null,
      targets: [
        { attemptId: 'a1', userId: 'u1', channel: 'sms', variables: { link: 'x' } },
        { attemptId: 'a2', userId: 'u1', channel: 'whatsapp', variables: { link: 'x' } },
      ],
    });

    // WhatsApp leads the ladder, so the SMS is skipped rather than sent.
    expect(sent).toHaveLength(1);
    expect(sent[0]!.channel).toBe('whatsapp');
    expect(result).toEqual({ sent: 1, failed: 0, skipped: 1 });
  });

  it('renders per-recipient variables into the body', async () => {
    await dispatch().dispatch({
      tenantId: 't1',
      templateCode: 'STAFF_INVITE',
      priority: 'high',
      variables: {},
      scheduledFor: null,
      targets: [
        {
          attemptId: 'a1',
          userId: 'u1',
          channel: 'sms',
          variables: { schoolName: 'Sunrise', link: 'saw.link/j/abc' },
        },
      ],
    });

    expect(sent[0]!.body).toBe('Sunrise invited you: saw.link/j/abc');
  });

  it('skips rather than fails when the recipient has no phone on file', async () => {
    people = [{ id: 'u1', phone: null, email: null }];

    const result = await dispatch().dispatch({
      tenantId: 't1',
      templateCode: 'STAFF_INVITE',
      priority: 'high',
      variables: {},
      scheduledFor: null,
      targets: [{ attemptId: 'a1', userId: 'u1', channel: 'sms', variables: {} }],
    });

    expect(provider.send).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, failed: 0, skipped: 1 });
  });

  it('fails the attempt when a real gateway needs a DLT id the template lacks', async () => {
    provider = { ...provider, requiresDltTemplate: true, isStub: false };

    const result = await dispatch().dispatch({
      tenantId: 't1',
      templateCode: 'STAFF_INVITE',
      priority: 'high',
      variables: {},
      scheduledFor: null,
      targets: [{ attemptId: 'a1', userId: 'u1', channel: 'sms', variables: {} }],
    });

    expect(result).toEqual({ sent: 0, failed: 1, skipped: 0 });
  });

  it('marks in_app delivered without calling a provider', async () => {
    const result = await dispatch().dispatch({
      tenantId: 't1',
      templateCode: 'STAFF_INVITE',
      priority: 'high',
      variables: {},
      scheduledFor: null,
      targets: [{ attemptId: 'a1', userId: 'u1', channel: 'in_app', variables: {} }],
    });

    expect(provider.send).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 1, failed: 0, skipped: 0 });
  });

  it('fails loudly when the template code was never seeded', async () => {
    templates = [];

    const result = await dispatch().dispatch({
      tenantId: 't1',
      templateCode: 'NEVER_SEEDED',
      priority: 'high',
      variables: {},
      scheduledFor: null,
      targets: [{ attemptId: 'a1', userId: 'u1', channel: 'sms', variables: {} }],
    });

    expect(result).toEqual({ sent: 0, failed: 1, skipped: 0 });
  });

  it('sends a push to every registered token, not just the first', async () => {
    tokens = [
      { userId: 'u1', token: 'token-phone' },
      { userId: 'u1', token: 'token-tablet' },
    ];

    const result = await dispatch().dispatch({
      tenantId: 't1',
      templateCode: 'STUDENT_ABSENT',
      priority: 'high',
      variables: {},
      scheduledFor: null,
      targets: [
        {
          attemptId: 'a1',
          userId: 'u1',
          channel: 'push',
          variables: { studentName: 'Aarav', date: '2026-08-13', studentId: 'stu-1' },
        },
      ],
    });

    expect(sent.map((s) => s.to)).toEqual(['token-phone', 'token-tablet']);
    expect(result).toEqual({ sent: 1, failed: 0, skipped: 0 });
  });
});
