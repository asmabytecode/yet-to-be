import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export class DecryptionError extends Error {
  constructor(message = 'Decryption failed') {
    super(message);
    this.name = 'DecryptionError';
  }
}

/**
 * AAD (additional authenticated data) прив'язує шифротекст до таблиці, поля й рядка:
 * значення не можна підмінити в іншому полі чи в іншого користувача.
 */
export function buildAad(table: string, field: string, id: string): string {
  return `${table}.${field}.${id}`;
}

/**
 * Шифрування полів AES-256-GCM. Формат: v1:<keyId>:<iv>:<authTag>:<ciphertext> (base64url).
 * Ключі беруться лише з env; активний ключ шифрує, а розшифровувати можна будь-яким відомим —
 * так працює ротація ключів без простою.
 */
@Injectable()
export class EncryptionService {
  private readonly keys = new Map<string, Buffer>();
  private readonly activeKeyId: string;

  constructor(@Inject(AppConfigService) config: Pick<AppConfigService, 'crypto'>) {
    for (const [id, base64] of Object.entries(config.crypto.keys)) {
      if (!KEY_ID_PATTERN.test(id)) {
        throw new Error(`Invalid encryption key id "${id}": use letters, digits, "_" or "-".`);
      }
      const key = Buffer.from(base64, 'base64');
      if (key.length !== KEY_BYTES) {
        throw new Error(`Encryption key "${id}" must be exactly ${String(KEY_BYTES)} bytes.`);
      }
      this.keys.set(id, key);
    }
    this.activeKeyId = config.crypto.activeKeyId;
    if (!this.keys.has(this.activeKeyId)) {
      throw new Error('Active encryption key id is not present in DATA_ENCRYPTION_KEYS.');
    }
  }

  encrypt(plain: string, aad: string): string {
    const key = this.keys.get(this.activeKeyId);
    if (key === undefined) {
      throw new Error('Active encryption key is missing.');
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      this.activeKeyId,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  decrypt(payload: string, aad: string): string {
    const [version, keyId, ivPart, tagPart, dataPart, ...rest] = payload.split(':');
    if (
      version !== VERSION ||
      keyId === undefined ||
      ivPart === undefined ||
      tagPart === undefined ||
      dataPart === undefined ||
      rest.length > 0
    ) {
      throw new DecryptionError('Malformed encrypted payload');
    }

    const key = this.keys.get(keyId);
    if (key === undefined) {
      throw new DecryptionError('Unknown encryption key id');
    }
    const iv = Buffer.from(ivPart, 'base64url');
    const tag = Buffer.from(tagPart, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new DecryptionError('Malformed encrypted payload');
    }

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([
        decipher.update(Buffer.from(dataPart, 'base64url')),
        decipher.final(),
      ]);
      return plain.toString('utf8');
    } catch {
      throw new DecryptionError();
    }
  }
}
