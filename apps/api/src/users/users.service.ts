import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type ChangePasswordInput,
  ERROR_CODES,
  type SessionInfo,
  type SetPasswordInput,
  type UpdateProfileInput,
  type UserDto,
} from '@yet-to-be/shared';
import { AppException } from '../common/app-exception';
import { assertStrongPassword } from '../common/password-policy';
import type { ClientContext } from '../common/request-context';
import { AuditLogRepository } from '../database/repositories/audit-log.repository';
import { OAuthAccountsRepository } from '../database/repositories/oauth-accounts.repository';
import { SessionsRepository } from '../database/repositories/sessions.repository';
import {
  type CreateUserInput,
  type ProfileUpdate,
  UsersRepository,
} from '../database/repositories/users.repository';
import type { User } from '../generated/prisma/client';
import { buildAad, EncryptionService } from '../infra/crypto/encryption.service';
import { HashingService } from '../infra/crypto/hashing.service';
import { PasswordService } from '../infra/crypto/password.service';

export const USER_AUDIT = {
  PASSWORD_CHANGED: 'user.password_changed',
  PASSWORD_SET: 'user.password_set',
  PROFILE_UPDATED: 'user.profile_updated',
  OAUTH_UNLINKED: 'user.oauth_unlinked',
  SESSION_REVOKED: 'user.session_revoked',
} as const;

