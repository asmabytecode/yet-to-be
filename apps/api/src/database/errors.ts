import { Prisma } from '../generated/prisma/client';

/** Порушено унікальність (наприклад, email уже зайнятий). */
export class UniqueConstraintError extends Error {
  constructor(public readonly field: string) {
    super(`Unique constraint violated: ${field}`);
    this.name = 'UniqueConstraintError';
  }
}

/** Запис не знайдено під час оновлення чи видалення. */
export class RecordNotFoundError extends Error {
  constructor(public readonly entity: string) {
    super(`${entity} not found`);
    this.name = 'RecordNotFoundError';
  }
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export const isUniqueViolation = (error: unknown): boolean => hasPrismaCode(error, 'P2002');
export const isNotFound = (error: unknown): boolean => hasPrismaCode(error, 'P2025');
