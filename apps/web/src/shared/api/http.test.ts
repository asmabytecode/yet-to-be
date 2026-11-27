import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../test/server';
import { ApiError, request, setUnauthorizedHandler } from './http';

const unauthorized = () =>
  HttpResponse.json({ code: 'UNAUTHORIZED', message: 'x' }, { status: 401 });

beforeEach(() => {
  document.cookie = 'ytb_csrf=csrf-1; path=/';
});
afterEach(() => {
  setUnauthorizedHandler(undefined);
});

describe('request', () => {
  it('додає X-CSRF-Token лише до запитів, що змінюють стан', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get('*/api/v1/ping', ({ request: r }) => {
        seen.push(r.headers.get('x-csrf-token'));
        return HttpResponse.json({});
      }),
      http.post('*/api/v1/ping', ({ request: r }) => {
        seen.push(r.headers.get('x-csrf-token'));
        return HttpResponse.json({});
      }),
    );
    await request('/ping');
    await request('/ping', { method: 'POST', body: { a: 1 } });
    expect(seen).toEqual([null, 'csrf-1']);
  });

  it('три паралельні 401 дають рівно один refresh, після чого всі запити повторюються', async () => {
    let refreshed = false;
    let refreshCalls = 0;
    server.use(
      http.get('*/api/v1/data', () =>
        refreshed ? HttpResponse.json({ ok: true }) : unauthorized(),
      ),
      http.post('*/api/v1/auth/refresh', async () => {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        refreshed = true;
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const results = await Promise.all([request('/data'), request('/data'), request('/data')]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
  });

  it('якщо refresh не вдався — кидає помилку й викликає обробник кінця сесії', async () => {
    const onEnd = vi.fn();
    setUnauthorizedHandler(onEnd);
    server.use(
      http.get('*/api/v1/data', unauthorized),
      http.post('*/api/v1/auth/refresh', unauthorized),
    );

    await expect(request('/data')).rejects.toMatchObject({ status: 401 });
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('onUnauthorized: ignore не викликає обробник', async () => {
    const onEnd = vi.fn();
    setUnauthorizedHandler(onEnd);
    server.use(
      http.get('*/api/v1/data', unauthorized),
      http.post('*/api/v1/auth/refresh', unauthorized),
    );

    await expect(request('/data', { onUnauthorized: 'ignore' })).rejects.toBeInstanceOf(ApiError);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('401 на /auth/login не запускає refresh', async () => {
    let refreshCalls = 0;
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ code: 'AUTH_INVALID_CREDENTIALS', message: 'x' }, { status: 401 }),
      ),
      http.post('*/api/v1/auth/refresh', () => {
        refreshCalls += 1;
        return new HttpResponse(null, { status: 200 });
      }),
    );

    await expect(request('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
    expect(refreshCalls).toBe(0);
  });

  it('розбирає issues із відповіді сервера', async () => {
    server.use(
      http.post('*/api/v1/x', () =>
        HttpResponse.json(
          {
            code: 'VALIDATION_FAILED',
            message: 'bad',
            issues: [{ path: 'email', code: 'invalid_format' }],
          },
          { status: 400 },
        ),
      ),
    );
    await expect(request('/x', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 400,
      issues: [{ path: 'email', code: 'invalid_format' }],
    });
  });

  it('мережева помилка → ApiError NETWORK_ERROR', async () => {
    server.use(http.get('*/api/v1/down', () => HttpResponse.error()));
    await expect(request('/down')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
