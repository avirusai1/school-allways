import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { Observable, from, switchMap } from 'rxjs';

import { idempotencyKeys } from '@saw/db';
import { eq } from 'drizzle-orm';

import { RequestContextStore } from '../context/request-context';
import { TenantDbService } from '../database/tenant-db.service';

const TTL_HOURS = 24;

/**
 * `client_mutation_id` is a uuid column, so a malformed header reaches
 * Postgres as a cast error and surfaces as an opaque 500 on an otherwise valid
 * request. Reject it here with something the client author can act on.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly db: TenantDbService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const mutationId = req.headers['x-client-mutation-id'] as string | undefined;

    if (!mutationId || !['POST', 'PATCH'].includes(req.method)) {
      return next.handle();
    }

    if (!UUID_RE.test(mutationId)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'X-Client-Mutation-Id must be a UUID.',
        details: { received: mutationId },
      });
    }

    const ctx = RequestContextStore.peek();
    if (!ctx?.tenantId) {
      // Idempotency ledger requires a tenant; pre-tenant auth routes execute normally.
      return next.handle();
    }

    const endpoint = `${req.method} ${req.path}`;
    const requestHash = createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex');

    return from(this.lookup(ctx.tenantId, mutationId)).pipe(
      switchMap((existing) => {
        if (existing) {
          const res = context.switchToHttp().getResponse();
          res.status(existing.responseStatus ?? 200);
          return from(Promise.resolve(existing.responseBody));
        }

        return next.handle().pipe(
          switchMap((body) =>
            from(
              this.store({
                tenantId: ctx.tenantId!,
                userId: ctx.userId,
                mutationId,
                endpoint,
                requestHash,
                status: context.switchToHttp().getResponse().statusCode ?? 200,
                body: body as Record<string, unknown>,
              }).then(() => body),
            ),
          ),
        );
      }),
    );
  }

  private async lookup(tenantId: string, mutationId: string) {
    return this.db.asTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({
          responseStatus: idempotencyKeys.responseStatus,
          responseBody: idempotencyKeys.responseBody,
        })
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.clientMutationId, mutationId))
        .limit(1);
      return row ?? null;
    });
  }

  private async store(params: {
    tenantId: string;
    userId: string | null;
    mutationId: string;
    endpoint: string;
    requestHash: string;
    status: number;
    body: Record<string, unknown>;
  }): Promise<void> {
    const expiresAt = new Date(Date.now() + TTL_HOURS * 3600 * 1000);

    try {
      await this.db.asTenant(params.tenantId, async (tx) => {
        await tx.insert(idempotencyKeys).values({
          tenantId: params.tenantId,
          userId: params.userId,
          clientMutationId: params.mutationId,
          endpoint: params.endpoint,
          requestHash: params.requestHash,
          responseStatus: params.status,
          responseBody: params.body,
          expiresAt,
        });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('unique') || message.includes('duplicate')) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'This request is already being processed. Please retry.',
          details: { retryable: true },
        });
      }
      throw err;
    }
  }
}
