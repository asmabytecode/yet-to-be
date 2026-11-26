import { Injectable } from '@nestjs/common';
import type { AuditLog } from '../../generated/prisma/client';
import { PrismaService } from '../prisma.service';

export interface RecordAuditInput {
  /** null — подія без авторизованого користувача (наприклад, невдалий вхід). */
  userId: string | null;
  action: string;
  ipHash: string | null;
  /** Додаткові дані. Не передавайте сюди секрети й PII. */
  metadata: Record<string, unknown> | null;
}

/** Журнал безпекових подій. Лише додавання й читання. */
@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  record(input: RecordAuditInput): Promise<AuditLog> {
    return this.prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        ipHash: input.ipHash,
        metadata: input.metadata === null ? null : JSON.stringify(input.metadata),
      },
    });
  }

  listForUser(userId: string, limit = 50): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Видаляє записи старші за вказану дату (політика зберігання). */
  async deleteOlderThan(before: Date): Promise<number> {
    const { count } = await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: before } } });
    return count;
  }
}
