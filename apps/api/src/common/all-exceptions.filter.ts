import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { type ApiError, ERROR_CODES, type ErrorCode } from '@yet-to-be/shared';
import type { Request, Response } from 'express';
import { AppException } from './app-exception';
import { requestIdOf } from './request-context';

const GENERIC: Record<number, { code: ErrorCode; message: string }> = {
  400: { code: ERROR_CODES.BAD_REQUEST, message: 'Bad request' },
  401: { code: ERROR_CODES.UNAUTHORIZED, message: 'Authentication required' },
  403: { code: ERROR_CODES.FORBIDDEN, message: 'Forbidden' },
  404: { code: ERROR_CODES.NOT_FOUND, message: 'Not found' },
  413: { code: ERROR_CODES.PAYLOAD_TOO_LARGE, message: 'Payload too large' },
  429: { code: ERROR_CODES.RATE_LIMITED, message: 'Too many requests' },
};

export function buildErrorBody(
  status: number,
  requestId: string,
  override?: { code: ErrorCode; message: string; issues?: ApiError['issues'] },
): ApiError {
  const base = override ?? GENERIC[status] ?? {
    code: status >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.BAD_REQUEST,
    message: status >= 500 ? 'Internal server error' : 'Request failed',
  };
  const body: ApiError = { statusCode: status, code: base.code, message: base.message, requestId };
  if (override?.issues !== undefined) body.issues = override.issues;
  return body;
}

/**
 * Єдиний формат помилок. Для невідомих винятків клієнт бачить лише "Internal server error",
 * а деталі (stack) йдуть тільки в лог, прив'язані до requestId.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = requestIdOf(req);

    let status = 500;
    let body: ApiError;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      body = buildErrorBody(status, requestId, {
        code: exception.code,
        message: exception.message,
        ...(exception.issues === undefined ? {} : { issues: exception.issues }),
      });
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      body = buildErrorBody(status, requestId);
    } else {
      this.logger.error(
        `Unhandled exception (requestId=${requestId}): ${
          exception instanceof Error ? (exception.stack ?? exception.message) : 'non-error thrown'
        }`,
      );
      body = buildErrorBody(500, requestId);
    }

    if (res.headersSent) return;
    res.status(status).json(body);
  }
}
