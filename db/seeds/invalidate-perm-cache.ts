/**
 * Bust Redis permission grants after a catalogue seed.
 *
 * Role/permission rows live in Postgres; the API caches the *resolved* grant
 * set per user under `perm:v1:…` for five minutes. Seed runs outside Nest, so
 * `PermissionResolverService.invalidate()` never fires — without this step a
 * live API keeps serving the pre-seed grant set until TTL, which is how a
 * freshly-seeded `staff.account.issue` looked like it needed a manual Redis
 * flush in E9.
 *
 * Fresh clones (Redis empty / API not yet started) are a no-op either way.
 * REDIS_URL unset → skip, same pattern as the platform-admin bootstrap.
 *
 * Tiny RESP client on purpose: @saw/db must not take an ioredis dependency
 * just for this one post-seed step.
 */

import net from 'node:net';

function encodeResp(args: string[]): Buffer {
  const parts = [`*${args.length}\r\n`];
  for (const arg of args) {
    const buf = Buffer.from(arg, 'utf8');
    parts.push(`$${buf.length}\r\n`, arg, `\r\n`);
  }
  return Buffer.from(parts.join(''), 'utf8');
}

function parseRedisUrl(urlStr: string): { host: string; port: number; password?: string } {
  const u = new URL(urlStr);
  return {
    host: u.hostname || '127.0.0.1',
    port: u.port ? Number(u.port) : 6379,
    password: u.password ? decodeURIComponent(u.password) : undefined,
  };
}

/** Read one Redis reply (simple strings / errors / bulk / arrays of bulks). */
async function readReply(socket: net.Socket, buf: { data: Buffer }): Promise<unknown> {
  for (;;) {
    const data = buf.data;
    if (data.length === 0) {
      await new Promise<void>((resolve, reject) => {
        const onData = (chunk: Buffer) => {
          cleanup();
          buf.data = Buffer.concat([buf.data, chunk]);
          resolve();
        };
        const onErr = (err: Error) => {
          cleanup();
          reject(err);
        };
        const cleanup = () => {
          socket.off('data', onData);
          socket.off('error', onErr);
        };
        socket.on('data', onData);
        socket.on('error', onErr);
      });
      continue;
    }

    const type = String.fromCharCode(data[0]);
    const nl = data.indexOf('\r\n');
    if (nl < 0) {
      await new Promise<void>((resolve, reject) => {
        const onData = (chunk: Buffer) => {
          cleanup();
          buf.data = Buffer.concat([buf.data, chunk]);
          resolve();
        };
        const onErr = (err: Error) => {
          cleanup();
          reject(err);
        };
        const cleanup = () => {
          socket.off('data', onData);
          socket.off('error', onErr);
        };
        socket.on('data', onData);
        socket.on('error', onErr);
      });
      continue;
    }

    if (type === '+' || type === '-' || type === ':') {
      const line = data.subarray(1, nl).toString('utf8');
      buf.data = data.subarray(nl + 2);
      if (type === '-') throw new Error(`Redis error: ${line}`);
      return type === ':' ? Number(line) : line;
    }

    if (type === '$') {
      const len = Number(data.subarray(1, nl).toString('utf8'));
      if (len < 0) {
        buf.data = data.subarray(nl + 2);
        return null;
      }
      const start = nl + 2;
      const end = start + len;
      if (data.length < end + 2) {
        await new Promise<void>((resolve, reject) => {
          const onData = (chunk: Buffer) => {
            cleanup();
            buf.data = Buffer.concat([buf.data, chunk]);
            resolve();
          };
          const onErr = (err: Error) => {
            cleanup();
            reject(err);
          };
          const cleanup = () => {
            socket.off('data', onData);
            socket.off('error', onErr);
          };
          socket.on('data', onData);
          socket.on('error', onErr);
        });
        continue;
      }
      const value = data.subarray(start, end).toString('utf8');
      buf.data = data.subarray(end + 2);
      return value;
    }

    if (type === '*') {
      const count = Number(data.subarray(1, nl).toString('utf8'));
      buf.data = data.subarray(nl + 2);
      if (count < 0) return null;
      const items: unknown[] = [];
      for (let i = 0; i < count; i++) {
        items.push(await readReply(socket, buf));
      }
      return items;
    }

    throw new Error(`Unsupported Redis reply type: ${type}`);
  }
}

async function withRedis<T>(
  urlStr: string,
  fn: (send: (...args: string[]) => Promise<unknown>) => Promise<T>,
): Promise<T> {
  const { host, port, password } = parseRedisUrl(urlStr);
  const socket = net.createConnection({ host, port });
  const buf = { data: Buffer.alloc(0) };

  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });

  const send = async (...args: string[]) => {
    socket.write(encodeResp(args));
    return readReply(socket, buf);
  };

  try {
    if (password) await send('AUTH', password);
    return await fn(send);
  } finally {
    socket.end();
  }
}

/**
 * Delete every `perm:v1:*` key. Matches PermissionResolverService.invalidate()
 * with no tenant/user filter — seed can change any role bundle.
 */
export async function invalidatePermissionCaches(
  redisUrl: string | undefined,
  log: (step: string, detail?: string) => void,
): Promise<void> {
  const url = redisUrl?.trim();
  if (!url) {
    log('permission cache', 'skipped — REDIS_URL unset');
    return;
  }

  try {
    const deleted = await withRedis(url, async (send) => {
      const keys = (await send('KEYS', 'perm:v1:*')) as string[] | null;
      if (!keys?.length) return 0;
      // DEL accepts multiple keys; chunk in case of a large fleet.
      let n = 0;
      for (let i = 0; i < keys.length; i += 200) {
        const chunk = keys.slice(i, i + 200);
        n += Number(await send('DEL', ...chunk));
      }
      return n;
    });
    log('permission cache', deleted === 0 ? 'empty (nothing to bust)' : `deleted ${deleted} perm:v1:* key(s)`);
  } catch (err) {
    // Seed itself succeeded; a Redis blip must not fail the deploy. Operators
    // still get a clear line — TTL (5 min) is the safety net.
    log(
      'permission cache',
      `WARN — could not bust: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
