import { Inject, Injectable } from '@nestjs/common';
import {
  APP_NAME,
  ERROR_CODES,
  type MfaEnableResponse,
  type MfaSetupResponse,
  type MfaStatus,
  type MfaVerifyInput,
} from '@yet-to-be/shared';
import { AppException } from '../../common/app-exception';
import { SessionsRepository } from '../../database/repositories/sessions.repository';
import { UsersRepository } from '../../database/repositories/users.repository';
import { EncryptionService } from '../../infra/crypto/encryption.service';
import { PasswordService } from '../../infra/crypto/password.service';
import { CLOCK, type Clock } from '../../platform/clock';
import { ADMIN_AUDIT, AuditService } from '../audit';
import { IamService } from './iam.service';
import { MfaRepository } from './mfa.repository';
import { generateRecoveryCode, generateTotpSecret, otpauthUri, verifyTotp } from './totp';

/** Скільки діє повторне підтвердження (step-up) для критичних дій. */
export const STEP_UP_TTL_MS = 5 * 60_000;
const RECOVERY_CODES = 10;

export interface SessionMfaState {
  enabled: boolean;
  mfaVerifiedAt: Date | null;
  stepUpAt: Date | null;
}

export function isFreshStepUp(stepUpAt: Date | null, now: Date): boolean {
  return stepUpAt !== null && now.getTime() - stepUpAt.getTime() <= STEP_UP_TTL_MS;
}

const invalidCode = () =>
  new AppException(400, ERROR_CODES.MFA_INVALID_CODE, 'Invalid verification code');

/**
 * Двофакторна автентифікація (TOTP) і повторне підтвердження критичних дій.
 * Помилки підтвердження — 400, а не 401: 401 у клієнті означає «сесія скінчилась».
 */
@Injectable()
export class MfaService {
  constructor(
    @Inject(MfaRepository) private readonly mfa: MfaRepository,
    @Inject(SessionsRepository) private readonly sessions: SessionsRepository,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(EncryptionService) private readonly encryption: EncryptionService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async sessionState(userId: string, sessionId: string): Promise<SessionMfaState> {
    const [record, session] = await Promise.all([
      this.mfa.find(userId),
      this.sessions.findActiveById(sessionId, this.clock.now()),
    ]);
    return {
      enabled: record?.enabledAt != null,
      mfaVerifiedAt: session?.mfaVerifiedAt ?? null,
      stepUpAt: session?.stepUpAt ?? null,
    };
  }

  async status(userId: string, sessionId: string): Promise<MfaStatus> {
    const [state, access] = await Promise.all([
      this.sessionState(userId, sessionId),
      this.iam.getAccess(userId),
    ]);
    const now = this.clock.now();
    return {
      enabled: state.enabled,
      required: access.requiresMfa,
      sessionVerified: state.enabled && state.mfaVerifiedAt !== null,
      stepUpUntil: isFreshStepUp(state.stepUpAt, now)
        ? new Date((state.stepUpAt?.getTime() ?? 0) + STEP_UP_TTL_MS).toISOString()
        : null,
    };
  }

  async setup(userId: string, ip: string | null): Promise<MfaSetupResponse> {
    const existing = await this.mfa.find(userId);
    if (existing?.enabledAt != null) {
      throw new AppException(409, ERROR_CODES.MFA_ALREADY_ENABLED, 'MFA is already enabled');
    }
    const user = await this.users.findById(userId);
    if (user === null) throw new AppException(404, ERROR_CODES.NOT_FOUND, 'User not found');

    const secret = generateTotpSecret();
    await this.mfa.startSetup(userId, this.encryption.encrypt(secret, this.aad(userId)));
    await this.audit.record({ actorId: userId, action: ADMIN_AUDIT.MFA_SETUP, ip });
    return { secret, otpauthUri: otpauthUri(APP_NAME, user.displayName, secret) };
  }

  async enable(
    userId: string,
    sessionId: string,
    code: string,
    ip: string | null,
  ): Promise<MfaEnableResponse> {
    const record = await this.mfa.find(userId);
    if (record === null) throw invalidCode();
    if (record.enabledAt !== null) {
      throw new AppException(409, ERROR_CODES.MFA_ALREADY_ENABLED, 'MFA is already enabled');
    }
    const now = this.clock.now();
    const step = verifyTotp(
      this.secretOf(record.secretEncrypted, userId),
      code,
      now.getTime(),
      null,
    );
    if (step === null) {
      await this.audit.record({ actorId: userId, action: ADMIN_AUDIT.MFA_FAILED, ip });
      throw invalidCode();
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODES }, generateRecoveryCode);
    const hashes = await Promise.all(recoveryCodes.map((value) => this.passwords.hash(value)));
    await this.mfa.enable(userId, step, hashes, now);
    await this.sessions.markVerified(sessionId, { mfaVerifiedAt: now, stepUpAt: now });
    await this.audit.record({ actorId: userId, action: ADMIN_AUDIT.MFA_ENABLE, ip });
    // Коди показуються один раз; у БД — лише argon2-хеші.
    return { recoveryCodes };
  }

