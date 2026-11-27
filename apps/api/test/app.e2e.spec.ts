import { Writable } from 'node:stream';
import { Controller, Get } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Public } from '../src/common/decorators';
import { logTestHook } from '../src/common/logging';
import { API, createTestApp, type TestApp } from './test-app';

@Controller('boom')
class BoomController {
  @Public()
  @Get()
  boom(): never {
    throw new Error('super secret internal detail');
  }
}

describe('app (e2e)', () => {
  let ctx: TestApp;
  const logs: string[] = [];

  beforeAll(async () => {
    logTestHook.stream = new Writable({
      write(chunk: Buffer, _enc, done) {
        logs.push(chunk.toString('utf8'));
        done();
      },
    });
    ctx = await createTestApp([BoomController]);
  });
  afterAll(async () => {
    await ctx.close();
    logTestHook.stream = undefined;
  });

  const server = (): never => ctx.app.getHttpServer() as never;

  it('hides the framework and sets security headers', async () => {
    const res = await request(server()).get(`${API}/health/live`).expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not answer CORS preflight with permissive headers', async () => {
    const res = await request(server())
      .options(`${API}/auth/login`)
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('reports liveness and readiness', async () => {
    await request(server()).get(`${API}/health/live`).expect(200, { status: 'ok' });
    await request(server()).get(`${API}/health/ready`).expect(200, { status: 'ok' });
  });

  it('propagates a safe X-Request-Id and generates one otherwise', async () => {
    const own = await request(server()).get(`${API}/health/live`).set('X-Request-Id', 'abc12345-test');
    expect(own.headers['x-request-id']).toBe('abc12345-test');
    const unsafe = await request(server()).get(`${API}/health/live`).set('X-Request-Id', 'bad id!');
    expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers unknown routes with the unified error format', async () => {
    const res = await request(server()).get(`${API}/nope`).expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', message: 'Not found' });
    expect((res.body as { requestId: string }).requestId).toBe(res.headers['x-request-id']);
  });

  it('does not leak internals on unexpected errors', async () => {
    const res = await request(server()).get(`${API}/boom`).expect(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('super secret');
    expect(JSON.stringify(res.body)).not.toContain('at ');
  });

  it('rejects oversized and malformed JSON bodies', async () => {
    const agent = ctx.agent();
    const tooBig = await agent
      .post(`${API}/auth/login`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@example.com', password: 'x'.repeat(200_000) }));
    expect(tooBig.status).toBe(413);
    expect((tooBig.body as { code: string }).code).toBe('PAYLOAD_TOO_LARGE');

    const broken = await agent
      .post(`${API}/auth/login`)
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(broken.status).toBe(400);
    expect((broken.body as { code: string }).code).toBe('BAD_REQUEST');
  });

  it('never writes secrets or query strings to the logs', async () => {
    logs.length = 0;
    await request(server())
      .get(`${API}/auth/session?token=query-secret-value`)
      .set('Authorization', 'Bearer header-secret-value')
      .set('Cookie', 'ytb_at=cookie-secret-value')
      .expect(401);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const output = logs.join('');
    expect(output).toContain('/auth/session');
    for (const secret of ['header-secret-value', 'cookie-secret-value', 'query-secret-value']) {
      expect(output).not.toContain(secret);
    }
  });
});