/** Профіль користувача: читання, редагування, пароль, сесії, прив'язані акаунти. */
@Injectable()
export class UsersService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(SessionsRepository) private readonly sessions: SessionsRepository,
    @Inject(OAuthAccountsRepository) private readonly oauthAccounts: OAuthAccountsRepository,
    @Inject(AuditLogRepository) private readonly audit: AuditLogRepository,
    @Inject(EncryptionService) private readonly encryption: EncryptionService,
    @Inject(HashingService) private readonly hashing: HashingService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
  ) {}

  emailAad(userId: string): string {
    return buildAad('users', 'email', userId);
  }

  /** Готує запис нового користувача: id заздалегідь (потрібен для AAD), email зашифровано. */
  buildNewUser(
    email: string,
    displayName: string,
    passwordHash: string | null,
    emailVerifiedAt?: Date,
  ): CreateUserInput {
    const id = randomUUID();
    return {
      id,
      emailEncrypted: this.encryption.encrypt(this.hashing.normalize(email), this.emailAad(id)),
      emailBlindIndex: this.hashing.blindIndex(email),
      passwordHash,
      displayName,
      ...(emailVerifiedAt === undefined ? {} : { emailVerifiedAt }),
    };
  }

  /** Мапер у DTO: розшифровує поля й ніколи не віддає хеші та службові дані. */
  async toDto(user: User): Promise<UserDto> {
    const linked = await this.oauthAccounts.listForUser(user.id);
    const providers: UserDto['providers'] = [];
    if (user.passwordHash !== null) providers.push('password');
    if (linked.some((account) => account.provider === 'google')) providers.push('google');

    return {
      id: user.id,
      email: this.encryption.decrypt(user.emailEncrypted, this.emailAad(user.id)),
      displayName: user.displayName,
      firstName: this.decryptOptional(user.firstNameEncrypted, 'firstName', user.id),
      lastName: this.decryptOptional(user.lastNameEncrypted, 'lastName', user.id),
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      providers,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async getDto(userId: string): Promise<UserDto> {
    return this.toDto(await this.requireUser(userId));
  }

  async updateProfile(userId: string, input: UpdateProfileInput, ctx: ClientContext): Promise<UserDto> {
    await this.requireUser(userId);
    const update: ProfileUpdate = {};
    if (input.displayName !== undefined) update.displayName = input.displayName;
    if (input.firstName !== undefined) {
      update.firstNameEncrypted = this.encryptOptional(input.firstName, 'firstName', userId);
    }
    if (input.lastName !== undefined) {
      update.lastNameEncrypted = this.encryptOptional(input.lastName, 'lastName', userId);
    }
    if (input.bio !== undefined) update.bio = input.bio === '' ? null : input.bio;

    const user = await this.users.updateProfile(userId, update);
    await this.record(USER_AUDIT.PROFILE_UPDATED, userId, ctx, { fields: Object.keys(input) });
    return this.toDto(user);
  }

  /** Зміна пароля: перевірка поточного, відкликання всіх інших сесій. */
  async changePassword(
    userId: string,
    currentSessionId: string,
    input: ChangePasswordInput,
    ctx: ClientContext,
    now = new Date(),
  ): Promise<void> {
    const user = await this.requireUser(userId);
    if (user.passwordHash === null) {
      throw new AppException(409, ERROR_CODES.CONFLICT, 'Password is not set for this account');
    }
    if (!(await this.passwords.verify(user.passwordHash, input.currentPassword))) {
      // 400, а не 401: фронтенд на 401 намагається оновити токен.
      throw new AppException(400, ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Current password is incorrect');
    }
    assertStrongPassword(input.newPassword, this.decryptEmail(user));

    await this.users.updatePasswordHash(userId, await this.passwords.hash(input.newPassword));
    const revoked = await this.sessions.revokeOthersForUser(userId, currentSessionId, now);
    await this.record(USER_AUDIT.PASSWORD_CHANGED, userId, ctx, { revokedSessions: revoked });
  }

  /** Встановлення пароля для акаунта без пароля (створеного через Google). */
  async setPassword(userId: string, input: SetPasswordInput, ctx: ClientContext): Promise<void> {
    const user = await this.requireUser(userId);
    if (user.passwordHash !== null) {
      throw new AppException(409, ERROR_CODES.AUTH_PASSWORD_ALREADY_SET, 'Password is already set');
    }
    assertStrongPassword(input.newPassword, this.decryptEmail(user));
    await this.users.updatePasswordHash(userId, await this.passwords.hash(input.newPassword));
    await this.record(USER_AUDIT.PASSWORD_SET, userId, ctx);
  }

  /** Відв'язує Google. Не можна залишити акаунт без способу входу. */
  async unlinkGoogle(userId: string, ctx: ClientContext): Promise<void> {
    const user = await this.requireUser(userId);
    if (user.passwordHash === null) {
      throw new AppException(
        409,
        ERROR_CODES.AUTH_LAST_LOGIN_METHOD,
        'Set a password before unlinking Google',
      );
    }
    if (!(await this.oauthAccounts.unlink(userId, 'google'))) {
      throw new AppException(404, ERROR_CODES.NOT_FOUND, 'Not found');
    }
    await this.record(USER_AUDIT.OAUTH_UNLINKED, userId, ctx, { provider: 'google' });
  }

  async listSessions(userId: string, currentSessionId: string, now = new Date()): Promise<SessionInfo[]> {
    const sessions = await this.sessions.listActiveForUser(userId, now);
    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.createdAt.toISOString(),
      userAgent: session.userAgent,
      isCurrent: session.id === currentSessionId,
    }));
  }

  /** Чужа або неіснуюча сесія → 404 (а не 403), щоб не підтверджувати існування id (IDOR). */
  async revokeSession(userId: string, sessionId: string, ctx: ClientContext, now = new Date()): Promise<void> {
    const owned = (await this.sessions.listActiveForUser(userId, now)).some((s) => s.id === sessionId);
    if (!owned) throw new AppException(404, ERROR_CODES.NOT_FOUND, 'Not found');
    await this.sessions.revoke(sessionId, now);
    await this.record(USER_AUDIT.SESSION_REVOKED, userId, ctx);
  }

  private async requireUser(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (user === null) throw new AppException(401, ERROR_CODES.UNAUTHORIZED, 'Authentication required');
    return user;
  }

  private decryptEmail(user: User): string {
    return this.encryption.decrypt(user.emailEncrypted, this.emailAad(user.id));
  }

  private encryptOptional(value: string, field: string, userId: string): string | null {
    return value === '' ? null : this.encryption.encrypt(value, buildAad('users', field, userId));
  }

  private decryptOptional(value: string | null, field: string, userId: string): string | null {
    return value === null ? null : this.encryption.decrypt(value, buildAad('users', field, userId));
  }

  private record(
    action: string,
    userId: string,
    ctx: ClientContext,
    metadata: Record<string, unknown> | null = null,
  ): Promise<unknown> {
    return this.audit.record({
      userId,
      action,
      ipHash: ctx.ip === null ? null : this.hashing.ipHash(ctx.ip),
      metadata,
    });
  }
}
