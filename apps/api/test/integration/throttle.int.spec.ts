import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { API, createTestApp, csrfToken, type TestApp } from '../test-app';

// Виконується до імпортів: ConfigModule читає env під час завантаження модуля.
vi.hoisted(() => {
  process.env['THROTTLE_DISABLED'] = 'false';
});

describe('rate limiting (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('limits repeated login attempts and answers 429 with Retry-After', async () => {
    const agent = ctx.agent();
    const token = await csrfToken(agent);
    const attempt = () =>
      agent
        .post(`${API}/auth/login`)
        .set('X-CSRF-Token', token)
        .send({ email: 'nobody@example.com', password: 'wrong password' });

    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      statuses.push((await attempt()).status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);

    const limited = await attempt();
    expect(limited.headers['retry-after']).toBeDefined();
    expect((limited.body as { code: string }).code).toBe('RATE_LIMITED');
  });
});
