import { randomUUID } from 'node:crypto';
import { type Writable } from 'node:stream';
import type { Params } from 'nestjs-pino';
import type { AppConfigService } from '../config/app-config.service';

/** Тестовий хук: дозволяє перехопити логи й перевірити, що секрети в них не потрапляють. */
export const logTestHook: { stream: Writable | undefined } = { stream: undefined };

/** Шляхи, значення яких ніколи не пишуться в лог. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.body',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.token',
];

export function buildLoggerParams(config: Pick<AppConfigService, 'app'>): Params {
  const stream = logTestHook.stream;
  const silent = config.app.nodeEnv === 'test' && stream === undefined;
  const options = {
    level: silent ? 'silent' : 'info',
    genReqId: (req: object): string => {
      const id = (req as { id?: unknown }).id;
      return typeof id === 'string' ? id : randomUUID();
    },
    redact: { paths: REDACT_PATHS, censor: '[Redacted]' },
    serializers: {
      // Лише метод і шлях: query-рядок може містити токени/PII.
      req: (req: { id: unknown; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url.split('?')[0],
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  };
  return { pinoHttp: stream === undefined ? options : [options, stream] };
}
