import { HttpException } from '@nestjs/common';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
    fields?: Record<string, string>;
  };
}

export class ApiException extends HttpException {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly fields?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
    fields?: Record<string, string>,
  ) {
    super({ code, message, details, fields }, status);
    this.code = code;
    this.message = message;
    this.details = details;
    this.fields = fields;
  }
}
