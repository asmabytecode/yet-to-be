import type { ErrorCode } from '@yet-to-be/shared';

export const API_BASE = '/api/v1';

/** У production cookie має префікс __Host-; у dev — ні. */
const CSRF_COOKIE_NAMES = ['__Host-ytb_csrf', 'ytb_csrf'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** На ці шляхи 401 означає "невірні дані", а не "протух access-токен" — refresh не потрібен. */
const NO_REFRESH_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/csrf',
]);

export interface ApiIssue {
  path: string;
  code: string;
}

/** Помилка API у єдиному форматі бекенду. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN',
    message: string,
    readonly issues: ApiIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON-тіло або FormData (завантаження файлів). */
  body?: unknown;
  /** Додаткові заголовки (наприклад, Idempotency-Key). */
  headers?: Record<string, string>;
  /**
   * Що робити, якщо сесія остаточно закінчилась (refresh не вдався):
   * 'redirect' (за замовчуванням) — викликати глобальний обробник (очистити кеш → /login);
   * 'ignore' — лише кинути помилку (так працює перевірка сесії для гостя).
   */
  onUnauthorized?: 'redirect' | 'ignore';
}

let unauthorizedHandler: (() => void) | undefined;

export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  unauthorizedHandler = handler;
}

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  const entry = document.cookie.split('; ').find((part) => part.startsWith(prefix));
  return entry === undefined ? undefined : decodeURIComponent(entry.slice(prefix.length));
}

function readCsrfCookie(): string | undefined {
  for (const name of CSRF_COOKIE_NAMES) {
    const value = readCookie(name);
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

async function csrfToken(): Promise<string> {
  const fromCookie = readCsrfCookie();
  if (fromCookie !== undefined) return fromCookie;
  const response = await fetch(`${API_BASE}/auth/csrf`, { credentials: 'include' });
  const body = (await response.json()) as { csrfToken?: unknown };
  if (typeof body.csrfToken !== 'string')
    throw new ApiError(response.status, 'UNKNOWN', 'No CSRF token');
  return body.csrfToken;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { ...options.headers, Accept: 'application/json' };
  if (!SAFE_METHODS.has(method)) headers['X-CSRF-Token'] = await csrfToken();

  const init: RequestInit = { method, credentials: 'include', headers };
  if (options.body instanceof FormData) {
    // multipart: межу (boundary) і Content-Type виставляє браузер.
    init.body = options.body;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  try {
    return await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error');
  }
}

let inflightRefresh: Promise<boolean> | null = null;

/**
 * Single-flight: скільки б запитів одночасно не отримали 401, на сервер піде один /auth/refresh,
 * решта чекає на його результат. Інакше ротація токена зламала б паралельні запити.
 */
function refreshSession(): Promise<boolean> {
  inflightRefresh ??= (async () => {
    try {
      const response = await send('/auth/refresh', { method: 'POST' });
      return response.ok;
    } catch {
      return false;
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

async function toResult<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (response.status === 204 ? undefined : await response.json()) as T;
  }
  const body = (await response.json().catch(() => null)) as {
    code?: unknown;
    message?: unknown;
    issues?: unknown;
  } | null;
  throw new ApiError(
    response.status,
    (typeof body?.code === 'string' ? body.code : 'UNKNOWN') as ErrorCode,
    typeof body?.message === 'string' ? body.message : response.statusText,
    Array.isArray(body?.issues) ? (body.issues as ApiIssue[]) : [],
  );
}

/**
 * Запит до API. Токенів JavaScript не бачить: сесія живе в httpOnly cookies, а CSRF-токен
 * (єдиний читабельний) додається в заголовок для методів, що змінюють стан.
 * На 401 — один refresh і повтор запиту; якщо refresh не вдався — сесія закінчилась.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);
  if (response.status !== 401 || NO_REFRESH_PATHS.has(path)) {
    return toResult<T>(response);
  }

  if (await refreshSession()) {
    return toResult<T>(await send(path, options));
  }
  if (options.onUnauthorized !== 'ignore') unauthorizedHandler?.();
  return toResult<T>(response);
}
