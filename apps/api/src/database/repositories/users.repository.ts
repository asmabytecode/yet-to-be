import { Injectable } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';
import { isNotFound, isUniqueViolation, RecordNotFoundError, UniqueConstraintError } from '../errors';
import { PrismaService } from '../prisma.service';

export interface CreateUserInput {
  /** Уже зашифрований email (шифрування — відповідальність сервісного шару). */
  emailEncrypted: string;
  emailBlindIndex: string;
  /** null для акаунтів, створених лише через Google. */
  passwordHash: string | null;
  displayNameEncrypted: string | null;
}

/** Доступ до таблиці users. Репозиторій не шифрує й не хешує: він зберігає готові значення. */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateUserInput): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: {
          emailEncrypted: input.emailEncrypted,
          emailBlindIndex: input.emailBlindIndex,
          passwordHash: input.passwordHash,
          displayNameEncrypted: input.displayNameEncrypted,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new UniqueConstraintError('email');
      }
      throw error;
    }
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmailBlindIndex(emailBlindIndex: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { emailBlindIndex } });
  }

  updateDisplayName(id: string, displayNameEncrypted: string | null): Promise<User> {
    return this.update(id, { displayNameEncrypted });
  }

  updateEmail(id: string, emailEncrypted: string, emailBlindIndex: string): Promise<User> {
    return this.update(id, { emailEncrypted, emailBlindIndex, emailVerifiedAt: null });
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<User> {
    return this.update(id, { passwordHash });
  }

  markEmailVerified(id: string, at: Date): Promise<User> {
    return this.update(id, { emailVerifiedAt: at });
  }

  touchLastLogin(id: string, at: Date): Promise<User> {
    return this.update(id, { lastLoginAt: at });
  }

  /** Видаляє користувача; сесії й OAuth-акаунти видаляються каскадом, журнал аудиту лишається. */
  async delete(id: string): Promise<void> {
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      if (isNotFound(error)) {
        throw new RecordNotFoundError('User');
      }
      throw error;
    }
  }

  private async update(
    id: string,
    data: {
      displayNameEncrypted?: string | null;
      emailEncrypted?: string;
      emailBlindIndex?: string;
      emailVerifiedAt?: Date | null;
      passwordHash?: string;
      lastLoginAt?: Date;
    },
  ): Promise<User> {
    try {
      return await this.prisma.user.update({ where: { id }, data });
    } catch (error) {
      if (isNotFound(error)) {
        throw new RecordNotFoundError('User');
      }
      if (isUniqueViolation(error)) {
        throw new UniqueConstraintError('email');
      }
      throw error;
    }
  }
}
