import { describe, expect, it } from 'vitest';
import { AUDIT_GENESIS, auditHash, type ChainRow, verifyChain } from './audit-chain';

function chain(length: number): ChainRow[] {
  const rows: ChainRow[] = [];
  let prev = AUDIT_GENESIS;
  for (let seq = 1; seq <= length; seq += 1) {
    const fields = {
      seq,
      createdAt: new Date(Date.UTC(2026, 0, seq)),
      action: `a${String(seq)}`,
      actorId: 'actor',
      targetType: null,
      targetId: null,
      ipHash: null,
      metadata: null,
      requestId: null,
    };
    const hash = auditHash(prev, fields);
    rows.push({ ...fields, prevHash: prev, hash });
    prev = hash;
  }
  return rows;
}

describe('verifyChain', () => {
  it('accepts an intact chain and reports its head', () => {
    const rows = chain(3);
    expect(verifyChain(rows)).toEqual({
      ok: true,
      checked: 3,
      head: { seq: 3, hash: rows[2]?.hash },
    });
    expect(verifyChain([])).toEqual({ ok: true, checked: 0, head: null });
  });

  it('verifies in batches using the previous head', () => {
    const rows = chain(4);
    const first = verifyChain(rows.slice(0, 2));
    expect(first.ok).toBe(true);
    const head = first.ok ? first.head : null;
    expect(verifyChain(rows.slice(2), head)).toMatchObject({ ok: true, checked: 2 });
  });

  it.each([
    [
      'modified field',
      (rows: ChainRow[]) => ({ ...rows[1], action: 'forged' }) as ChainRow,
      'hash_mismatch',
    ],
    [
      'relinked row',
      (rows: ChainRow[]) => ({ ...rows[1], prevHash: 'x' }) as ChainRow,
      'prev_mismatch',
    ],
  ] as const)('detects a %s', (_name, mutate, reason) => {
    const rows = chain(3);
    rows[1] = mutate(rows);
    expect(verifyChain(rows)).toMatchObject({ ok: false, brokenAtSeq: 2, reason });
  });

  it('detects a deleted row as a gap', () => {
    const rows = chain(3);
    expect(verifyChain([rows[0], rows[2]] as ChainRow[])).toMatchObject({
      ok: false,
      brokenAtSeq: 3,
      reason: 'gap',
    });
  });

  it('changes the hash when any chained field changes', () => {
    const base = chain(1)[0] as ChainRow;
    const original = auditHash(AUDIT_GENESIS, base);
    for (const field of [
      'action',
      'actorId',
      'targetId',
      'ipHash',
      'metadata',
      'requestId',
    ] as const) {
      expect(auditHash(AUDIT_GENESIS, { ...base, [field]: 'changed' })).not.toBe(original);
    }
  });
});
