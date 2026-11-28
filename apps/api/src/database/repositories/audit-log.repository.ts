import { Inject, Injectable } from '@nestjs/common';
import type { AuditLog, Prisma } from '../../generated/prisma/client';
import { currentRequestScope } from '../../platform/request-scope';
import { AUDIT_GENESIS, auditHash, type ChainedFields, type ChainRow } from '../audit-chain';
import { sanitizeAuditMetadata } from '../audit-sanitize';
import { isUniqueViolation } from '../errors';
import { PrismaService } from '../prisma.service';

export interface RecordAuditInput {
  /** Користувач, якого стосується подія; null — невідомий (наприклад, невдалий вхід). */
  userId: string | null;
  /** Хто діяв; за замовчуванням — сам userId. */
  actorId?: string | null;
  action: string;
  ipHash: string | null;
  /** Додаткові дані. Не передавайте сюди секрети й PII (вони все одно будуть замасковані). */
  metadata: Record<string, unknown> | null;
  targetType?: string | null;
  targetId?: string | null;
  /** За замовчуванням — id поточного HTTP-запиту. */
  requestId?: string | null;
}

export interface AuditFilter {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
}

type Db = Prisma.TransactionClient;
const MAX_ATTEMPTS = 5;

function isRetryable(error: unknown): boolean {
  return isUniqueViolation(error) || /SQLITE_BUSY|database is locked/i.test(String(error));
}

/**
 * Журнал безпекових і адміністративних подій. ЛИШЕ додавання й читання: методів зміни
 * чи видалення немає. Кожен запис пов'язаний з попереднім хешем (виявлення підміни).
 */
@Injectable()
export class AuditLogRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Додає запис. Якщо передано `tx`, запис стає частиною транзакції самої дії
   * (немає дії без запису). Інакше — власна транзакція з повтором при конкуренції.
   */
  async record(input: RecordAuditInput, tx?: Db): Promise<AuditLog> {
    if (tx !== undefined) return this.append(tx, input);
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction((client) => this.append(client, input));
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS || !isRetryable(error)) throw error;
      }
    }
  }

  private async append(db: Db, input: RecordAuditInput): Promise<AuditLog> {
    const last = await db.auditLog.findFirst({
      where: { seq: { not: null } },
      orderBy: { seq: 'desc' },
      select: { seq: true, hash: true },
    });
    const prevHash = last?.hash ?? AUDIT_GENESIS;
    const metadata = sanitizeAuditMetadata(input.metadata);
    const fields: ChainedFields = {
      seq: (last?.seq ?? 0) + 1,
      createdAt: new Date(),
      action: input.action,
      actorId: input.actorId === undefined ? input.userId : input.actorId,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      ipHash: input.ipHash,
      metadata: metadata === null ? null : JSON.stringify(metadata),
      requestId: input.requestId ?? currentRequestScope()?.requestId ?? null,
    };
    return db.auditLog.create({
      data: { ...fields, userId: input.userId, prevHash, hash: auditHash(prevHash, fields) },
    });
  }

  listForUser(userId: string, limit = 50): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Пошук для адмінки: найновіші спершу, курсорна пагінація за id. */
  search(
    filter: AuditFilter,
    page: { take: number; cursor?: { id: string }; skip?: number },
  ): Promise<AuditLog[]> {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (filter.from !== undefined) createdAt.gte = filter.from;
    if (filter.to !== undefined) createdAt.lte = filter.to;
    return this.prisma.auditLog.findMany({
      ...page,
      where: {
        ...(filter.actorId === undefined ? {} : { actorId: filter.actorId }),
        ...(filter.action === undefined ? {} : { action: filter.action }),
        ...(filter.targetType === undefined ? {} : { targetType: filter.targetType }),
        ...(filter.targetId === undefined ? {} : { targetId: filter.targetId }),
        ...(Object.keys(createdAt).length === 0 ? {} : { createdAt }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  /** Порція ланцюжка для перевірки (seq > after), за зростанням. */
  async chainBatch(after: number, take: number): Promise<(ChainRow & { seq: number })[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { seq: { gt: after } },
      orderBy: { seq: 'asc' },
      take,
    });
    return rows.map((row) => ({ ...row, seq: row.seq ?? 0 }));
  }
}
