import { argon2id, hash } from 'argon2';
import { describe, expect, it, vi } from 'vitest';
import { createTestConfig } from '../../../test/config';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService(createTestConfig());

  it('hashes with argon2id and never contains the password', async () => {
    const digest = await service.hash('correct horse battery');
    expect(digest.startsWith('$argon2id$')).toBe(true);
    expect(digest).not.toContain('correct horse battery');
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const digest = await service.hash('correct horse battery');
    expect(await service.verify(digest, 'correct horse battery')).toBe(true);
    expect(await service.verify(digest, 'wrong password!')).toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([
      service.hash('same password'),
      service.hash('same password'),
    ]);
    expect(a).not.toBe(b);
  });

  it('does not verify without the same pepper', async () => {
    const digest = await service.hash('correct horse battery');
    const otherPepper = new PasswordService(createTestConfig({ PASSWORD_PEPPER: 'x'.repeat(40) }));
    expect(await otherPepper.verify(digest, 'correct horse battery')).toBe(false);
  });

  it('returns false for a corrupted hash instead of throwing', async () => {
    expect(await service.verify('not-a-hash', 'whatever')).toBe(false);
  });

  it('needsRehash is true for weaker parameters and false for current ones', async () => {
    const weak = await hash('password', {
      type: argon2id,
      memoryCost: 4096,
      timeCost: 1,
      parallelism: 1,
    });
    expect(service.needsRehash(weak)).toBe(true);
    expect(service.needsRehash(await service.hash('password'))).toBe(false);
  });

  it('verifyAgainstDummy performs a real verification and reuses the dummy hash', async () => {
    const fresh = new PasswordService(createTestConfig());
    const hashSpy = vi.spyOn(fresh, 'hash');
    const verifySpy = vi.spyOn(fresh, 'verify');

    await fresh.verifyAgainstDummy('anything');
    await fresh.verifyAgainstDummy('anything else');

    expect(hashSpy).toHaveBeenCalledTimes(1);
    expect(verifySpy).toHaveBeenCalledTimes(2);
  });
});
