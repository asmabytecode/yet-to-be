import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ERROR_CODES, type LoginInput, type RegisterInput, type UserDto } from '@yet-to-be/shared';
import { AppException } from '../common/app-exception';
import { assertStrongPassword } from '../common/password-policy';
import type { ClientContext } from '../common/request-context';
import { AppConfigService } from '../config/app-config.service';
import { UniqueConstraintError } from '../database/errors';
import { AuditLogRepository } from '../database/repositories/audit-log.repository';
import type { CreateSessionInput } from '../database/repositories/sessions.repository';
import { SessionsRepository } from '../database/repositories/sessions.repository';
import { UsersRepository } from '../database/repositories/users.repository';
import type { Session, User } from '../generated/prisma/client';
import { HashingService } from '../infra/crypto/hashing.service';
import { PasswordService } from '../infra/crypto/password.service';
import { UsersService } from '../users/users.service';
import type { SessionTokens } from './auth-cookies';
import { AUDIT } from './audit-actions';
import { TokenService } from './token.service';

export const MAX_FAILED_LOGINS = 5;
const BASE_LOCK_MS = 15 * 60_000;
const MAX_LOCK_MS = 24 * 3_600_000;

export interface AuthResult {
  user: UserDto;
  tokens: SessionTokens;
}

/** Тривалість блокування: 15 хв, далі ×2 за кожні наступні 5 невдалих спроб, максимум 24 год. */
export function lockDurationMs(failedLogins: number): number {
  const level = Math.max(1, Math.floor(failedLogins / MAX_FAILED_LOGINS));
  return Math.min(BASE_LOCK_MS * 2 ** (level - 1), MAX_LOCK_MS);
}

