/**
 * The tenant-scoped database gateway. THIS IS THE SECURITY BOUNDARY.
 *
 * Every query that touches tenant data goes through `TenantDb.run()`, which:
 *   1. opens a transaction,
 *   2. issues `SET LOCAL app.tenant_id = <id from the verified JWT>`,
 *   3. runs your callback against that transaction.
 *
 * Because the setting is LOCAL, it dies with the transaction. A pooled
 * connection therefore cannot carry tenant context into the next request —
 * which is the classic multi-tenant leak, and the reason this is a service
 * rather than a bare drizzle instance you can import anywhere.
 *
 * The pool connects as `saw_app`, which is NOSUPERUSER and NOBYPASSRLS. Even
 * a successful SQL injection through this connection stays inside one school.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ RULE: never import the raw drizzle client outside this file.         │
 * │ If you need a query, take TenantDb as a dependency.                  │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '@saw/db';
import { RequestContextStore } from '../context/request-context';

export type Db = PostgresJsDatabase<typeof schema>;
/** What a callback receives — a transaction, never the raw pool. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

@Injectable()
export class TenantDbService implements OnModuleDestroy {
  private readonly logger = new Logger(TenantDbService.name);
  private readonly client: postgres.Sql;
  private readonly db: Db;

  constructor(private readonly config: ConfigService) {
    const url = this.config.getOrThrow<string>('DATABASE_APP_URL');

    if (url === this.config.get<string>('DATABASE_URL')) {
      // This would silently disable tenant isolation, because the owner role
      // bypasses RLS. Refuse to boot rather than run insecurely.
      throw new Error(
        'DATABASE_APP_URL must not equal DATABASE_URL. The API must connect as ' +
          'the restricted saw_app role, or Row Level Security is bypassed and ' +
          'tenant isolation is OFF.',
      );
    }

    this.client = postgres(url, {
      // Sized for a 2 OCPU box. Postgres max_connections is 100; the API and
      // the worker share it, so keep this modest.
      max: this.config.get<number>('DB_POOL_MAX') ?? 12,
      idle_timeout: 30,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => undefined,
    });

    this.db = drizzle(this.client, { schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }

  /**
   * Run a callback inside a transaction bound to the CURRENT request's tenant.
   * Use this for virtually everything.
   */
  async run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const ctx = RequestContextStore.get();
    if (!ctx.tenantId && !ctx.isPlatformAdmin) {
      throw new Error(
        'TenantDb.run() called without a tenant in context. Either the route ' +
          'should be public (use runUnscoped) or TenantGuard is missing.',
      );
    }
    return this.withTenant(ctx.tenantId, ctx.isPlatformAdmin, fn);
  }

  /**
   * Explicitly act as a given tenant. For background jobs and workers, which
   * have no ambient request context. Being explicit here is deliberate — a job
   * that iterates tenants must state which one it is touching on each pass.
   */
  async asTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.withTenant(tenantId, false, fn);
  }

  /**
   * For genuinely tenant-less work: login before a tenant is chosen, reading
   * the global permission catalogue, platform-admin tooling.
   *
   * RLS still applies. Tenant-scoped tables will return ZERO ROWS here, which
   * is the intended behaviour — if you get an empty result from this method,
   * you almost certainly wanted run() instead.
   */
  async runUnscoped<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
      await tx.execute(sql`SELECT set_config('app.platform_admin', 'false', true)`);
      await tx.execute(sql`SELECT set_config('app.acting_user_id', '', true)`);
      return fn(tx);
    });
  }

  /**
   * Reading a single join token before any tenant is known — a parent tapping
   * an invitation link has no session to derive one from.
   *
   * The hash of the presented token is the key, so the policy in
   * `db/sql/004_join_token_lookup.sql` exposes exactly the row whose secret the
   * caller already holds. Use this for the lookup only; once the row names its
   * tenant, consuming it belongs in asTenant().
   */
  async runWithJoinToken<T>(tokenHash: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
      await tx.execute(sql`SELECT set_config('app.platform_admin', 'false', true)`);
      await tx.execute(sql`SELECT set_config('app.acting_user_id', '', true)`);
      await tx.execute(sql`SELECT set_config('app.join_token_hash', ${tokenHash}, true)`);
      return fn(tx);
    });
  }

  /**
   * Post-authentication, pre-tenant work: list memberships / tenant names for
   * the verified user. Sets `app.acting_user_id` so RLS policies in
   * `db/sql/003_auth_acting_user.sql` can expose only that user's rows.
   */
  async runAsActingUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
      await tx.execute(sql`SELECT set_config('app.platform_admin', 'false', true)`);
      await tx.execute(sql`SELECT set_config('app.acting_user_id', ${userId}, true)`);
      return fn(tx);
    });
  }

  private async withTenant<T>(
    tenantId: string | null,
    platformAdmin: boolean,
    fn: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      // Parameterised — the tenant id is never string-concatenated into SQL.
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId ?? ''}, true)`);
      await tx.execute(
        sql`SELECT set_config('app.platform_admin', ${platformAdmin ? 'true' : 'false'}, true)`,
      );

      if (platformAdmin) {
        // Cross-tenant reads are always noteworthy. Log loudly; the audit
        // interceptor also writes a row.
        this.logger.warn(
          `PLATFORM ADMIN query: user=${RequestContextStore.userId() ?? 'system'} ` +
            `tenant=${tenantId ?? 'ALL'} request=${RequestContextStore.peek()?.requestId}`,
        );
      }

      return fn(tx);
    });
  }

  /**
   * Health check only. Does not establish tenant context, so it must never be
   * used for application queries.
   */
  async ping(): Promise<boolean> {
    const result = await this.client`SELECT 1 AS ok`;
    return result[0]?.ok === 1;
  }
}
