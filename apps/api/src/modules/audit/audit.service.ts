import { Inject, Injectable } from '@nestjs/common';
import type { AuditEntryDto, AuditQuery, ListResponse } from '@yet-to-be/shared';
import { type ChainVerdict, verifyChain } from '../../database/audit-chain';
import { AuditLogRepository } from '../../database/repositories/audit-log.repository';
import { UsersRepository } from '../../database/repositories/users.repository';
import type { AuditLog, Prisma } from '../../generated/prisma/client';
import { HashingService } from '../../infra/crypto/hashing.service';
import { pageArgs, toPage } from '../../platform/pagination';

export interface AuditTarget {
  type: string;
  id: string;
}

export interface AuditEntry {
  /** Хто діяв; null — система (bootstrap-команда, міграція). */
  actorId: string | null;
  action: string;
  target?: AuditTarget;
  /** Лише allowlist-поля, без PII і секретів (зайве все одно буде замасковано). */
  metadata?: Record<string, unknown>;
  /** Сирий IP; у журнал потрапляє лише HMAC. */
  ip?: string | null;
}

/** Транзакція Prisma — щоб запис журналу став частиною тієї самої транзакції, що й дія. */
export type AuditTransaction = Prisma.TransactionClient;

const VERIFY_BATCH = 1000;

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Фасад журналу для всіх модулів: запис (з хеш-ланцюжком), пошук і перевірка цілісності. */
@Injectable()
export class AuditService {
  constructor(
    @Inject(AuditLogRepository) private readonly repository: AuditLogRepository,
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(HashingService) private readonly hashing: HashingService,
  ) {}

  async record(entry: AuditEntry, tx?: AuditTransaction): Promise<void> {
    const ip = entry.ip ?? null;
    await this.repository.record(
      {
        // Подія «про користувача» видна в його історії; інакше прив'язуємо до актора.
        userId: entry.target?.type === 'user' ? entry.target.id : entry.actorId,
        actorId: entry.actorId,
        action: entry.action,
        ipHash: ip === null ? null : this.hashing.ipHash(ip),
        metadata: entry.metadata ?? null,
        targetType: entry.target?.type ?? null,
        targetId: entry.target?.id ?? null,
      },
      tx,
    );
  }

  async search(query: AuditQuery): Promise<ListResponse<AuditEntryDto>> {
    const rows = await this.repository.search(
      {
        ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
        ...(query.action === undefined ? {} : { action: query.action }),
        ...(query.targetType === undefined ? {} : { targetType: query.targetType }),
        ...(query.targetId === undefined ? {} : { targetId: query.targetId }),
        ...(query.from === undefined ? {} : { from: new Date(query.from) }),
        ...(query.to === undefined ? {} : { to: new Date(query.to) }),
      },
      pageArgs(query),
    );
    const names = await this.users.findDisplayNames(
      rows.flatMap((row) => (row.actorId === null ? [] : [row.actorId])),
    );
    return toPage(rows, query.limit, (row: AuditLog) => ({
      id: row.id,
      seq: row.seq,
      action: row.action,
      actorId: row.actorId,
      actorName: row.actorId === null ? null : (names.get(row.actorId) ?? null),
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: parseMetadata(row.metadata),
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Перевіряє весь ланцюжок порціями. Хеш голови варто зберігати поза БД (ADR 0009). */
  async verify(): Promise<ChainVerdict> {
    let head: { seq: number; hash: string } | null = null;
    let checked = 0;
    for (;;) {
      const batch = await this.repository.chainBatch(head?.seq ?? 0, VERIFY_BATCH);
      if (batch.length === 0) return { ok: true, checked, head };
      const verdict = verifyChain(batch, head);
      if (!verdict.ok) return { ...verdict, checked: checked + verdict.checked };
      checked += verdict.checked;
      head = verdict.head;
    }
  }
}
