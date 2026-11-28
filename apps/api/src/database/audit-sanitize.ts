/**
 * Остання лінія захисту журналу від PII і секретів: навіть якщо модуль помилково передасть
 * email чи токен у metadata, у БД потрапить «[redacted]». Основне правило лишається —
 * передавати лише allowlist-поля.
 */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|cookie|authorization|email|first_?name|last_?name|phone|address|recovery/i;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const MAX_DEPTH = 4;
const MAX_STRING = 500;
const MAX_ITEMS = 50;

function clean(value: unknown, depth: number): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (EMAIL_LIKE.test(value)) return '[redacted]';
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ITEMS).map((item) => clean(item, depth + 1));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      // eslint-disable-next-line security/detect-object-injection -- ключ із Object.entries, прототипні ключі відкинуто
      result[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : clean(inner, depth + 1);
    }
    return result;
  }
  // undefined, функції, bigint, символи — у журнал не потрапляють.
  return null;
}

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (metadata === null) return null;
  return clean(metadata, 0) as Record<string, unknown>;
}