  /** Підтвердження MFA в поточній сесії (заодно — step-up). */
  async verify(
    userId: string,
    sessionId: string,
    input: MfaVerifyInput,
    ip: string | null,
  ): Promise<void> {
    await this.checkSecondFactor(userId, input, ip);
    const now = this.clock.now();
    await this.sessions.markVerified(sessionId, { mfaVerifiedAt: now, stepUpAt: now });
    await this.audit.record({
      actorId: userId,
      action: ADMIN_AUDIT.MFA_VERIFY,
      metadata: { method: 'code' in input ? 'totp' : 'recovery_code' },
      ip,
    });
  }

  async disable(userId: string, sessionId: string, code: string, ip: string | null): Promise<void> {
    const access = await this.iam.getAccess(userId);
    if (access.requiresMfa) {
      throw new AppException(409, ERROR_CODES.MFA_REQUIRED_BY_ROLE, 'Your role requires MFA');
    }
    await this.checkSecondFactor(userId, { code }, ip);
    await this.mfa.remove(userId);
    await this.sessions.markVerified(sessionId, { mfaVerifiedAt: null });
    await this.audit.record({ actorId: userId, action: ADMIN_AUDIT.MFA_DISABLE, ip });
  }

  /** Step-up паролем. Для акаунтів без пароля (лише Google) — тільки через TOTP. */
  async stepUpWithPassword(
    userId: string,
    sessionId: string,
    password: string,
    ip: string | null,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (user?.passwordHash == null) {
      throw new AppException(
        400,
        ERROR_CODES.REAUTH_REQUIRED,
        'This account has no password: confirm with your authenticator app',
      );
    }
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      await this.audit.record({ actorId: userId, action: ADMIN_AUDIT.STEP_UP_FAILED, ip });
      throw new AppException(400, ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid password');
    }
    await this.sessions.markVerified(sessionId, { stepUpAt: this.clock.now() });
    await this.audit.record({ actorId: userId, action: ADMIN_AUDIT.STEP_UP, ip });
  }

  private async checkSecondFactor(userId: string, input: MfaVerifyInput, ip: string | null) {
    const record = await this.mfa.find(userId);
    if (record?.enabledAt == null) {
      throw new AppException(403, ERROR_CODES.MFA_SETUP_REQUIRED, 'MFA is not enabled');
    }
    const ok =
      'code' in input
        ? await this.checkTotp(userId, record.secretEncrypted, record.lastUsedStep, input.code)
        : await this.useRecoveryCode(userId, input.recoveryCode, ip);
    if (!ok) {
      await this.audit.record({ actorId: userId, action: ADMIN_AUDIT.MFA_FAILED, ip });
      throw invalidCode();
    }
  }

  private async checkTotp(
    userId: string,
    secretEncrypted: string,
    lastUsedStep: number | null,
    code: string,
  ): Promise<boolean> {
    const step = verifyTotp(
      this.secretOf(secretEncrypted, userId),
      code,
      this.clock.now().getTime(),
      lastUsedStep,
    );
    return step !== null && (await this.mfa.consumeStep(userId, step));
  }

  private async useRecoveryCode(userId: string, code: string, ip: string | null): Promise<boolean> {
    for (const candidate of await this.mfa.unusedRecoveryCodes(userId)) {
      if (await this.passwords.verify(candidate.codeHash, code)) {
        const consumed = await this.mfa.consumeRecoveryCode(candidate.id, this.clock.now());
        if (consumed) {
          await this.audit.record({ actorId: userId, action: ADMIN_AUDIT.MFA_RECOVERY_USED, ip });
        }
        return consumed;
      }
    }
    return false;
  }

  private secretOf(secretEncrypted: string, userId: string): string {
    return this.encryption.decrypt(secretEncrypted, this.aad(userId));
  }

  private aad(userId: string): string {
    return `mfa:${userId}`;
  }
}
