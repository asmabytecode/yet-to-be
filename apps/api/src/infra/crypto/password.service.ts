import { Inject, Injectable } from '@nestjs/common';
import { argon2id, hash, needsRehash, verify } from 'argon2';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Параметри argon2id не нижче мінімуму OWASP (19 MiB, 2 ітерації, 1 потік).
 * У production підняти memoryCost після бенчмарку (ціль — 200–500 мс на хеш).
 */
export const ARGON2_PARAMS = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const DUMMY_PASSWORD = 'dummy-password-for-timing-equalization';

/** Хешування паролів: argon2id + pepper (секрет із env, якого немає в БД). */
@Injectable()
export class PasswordService {
  private readonly pepper: Buffer;
  private dummyHash: Promise<string> | undefined;

  constructor(@Inject(AppConfigService) config: Pick<AppConfigService, 'auth'>) {
    this.pepper = Buffer.from(config.auth.passwordPepper, 'utf8');
  }

  hash(plain: string): Promise<string> {
    return hash(plain, { ...ARGON2_PARAMS, secret: this.pepper });
  }

  /** Повертає false (а не кидає), якщо хеш пошкоджений або pepper інший. */
  async verify(digest: string, plain: string): Promise<boolean> {
    try {
      return await verify(digest, plain, { secret: this.pepper });
    } catch {
      return false;
    }
  }

  /** true, якщо хеш створено зі застарілими параметрами й його варто перехешувати. */
  needsRehash(digest: string): boolean {
    return needsRehash(digest, ARGON2_PARAMS);
  }

  /**
   * Виконує повну перевірку проти фіктивного хешу. Викликається, коли користувача
   * не знайдено, щоб час відповіді не видавав, чи існує такий email (timing-атака).
   */
  async verifyAgainstDummy(plain: string): Promise<void> {
    this.dummyHash ??= this.hash(DUMMY_PASSWORD);
    await this.verify(await this.dummyHash, plain);
  }
}
