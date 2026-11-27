import { Inject, Injectable } from '@nestjs/common';
import { safeReturnTo } from '@yet-to-be/shared';
import type { ClientContext } from '../../common/request-context';
import { UniqueConstraintError } from '../../database/errors';
import { AuditLogRepository } from '../../database/repositories/audit-log.repository';
import { OAuthAccountsRepository } from '../../database/repositories/oauth-accounts.repository';
import { UsersRepository } from '../../database/repositories/users.repository';
import { HashingService } from '../../infra/crypto/hashing.service';
import { UsersService } from '../../users/users.service';
import { AUDIT } from '../audit-actions';
import { type AuthResult, AuthService } from '../auth.service';
import {
  OAUTH_PROVIDER,
  OAuthError,
  type OAuthProfile,
  type OAuthProvider,
  type OAuthTransaction,
} from './oauth-provider';

export interface OAuthCallbackQuery {
  code?: unknown;
  state?: unknown;
  error?: unknown;
}

export interface OAuthStart {
  url: string;
  transaction: OAuthTransaction;
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** Вибирає ім'я для акаунта з профілю провайдера; не коротше 2 і не довше 50 символів. */
export function deriveDisplayName(name: string | null, email: string): string {
  const candidate = (name ?? '').replaceAll(/\p{Cc}/gu, '').trim().slice(0, 50);
  if (candidate.length >= 2) return candidate;
  const local = (email.split('@')[0] ?? '').slice(0, 50);
  return local.length >= 2 ? local : 'User';
}

@Injectable()
export class OAuthService {
  constructor(
    @Inject(OAUTH_PROVIDER) private readonly provider: OAuthProvider,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(OAuthAccountsRepository) private readonly accounts: OAuthAccountsRepository,
    @Inject(AuditLogRepository) private readonly audit: AuditLogRepository,
    @Inject(HashingService) private readonly hashing: HashingService,
  ) {}

  start(returnTo: unknown): OAuthStart {
    const { url, transaction } = this.provider.createAuthorization();
    return { url, transaction: { ...transaction, returnTo: safeReturnTo(returnTo) } };
  }

  /** Повний обробник повернення від провайдера. Будь-яка проблема → OAuthError. */
  async complete(
    query: OAuthCallbackQuery,
    transaction: OAuthTransaction | undefined,
    ctx: ClientContext,
  ): Promise<{ result: AuthResult; returnTo: string }> {
    if (transaction === undefined) throw new OAuthError('OAuth transaction cookie is missing');
    if (query.error !== undefined) throw new OAuthError('Provider returned an error');

    const code = asString(query.code);
    const state = asString(query.state);
    if (code === undefined || state === undefined) throw new OAuthError('Missing code or state');
    if (!this.hashing.safeEqual(state, transaction.state)) throw new OAuthError('State mismatch');

    const profile = await this.provider.handleCallback(code, transaction);
    const result = await this.signIn(profile, ctx);
    return { result, returnTo: safeReturnTo(transaction.returnTo) };
  }

  /** Чотири гілки зв'язування акаунтів із ТЗ. */
  async signIn(profile: OAuthProfile, ctx: ClientContext, now = new Date()): Promise<AuthResult> {
    // 1. Google-акаунт уже прив'язаний → вхід у нього.
    const linked = await this.accounts.findByProviderAccount(profile.provider, profile.subject);
    if (linked !== null) {
      const user = await this.users.findById(linked.userId);
      if (user === null) throw new OAuthError('Linked user no longer exists');
      await this.users.touchLastLogin(user.id, now);
      return this.auth.startSession(user, ctx, now);
    }

    // 2. Непідтверджений email — відмова: інакше можна захопити чужий акаунт.
    if (!profile.emailVerified) throw new OAuthError('Provider email is not verified');

    // 3. Є користувач з таким email → прив'язати.
    const existing = await this.users.findByEmailBlindIndex(this.hashing.blindIndex(profile.email));
    if (existing !== null) {
      try {
        await this.accounts.link({
          userId: existing.id,
          provider: profile.provider,
          providerAccountId: profile.subject,
        });
      } catch (error) {
        if (error instanceof UniqueConstraintError) throw new OAuthError('Account is already linked');
        throw error;
      }
      if (existing.emailVerifiedAt === null) await this.users.markEmailVerified(existing.id, now);
      await this.users.touchLastLogin(existing.id, now);
      await this.record(AUDIT.OAUTH_LINKED, existing.id, ctx, { provider: profile.provider });
      return this.auth.startSession(existing, ctx, now);
    }

    // 4. Новий користувач без пароля.
    const input = this.usersService.buildNewUser(
      profile.email,
      deriveDisplayName(profile.name, profile.email),
      null,
      now,
    );
    const { refreshToken, session: sessionInput } = this.auth.prepareSession(ctx, now);
    try {
      const { user, session } = await this.users.createOAuthUser(input, sessionInput, {
        provider: profile.provider,
        providerAccountId: profile.subject,
      });
      await this.record(AUDIT.OAUTH_REGISTER, user.id, ctx, { provider: profile.provider });
      return await this.auth.buildResult(user, session, refreshToken);
    } catch (error) {
      if (error instanceof UniqueConstraintError) throw new OAuthError('Account already exists');
      throw error;
    }
  }

  private record(
    action: string,
    userId: string,
    ctx: ClientContext,
    metadata: Record<string, unknown>,
  ): Promise<unknown> {
    return this.audit.record({
      userId,
      action,
      ipHash: ctx.ip === null ? null : this.hashing.ipHash(ctx.ip),
      metadata,
    });
  }
}
