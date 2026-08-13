/**
 * Flushes the request's audit trail and PII-read log after the response.
 *
 * WHY AFTER, AND WHY BEST-EFFORT
 * Audit writes must never fail a user's request — a teacher marking attendance
 * on a patchy connection should not lose their work because an audit insert
 * timed out. But they also must not be silently dropped, so a failure here is
 * logged at ERROR and should page someone if it becomes frequent.
 *
 * WHY TWO TABLES
 *   audit_logs      — WRITES. What changed, by whom, from what to what.
 *   pii_access_logs — READS of personal data. Required to answer a parent
 *                     asking "who has looked at my child's file", which is a
 *                     DPDP data-principal right, not a nice-to-have.
 *
 * Both are append-only, enforced by database trigger, not by convention.
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';

import { auditLogs, piiAccessLogs } from '@saw/db';
import { RequestContextStore } from '../context/request-context';
import { TenantDbService } from '../database/tenant-db.service';

/** Never write these values into an audit diff, even redacted-adjacent. */
const REDACTED_FIELDS = new Set([
  'passwordHash',
  'password',
  'temporaryPassword',
  'codeHash',
  'refreshTokenHash',
  'otpCodeHash',
  'aadhaarHash',
  'aadhaarLast4',
  'bankAccountLast4',
  'panNumber',
  'gatewayResponse',
]);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly db: TenantDbService) {}

  intercept(execCtx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = execCtx.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      tap({
        next: () => void this.flush(req),
        // Failed requests still produce audit entries worth keeping — a denied
        // attempt to read counselling notes is exactly what you want recorded.
        error: () => void this.flush(req),
      }),
    );
  }

  private async flush(req: Request): Promise<void> {
    const ctx = RequestContextStore.peek();
    if (!ctx?.tenantId) return;
    if (ctx.auditTrail.length === 0 && ctx.piiReads.length === 0) return;

    const audits = ctx.auditTrail.splice(0);
    const reads = ctx.piiReads.splice(0);

    try {
      await this.db.asTenant(ctx.tenantId, async (tx) => {
        if (audits.length) {
          await tx.insert(auditLogs).values(
            audits.map((entry) => ({
              tenantId: ctx.tenantId!,
              branchId: ctx.branchId,
              actorUserId: ctx.userId,
              actorRoleCode: ctx.roleCodes[0] ?? null,
              impersonatorUserId: ctx.impersonatorUserId,
              action: entry.action,
              entityType: entry.entityType,
              entityId: entry.entityId ?? null,
              changes: entry.changes ? redact(entry.changes) : null,
              ip: ctx.ip ?? null,
              userAgent: ctx.userAgent ?? null,
              requestId: ctx.requestId,
            })),
          );
        }

        if (reads.length) {
          await tx.insert(piiAccessLogs).values(
            reads.map((entry) => ({
              tenantId: ctx.tenantId!,
              actorUserId: ctx.userId!,
              actorRoleCode: ctx.roleCodes[0] ?? null,
              entityType: entry.entityType,
              entityId: entry.entityId,
              studentId: entry.studentId ?? null,
              sensitivity: entry.sensitivity,
              fieldsAccessed: entry.fieldsAccessed ?? [],
              accessType: entry.accessType ?? 'view',
              grantId: entry.grantId ?? null,
              ip: ctx.ip ?? null,
              requestId: ctx.requestId,
            })),
          );
        }
      });
    } catch (err) {
      // Loud, but non-fatal to the user's request.
      this.logger.error(
        `Failed to flush audit for request=${ctx.requestId} ` +
          `path=${req.method} ${req.path} ` +
          `(${audits.length} audits, ${reads.length} pii reads): ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
}

function redact(
  changes: Record<string, { from: unknown; to: unknown }>,
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, diff] of Object.entries(changes)) {
    out[field] = REDACTED_FIELDS.has(field)
      ? { from: '[redacted]', to: '[redacted]' }
      : diff;
  }
  return out;
}
