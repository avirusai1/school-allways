/**
 * Establishes the AsyncLocalStorage context for every request.
 * Runs before guards, so PermissionGuard can populate it.
 */

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { RequestContextStore, createEmptyContext } from './request-context';

@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

    const ctx = createEmptyContext(requestId);
    ctx.ip = req.ip;
    ctx.userAgent = req.headers['user-agent'];

    res.setHeader('X-Request-Id', requestId);

    RequestContextStore.run(ctx, () => next());
  }
}
