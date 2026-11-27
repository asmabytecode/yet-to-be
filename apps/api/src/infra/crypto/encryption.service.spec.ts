import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../../test/config';
import { buildAad, DecryptionError, EncryptionService } from './encryption.service';

const key32 = (): string => randomBytes(32).toString('base64');

function createService(keys: Record<string, string>, activeKeyId: string): EncryptionService {
  return new EncryptionService(
    createTestConfig({
      DATA_ENCRYPTION_KEYS: JSON.stringify(keys),
      DATA_ENCRYPTION_ACTIVE_KEY_ID: activeKeyId,
    }),
  );
}

describe('EncryptionService', () => {
  const aad = buildAad('users', 'email', 'user-1');

  it('round-trips a value, including unicode and empty strings', () => {
    const service = createService({ k1: key32() }, 'k1');
    for (const plain of ['ada@example.com', 'Іван Петренко 🙂', '']) {
      expect(service.decrypt(service.encrypt(plain, aad), aad)).toBe(plain);
    }
  });

  it('produces a different ciphertext on every call', () => {
    const service = createService({ k1: key32() }, 'k1');
    expect(service.encrypt('same', aad)).not.toBe(service.encrypt('same', aad));
  });

  it('uses the documented v1 format and does not leak the plaintext', () => {
    const service = createService({ k1: key32() }, 'k1');
    const payload = service.encrypt('ada@example.com', aad);
    const parts = payload.split(':');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('v1');
    expect(parts[1]).toBe('k1');
    expect(payload).not.toContain('ada@example.com');
  });

  it('rejects a tampered ciphertext, auth tag or IV', () => {
    const service = createService({ k1: key32() }, 'k1');
    const [version, keyId, iv, tag, data] = service.encrypt('secret value', aad).split(':') as [
      string,
      string,
      string,
      string,
      string,
    ];
    const flip = (value: string): string => `${value[0] === 'A' ? 'B' : 'A'}${value.slice(1)}`;

    for (const tampered of [
      [version, keyId, iv, tag, flip(data)],
      [version, keyId, iv, flip(tag), data],
      [version, keyId, flip(iv), tag, data],
    ]) {
      expect(() => service.decrypt(tampered.join(':'), aad)).toThrow(DecryptionError);
    }
  });

  it('rejects a different AAD (value moved to another field or row)', () => {
    const service = createService({ k1: key32() }, 'k1');
    const payload = service.encrypt('secret', aad);
    expect(() => service.decrypt(payload, buildAad('users', 'email', 'user-2'))).toThrow(
      DecryptionError,
    );
    expect(() => service.decrypt(payload, buildAad('users', 'firstName', 'user-1'))).toThrow(
      DecryptionError,
    );
  });

  it('rejects malformed payloads and unknown key ids', () => {
    const service = createService({ k1: key32() }, 'k1');
    expect(() => service.decrypt('garbage', aad)).toThrow(DecryptionError);
    expect(() => service.decrypt('v2:k1:a:b:c', aad)).toThrow(DecryptionError);
    expect(() => service.decrypt('v1:k9:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AA', aad)).toThrow(
      DecryptionError,
    );
  });

  it('keeps old data readable after key rotation', () => {
    const k1 = key32();
    const k2 = key32();
    const before = createService({ k1 }, 'k1');
    const legacy = before.encrypt('old data', aad);

    const after = createService({ k1, k2 }, 'k2');
    expect(after.decrypt(legacy, aad)).toBe('old data');
    expect(after.encrypt('new data', aad).split(':')[1]).toBe('k2');
  });

  it('refuses keys of the wrong size or ids with unsafe characters', () => {
    // 16 байтів у base64: пройде regex схеми env лише в обхід, тому перевіряємо напряму сервіс.
    const tooShort = { crypto: { keys: { k1: randomBytes(16).toString('base64') }, activeKeyId: 'k1' } };
    expect(() => new EncryptionService(tooShort as never)).toThrow('exactly 32 bytes');

    const badId = { crypto: { keys: { 'a:b': key32() }, activeKeyId: 'a:b' } };
    expect(() => new EncryptionService(badId as never)).toThrow('Invalid encryption key id');
  });
});
