import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { RequestContextStore } from '../context/request-context';
import { ApiException, type ApiErrorBody } from './api.exception';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const requestId = RequestContextStore.peek()?.requestId;

    const body = this.toErrorBody(exception, requestId);

    if (body.error.code === 'INTERNAL') {
      this.logger.error(exception);
    }

    res.status(this.statusFor(exception)).json(body);
  }

  private statusFor(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private toErrorBody(exception: unknown, requestId?: string): ApiErrorBody {
    if (exception instanceof ApiException) {
      return {
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
          fields: exception.fields,
          requestId,
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'object' && response !== null && 'code' in response) {
        const payload = response as {
          code: string;
          message?: string;
          details?: Record<string, unknown>;
          fields?: Record<string, string>;
        };
        return {
          error: {
            code: payload.code,
            message: payload.message ?? exception.message,
            details: payload.details,
            fields: payload.fields,
            requestId,
          },
        };
      }

      const message =
        typeof response === 'string'
          ? response
          : Array.isArray((response as { message?: unknown }).message)
            ? ((response as { message: string[] }).message.join('; '))
            : exception.message;

      return {
        error: {
          code: this.defaultCode(status),
          message,
          requestId,
        },
      };
    }

    return {
      error: {
        code: 'INTERNAL',
        message: 'Something went wrong. Please try again.',
        requestId,
      },
    };
  }

  private defaultCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_FAILED';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHENTICATED';
      case HttpStatus.FORBIDDEN:
        return 'PERMISSION_DENIED';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'BUSINESS_RULE';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNAVAILABLE';
      default:
        return status >= 500 ? 'INTERNAL' : 'BAD_REQUEST';
    }
  }
}
