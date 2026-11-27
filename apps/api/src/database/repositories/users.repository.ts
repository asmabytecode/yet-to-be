import { Inject, Injectable } from '@nestjs/common';
import type { Session, User } from '../../generated/prisma/client';
import {
  isNotFound,
  isUniqueViolation,
  RecordNotFoundError,
  UniqueConstraintError,
} from '../errors';
import { PrismaService } from '../prisma.service';
import type { CreateSessionInput } from './sessions.repository';

export interface CreateUserInput {
  /** id генерується застосунком заздалегідь: він потрібен як частина AAD при шифруванні. */
  id: string;
  /** Уже зашифрований email (шифрування — відповідальність сервісного шару). */
  emailEncrypted: string;
  emailBlindIndex: string;
  /** null для акаунтів, створених лише через Google. */
  passwordHash: string | null;
  displayName: string;
  /** Для акаунтів, створених через Google (email підтверджено провайдером). */
  emailVerifiedAt?: Date;
}

export interface OAuthLinkInput {
  provider: string;
  providerAccountId: string;
}

export interface ProfileUpdate {
  displayName?: string;
  firstNameEncrypted?: string | null;
  lastNameEncrypted?: string | null;
  bio?: string | null;
}

interface UserUpdate extends ProfileUpdate {
  displayName?: string;
  emailEncrypted?: string;
  emailBlindIndex?: string;
  emailVerifiedAt?: Date | null;
  passwordHash?: string;
  lastLoginAt?: Date;
  failedLogins?: number;
  lockedUntil?: Date | null;
}

/** Доступ до таблиці users. Репозиторій не шифрує й не хешує: він зберігає готові значення. */
@Injectable()
export class UsersRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(input: CreateUserInput): Promise<User> {
    try {
      return await this.prisma.user.create({ data: input });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new UniqueConstraintError('email');
      }
      throw error;
    }
  }

  /** Атомарно створює користувача разом із першою сесією (реєстрація). */
  async createWithSession(
    input: CreateUserInput,
    session: Omit<CreateSessionInput, 'userId'>,
  ): Promise<{ user: User; session: Session }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: input });
        const createdSession = await tx.session.create({ data: { ...session, userId: user.id } });
        return { user, session: createdSession };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new UniqueConstraintError('email');
      }
      throw error;
    }
  }

  /** Створює Google-користувача, його першу сесію та зв'язок з провайдером в одній транзакції. */
  async createOAuthUser(
    input: CreateUserInput,
    session: Omit<CreateSessionInput, 'userId'>,
    oauth: OAuthLinkInput,
  ): Promise<{ user: User; session: Session }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: input });
        const createdSession = await tx.session.create({ data: { ...session, userId: user.id } });
        await tx.oAuthAccount.create({ data: { ...oauth, userId: user.id } });
        return { user, session: createdSession };
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

  updateDisplayName(id: string, displayName: string): Promise<User> {
    return this.update(id, { displayName });
  }

  updateProfile(id: string, update: ProfileUpdate): Promise<User> {
    return this.update(id, update);
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

  /** Фіксує невдалу спробу входу; lockedUntil = null, якщо блокування ще не потрібне. */
  recordLoginFailure(id: string, failedLogins: number, lockedUntil: Date | null): Promise<User> {
    return this.update(id, { failedLogins, lockedUntil });
  }

  resetLoginFailures(id: string): Promise<User> {
    return this.update(id, { failedLogins: 0, lockedUntil: null });
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

  private async update(id: string, data: UserUpdate): Promise<User> {
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
