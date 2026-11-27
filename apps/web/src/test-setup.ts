import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import './i18n';
import { server } from './test/server';

// Node-fetch не приймає відносні URL, а застосунок ходить на /api/v1/... (той самий origin).
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) =>
  nativeFetch(typeof input === 'string' && input.startsWith('/') ? new URL(input, window.location.origin) : input, init);

// jsdom підміняє AbortController/AbortSignal своїми, а undici (Node) приймає лише рідні:
// React Router створює Request із jsdom-сигналом і падає. У тестах сигнал просто відкидаємо.
const NativeRequest = globalThis.Request;
class TestRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init?.signal ? { ...init, signal: null } : init);
  }
}
globalThis.Request = TestRequest;

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
  document.cookie = 'ytb_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});
afterAll(() => {
  server.close();
});
