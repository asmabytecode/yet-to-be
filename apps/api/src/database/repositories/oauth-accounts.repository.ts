import { Inject, Injectable } from '@nestjs/common';
import type { OAuthAccount } from '../../generated/prisma/client';
import { isUniqueViolation, UniqueConstraintError } from '../errors';
import { PrismaService } from '../prisma.service';

export interface LinkOAuthAccountInput {
  userId: string;
  provider: string;
  providerAccountId: string;
}

/** Зв'язки користувача із зовнішніми провайдерами входу (Google). */
@Injectable()
export class OAuthAccountsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async link(input: LinkOAuthAccountInput): Promise<OAuthAccount> {
    try {
      return await this.prisma.oAuthAccount.create({
        data: {
          userId: input.userId,
          provider: input.provider,
          providerAccountId: input.providerAccountId,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new UniqueConstraintError('oauthAccount');
      }
      throw error;
    }
  }

  findByProviderAccount(provider: string, providerAccountId: string): Promise<OAuthAccount | null> {
    return this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
    });
  }

  listForUser(userId: string): Promise<OAuthAccount[]> {
    return this.prisma.oAuthAccount.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }

  /** Повертає true, якщо зв'язок існував і був видалений. */
  async unlink(userId: string, provider: string): Promise<boolean> {
    const { count } = await this.prisma.oAuthAccount.deleteMany({ where: { userId, provider } });
    return count > 0;
  }
}
