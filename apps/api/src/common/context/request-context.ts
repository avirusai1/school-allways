/**
 * Per-request context, carried on AsyncLocalStorage.
 *
 * WHY ALS AND NOT A REQUEST-SCOPED PROVIDER
 * NestJS request-scoped providers force the whole injection chain below them
 * to be request-scoped too, which on a 2-core box means rebuilding a provider
 * graph on every call. ALS gives the same ergonomics at near-zero cost, and —
 * more importantly — makes the tenant id reachable from the database layer
 * without threading it through every service signature. A tenant id that has
 * to be passed manually is a tenant id someone will eventually forget to pass.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export type ScopeType = 'tenant' | 'branch' | 'section' | 'subject' | 'self';

/** One resolved permission grant for the current actor. */
export interface GrantedPermission {
  code: string;
  scope: ScopeType;
  /** Concrete ids the scope resolves to. Empty for tenant/branch scope. */
  sectionIds?: string[];
  subjectIds?: string[];
  /** For family users: the children they may act for. */
  studentIds?: string[];
}

export interface RequestContext {
  requestId: string;

  /** Null on public routes (signup, OTP request, health). */
  userId: string | null;
  /**
   * THE tenant id. Comes from the verified JWT claim and nowhere else.
   * Never populate this from a header, query string or request body.
   */
  tenantId: string | null;
  branchId: string | null;
  sessionId: string | null;

  /** Role codes held in this tenant, for logging and the nav manifest. */
  roleCodes: string[];
  /** code -> grant. Resolved once per request, cached in Redis. */
  permissions: Map<string, GrantedPermission>;

  /**
   * True only for our own platform staff, and only for the duration of an
   * explicitly-started, time-boxed support session. Sets `app.platform_admin`
   * in Postgres, which bypasses RLS — so every request under it is audited.
   */
  isPlatformAdmin: boolean;
  /** Set when a support agent is acting as a school user. */
  impersonatorUserId: string | null;

  ip?: string;
  userAgent?: string;
  /** Collected by services, flushed by the audit interceptor. */
  auditTrail: AuditEntry[];
  piiReads: PiiReadEntry[];
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

export interface PiiReadEntry {
  entityType: string;
  entityId: string;
  studentId?: string;
  sensitivity: 'confidential' | 'restricted';
  fieldsAccessed?: string[];
  accessType?: 'view' | 'list' | 'export' | 'print' | 'download';
  grantId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const RequestContextStore = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },

  /** Returns undefined outside a request (cron jobs, workers). */
  peek(): RequestContext | undefined {
    return storage.getStore();
  },

  /** Throws if there is no context. Use where one is genuinely required. */
  get(): RequestContext {
    const ctx = storage.getStore();
    if (!ctx) {
      throw new Error(
        'No request context. If this is a background job, use TenantDb.asTenant() ' +
          'to establish one explicitly rather than relying on ambient context.',
      );
    }
    return ctx;
  },

  tenantId(): string | null {
    return storage.getStore()?.tenantId ?? null;
  },

  userId(): string | null {
    return storage.getStore()?.userId ?? null;
  },

  addAudit(entry: AuditEntry): void {
    storage.getStore()?.auditTrail.push(entry);
  },

  addPiiRead(entry: PiiReadEntry): void {
    storage.getStore()?.piiReads.push(entry);
  },
};

export function createEmptyContext(requestId: string): RequestContext {
  return {
    requestId,
    userId: null,
    tenantId: null,
    branchId: null,
    sessionId: null,
    roleCodes: [],
    permissions: new Map(),
    isPlatformAdmin: false,
    impersonatorUserId: null,
    auditTrail: [],
    piiReads: [],
  };
}