@Injectable()
export class AuthService {
  private readonly refreshTtlMs: number;

  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(SessionsRepository) private readonly sessions: SessionsRepository,
    @Inject(AuditLogRepository) private readonly audit: AuditLogRepository,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(HashingService) private readonly hashing: HashingService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(AppConfigService) config: Pick<AppConfigService, 'auth'>,
  ) {
    this.refreshTtlMs = config.auth.refreshTokenTtlDays * 86_400_000;
  }

  async register(input: RegisterInput, ctx: ClientContext, now = new Date()): Promise<AuthResult> {
    assertStrongPassword(input.password, input.email);

    if ((await this.users.findByEmailBlindIndex(this.hashing.blindIndex(input.email))) !== null) {
      throw this.emailTaken();
    }

    const passwordHash = await this.passwords.hash(input.password);
    const { refreshToken, session: sessionInput } = this.prepareSession(ctx, now);

    try {
      const { user, session } = await this.users.createWithSession(
        this.usersService.buildNewUser(input.email, input.displayName, passwordHash),
        sessionInput,
      );
      await this.record(AUDIT.REGISTER, user.id, ctx);
      return await this.buildResult(user, session, refreshToken);
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw this.emailTaken();
      throw error;
    }
  }

  async login(input: LoginInput, ctx: ClientContext, now = new Date()): Promise<AuthResult> {
    const user = await this.users.findByEmailBlindIndex(this.hashing.blindIndex(input.email));

    if (user === null || user.passwordHash === null) {
      // Такий самий час відповіді, як для існуючого користувача.
      await this.passwords.verifyAgainstDummy(input.password);
      await this.record(AUDIT.LOGIN_FAILED, null, ctx);
      throw this.invalidCredentials();
    }

    if (user.lockedUntil !== null && user.lockedUntil > now) {
      await this.record(AUDIT.LOGIN_FAILED, user.id, ctx, { reason: 'locked' });
      throw new AppException(423, ERROR_CODES.AUTH_LOCKED, 'Account temporarily locked');
    }

    const passwordHash = user.passwordHash;
    if (!(await this.passwords.verify(passwordHash, input.password))) {
      await this.registerFailure(user, ctx, now);
      throw this.invalidCredentials();
    }

    if (user.failedLogins > 0 || user.lockedUntil !== null) {
      await this.users.resetLoginFailures(user.id);
    }
    await this.users.touchLastLogin(user.id, now);
    if (this.passwords.needsRehash(passwordHash)) {
      await this.users.updatePasswordHash(user.id, await this.passwords.hash(input.password));
    }

    return this.startSession(user, ctx, now);
  }

  /** Ротація refresh-токена. Повторне використання старого токена відкликає весь ланцюжок. */
  async refresh(rawToken: string, ctx: ClientContext, now = new Date()): Promise<AuthResult> {
    const current = await this.sessions.findByTokenHash(this.hashing.sha256(rawToken));
    if (current === null) throw this.sessionExpired();

    if (current.revokedAt !== null) {
      if (current.replacedById !== null) {
        await this.sessions.revokeFamily(current.familyId, now);
        await this.record(AUDIT.REFRESH_REUSE, current.userId, ctx);
      }
      throw this.sessionExpired();
    }
    if (current.expiresAt <= now) throw this.sessionExpired();

    const user = await this.users.findById(current.userId);
    if (user === null) throw this.sessionExpired();

    const refreshToken = this.hashing.randomToken(48);
    const next = {
      ...this.newSession(current.familyId, refreshToken, ctx, now),
      userId: current.userId,
    };
    let session: Session;
    try {
      session = await this.sessions.rotate(current.id, next, now);
    } catch {
      throw this.sessionExpired();
    }
    await this.record(AUDIT.REFRESH, user.id, ctx);
    return this.buildResult(user, session, refreshToken);
  }

  /** Вихід за refresh-токеном (працює, навіть якщо access уже прострочений). */
  async logout(
    rawRefreshToken: string | undefined,
    ctx: ClientContext,
    now = new Date(),
  ): Promise<void> {
    if (rawRefreshToken === undefined) return;
    const session = await this.sessions.findByTokenHash(this.hashing.sha256(rawRefreshToken));
    if (session === null) return;
    await this.sessions.revoke(session.id, now);
    await this.record(AUDIT.LOGOUT, session.userId, ctx);
  }

  async logoutAll(userId: string, ctx: ClientContext, now = new Date()): Promise<void> {
    const count = await this.sessions.revokeAllForUser(userId, now);
    await this.record(AUDIT.LOGOUT_ALL, userId, ctx, { revoked: count });
  }

  async getUser(userId: string): Promise<UserDto> {
    return this.usersService.getDto(userId);
  }

  private async registerFailure(user: User, ctx: ClientContext, now: Date): Promise<void> {
    const failures = user.failedLogins + 1;
    const shouldLock = failures % MAX_FAILED_LOGINS === 0;
    const lockedUntil = shouldLock ? new Date(now.getTime() + lockDurationMs(failures)) : null;
    await this.users.recordLoginFailure(user.id, failures, lockedUntil);
    await this.record(AUDIT.LOGIN_FAILED, user.id, ctx);
    if (shouldLock) await this.record(AUDIT.LOCKED, user.id, ctx, { failures });
  }

  /** Нова сесія для користувача, що вже пройшов перевірку (пароль або Google). */
  async startSession(user: User, ctx: ClientContext, now = new Date()): Promise<AuthResult> {
    const { refreshToken, session: sessionInput } = this.prepareSession(ctx, now);
    const session = await this.sessions.create({ ...sessionInput, userId: user.id });
    await this.record(AUDIT.LOGIN, user.id, ctx);
    return this.buildResult(user, session, refreshToken);
  }

  /** Готує дані першої сесії нового ланцюжка ротацій і відкритий refresh-токен. */
  prepareSession(
    ctx: ClientContext,
    now: Date,
    familyId: string = randomUUID(),
  ): { refreshToken: string; session: Omit<CreateSessionInput, 'userId'> } {
    const refreshToken = this.hashing.randomToken(48);
    return { refreshToken, session: this.newSession(familyId, refreshToken, ctx, now) };
  }

  async buildResult(user: User, session: Session, refreshToken: string): Promise<AuthResult> {
    return {
      user: await this.usersService.toDto(user),
      tokens: {
        accessToken: this.tokens.signAccess({ userId: user.id, sessionId: session.id }),
        refreshToken,
        csrfToken: this.hashing.randomToken(32),
      },
    };
  }

  private newSession(
    familyId: string,
    refreshToken: string,
    ctx: ClientContext,
    now: Date,
  ): Omit<CreateSessionInput, 'userId'> {
    return {
      familyId,
      refreshTokenHash: this.hashing.sha256(refreshToken),
      expiresAt: new Date(now.getTime() + this.refreshTtlMs),
      userAgent: ctx.userAgent,
      ipHash: ctx.ip === null ? null : this.hashing.ipHash(ctx.ip),
    };
  }

  record(
    action: string,
    userId: string | null,
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

  private invalidCredentials(): AppException {
    return new AppException(401, ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid email or password');
  }

  private sessionExpired(): AppException {
    return new AppException(401, ERROR_CODES.AUTH_SESSION_EXPIRED, 'Session expired');
  }

  private emailTaken(): AppException {
    return new AppException(409, ERROR_CODES.AUTH_EMAIL_TAKEN, 'Email is already registered');
  }
}
