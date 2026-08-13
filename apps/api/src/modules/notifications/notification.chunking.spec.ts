import { describe, expect, it } from 'vitest';

import { __testing } from './notification.service';
import type { DispatchTarget } from './notification-dispatch.service';

const { chunkByRecipient } = __testing;

function targets(users: number, channels: string[]): DispatchTarget[] {
  const out: DispatchTarget[] = [];
  for (let u = 0; u < users; u += 1) {
    for (const channel of channels) {
      out.push({
        attemptId: `${u}-${channel}`,
        userId: `u${u}`,
        channel: channel as DispatchTarget['channel'],
        variables: {},
      });
    }
  }
  return out;
}

describe('chunkByRecipient', () => {
  it('never splits one recipient across two jobs', () => {
    // 400 parents on three channels at a limit of 200 is the case that billed
    // two of them twice: the ladder can only dedupe within a single job.
    const chunks = chunkByRecipient(targets(400, ['in_app', 'sms', 'whatsapp']), 200);

    for (const chunk of chunks) {
      const seen = new Set(chunk.map((t) => t.userId));
      for (const userId of seen) {
        const here = chunk.filter((t) => t.userId === userId).length;
        const everywhere = chunks
          .flat()
          .filter((t) => t.userId === userId).length;
        expect(here).toBe(everywhere);
      }
    }
  });

  it('keeps every row exactly once', () => {
    const all = targets(400, ['in_app', 'sms', 'whatsapp']);
    const chunks = chunkByRecipient(all, 200);
    expect(chunks.flat()).toHaveLength(all.length);
    expect(new Set(chunks.flat().map((t) => t.attemptId)).size).toBe(all.length);
  });

  it('allows a chunk to exceed the limit rather than split a recipient', () => {
    const chunks = chunkByRecipient(targets(1, ['in_app', 'sms', 'whatsapp']), 2);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(3);
  });
});
