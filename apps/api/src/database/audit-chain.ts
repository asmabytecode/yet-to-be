import { createHash } from 'node:crypto';

/** prevHash першого запису ланцюжка. */
export const AUDIT_GENESIS = 'GENESIS';

/** Поля запису, що входять у хеш. userId не входить: його змінює БД (ON DELETE SET NULL). */
export interface ChainedFields {
  seq: number;
  createdAt: Date;
  action: string;
  actorId: string | null;
  targetType: string | null;
  targetId: string | null;
  ipHash: string | null;
  metadata: string | null;
  requestId: string | null;
}

export function auditHash(prevHash: string, row: ChainedFields): string {
  // Масив, а не об'єкт: порядок полів фіксований і не залежить від JSON.stringify ключів.
  const canonical = JSON.stringify([
    row.seq,
    prevHash,
    row.createdAt.toISOString(),
    row.action,
    row.actorId,
    row.targetType,
    row.targetId,
    row.ipHash,
    row.metadata,
    row.requestId,
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

export interface ChainRow extends ChainedFields {
  prevHash: string | null;
  hash: string | null;
}

export type ChainVerdict =
  | { ok: true; checked: number; head: { seq: number; hash: string } | null }
  | {
      ok: false;
      checked: number;
      brokenAtSeq: number;
      reason: 'gap' | 'prev_mismatch' | 'hash_mismatch';
    };

/**
 * Перевіряє послідовність записів (за зростанням seq): немає пропусків (видалення),
 * кожен посилається на попередній, хеш збігається (підміна). `expectedPrev` — хеш
 * останнього запису попередньої порції, щоб перевіряти великий журнал частинами.
 */
export function verifyChain(
  rows: readonly ChainRow[],
  expectedPrev: { seq: number; hash: string } | null = null,
): ChainVerdict {
  let previous = expectedPrev;
  let checked = 0;
  for (const row of rows) {
    const expectedSeq = previous === null ? 1 : previous.seq + 1;
    if (row.seq !== expectedSeq) {
      return { ok: false, checked, brokenAtSeq: row.seq, reason: 'gap' };
    }
    const prevHash = previous === null ? AUDIT_GENESIS : previous.hash;
    if (row.prevHash !== prevHash) {
      return { ok: false, checked, brokenAtSeq: row.seq, reason: 'prev_mismatch' };
    }
    const hash = auditHash(prevHash, row);
    if (row.hash !== hash) {
      return { ok: false, checked, brokenAtSeq: row.seq, reason: 'hash_mismatch' };
    }
    previous = { seq: row.seq, hash };
    checked += 1;
  }
  return { ok: true, checked, head: previous };
}
