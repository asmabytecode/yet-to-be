import { describe, expect, it, vi } from 'vitest';
import { waitFor } from './wait-for.mjs';

describe('waitFor', () => {
  it('resolves once the URL answers 2xx', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await waitFor('http://x/health', { timeoutMs: 1_000, intervalMs: 1, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('fails with the last error after the timeout', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(
      waitFor('http://x/health', { timeoutMs: 20, intervalMs: 5, fetchImpl }),
    ).rejects.toThrow(/not ready after .*HTTP 503/);
  });
});
