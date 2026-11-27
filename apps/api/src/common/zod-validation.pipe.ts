import { type PipeTransform } from '@nestjs/common';
import { ERROR_CODES } from '@yet-to-be/shared';
import type { z } from 'zod';
import { AppException } from './app-exception';

/** Валідація тіла через Zod. У відповідь потрапляють лише шляхи й коди, без значень. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new AppException(
      400,
      ERROR_CODES.VALIDATION_FAILED,
      'Validation failed',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })),
    );
  }
}
