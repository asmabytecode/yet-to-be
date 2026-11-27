import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

/** Детерміновані хеші та випадкові токени. Лише node:crypto, жодних самописних алгоритмів. */
@Injectable()
export class HashingService {
  private readonly hmacKey: Buffer;

  constructor(@Inject(AppConfigService) config: Pick<AppConfigService, 'crypto'>) {
    this.hmacKey = Buffer.from(config.crypto.blindIndexKey, 'base64');
  }

  /** trim + lowercase + Unicode NFC: однаковий вигляд значення для пошуку й порівняння. */
  normalize(value: string): string {
    return value.trim().toLowerCase().normalize('NFC');
  }

  /** Blind index: пошук за email без розшифрування. HMAC із ключем, якого немає в БД. */
  blindIndex(value: string): string {
    return this.hmac('blind', this.normalize(value));
  }

  /** IP зберігається лише як HMAC: можна зіставляти події, не зберігаючи PII. */
  ipHash(ip: string): string {
    return this.hmac('ip', ip.trim());
  }

  /** SHA-256 для зберігання refresh-токенів (витік БД не дає робочих сесій). */
  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  /** Порівняння за сталий час. */
  safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private hmac(domain: string, value: string): string {
    return createHmac('sha256', this.hmacKey).update(`${domain}:${value}`).digest('base64url');
  }
}
