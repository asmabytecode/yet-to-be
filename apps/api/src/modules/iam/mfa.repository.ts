import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { MfaRecoveryCode, UserMfa } from '../../generated/prisma/client';

/** Таблиці MFA. Секрети приходять уже зашифрованими, коди — уже захешованими. */
@Injectable()
export class MfaRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  find(userId: string): Promise<UserMfa | null> {
    return this.prisma.userMfa.findUnique({ where: { userId } });
  }

  /** Новий (ще не підтверджений) секрет; старі резервні коди видаляються. */
  async startSetup(userId: string, secretEncrypted: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.userMfa.upsert({
        where: { userId },
        create: { userId, secretEncrypted },
        update: { secretEncrypted, enabledAt: null, lastUsedStep: null },
      }),
    ]);
  }

  async enable(userId: string, step: number, codeHashes: string[], now: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.userMfa.update({
        where: { userId },
        data: { enabledAt: now, lastUsedStep: step },
      }),
      this.prisma.mfaRecoveryCode.createMany({
        data: codeHashes.map((codeHash) => ({ userId, codeHash })),
      }),
    ]);
  }

  /**
   * Атомарно фіксує використаний крок: оновлення спрацює лише якщо крок новіший за
   * збережений, тож два паралельні запити з одним кодом не пройдуть обидва.
   */
  async consumeStep(userId: string, step: number): Promise<boolean> {
    const { count } = await this.prisma.userMfa.updateMany({
      where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] },
      data: { lastUsedStep: step },
    });
    return count === 1;
  }

  unusedRecoveryCodes(userId: string): Promise<MfaRecoveryCode[]> {
    return this.prisma.mfaRecoveryCode.findMany({ where: { userId, usedAt: null } });
  }

  async consumeRecoveryCode(id: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.mfaRecoveryCode.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: now },
    });
    return count === 1;
  }

  async remove(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.userMfa.deleteMany({ where: { userId } }),
    ]);
  }
}
