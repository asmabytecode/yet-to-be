import { describe, expect, it } from 'vitest';
import { JobQueue } from './job-queue';

describe('JobQueue', () => {
  it('runs jobs in the background and lets callers wait for them', async () => {
    const queue = new JobQueue();
    const seen: string[] = [];
    queue.register('greet', (payload) => {
      seen.push(payload.name ?? '');
      return Promise.resolve();
    });
    queue.enqueue('greet', { name: 'a' });
    expect(seen).toEqual([]);
    await queue.drain();
    expect(seen).toEqual(['a']);
  });

  it('retries failed jobs and gives up after the limit', async () => {
    const queue = new JobQueue();
    let calls = 0;
    queue.register('flaky', () => {
      calls += 1;
      return calls < 2 ? Promise.reject(new Error('boom')) : Promise.resolve();
    });
    queue.enqueue('flaky', {});
    await queue.drain();
    expect(calls).toBe(2);

    let failures = 0;
    queue.register('broken', () => {
      failures += 1;
      return Promise.reject(new Error('always'));
    });
    queue.enqueue('broken', {}, { retries: 1 });
    await queue.drain();
    expect(failures).toBe(2);
  });

  it('refuses unknown and duplicate handlers', () => {
    const queue = new JobQueue();
    expect(() => {
      queue.enqueue('missing', {});
    }).toThrow(/No handler/);
    queue.register('x', () => Promise.resolve());
    expect(() => {
      queue.register('x', () => Promise.resolve());
    }).toThrow(/already registered/);
  });
});
