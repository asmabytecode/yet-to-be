import { HttpException } from '@nestjs/common';
import type { ErrorCode } from '@yet-to-be/shared';

export interface ValidationIssue {
  path: string;
  code: string;
}

/** Помилка з явним кодом для клієнта. Повідомлення не повинно містити введених значень. */
export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly issues?: ValidationIssue[],
  ) {
    super(message, status);
  }
}
