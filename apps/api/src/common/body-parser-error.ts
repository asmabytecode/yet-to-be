import type { ErrorRequestHandler } from 'express';
import { buildErrorBody } from './all-exceptions.filter';
import { requestIdOf } from './request-context';

interface ParserError {
  type?: unknown;
  status?: unknown;
}

/**
 * Помилки body-parser (завеликий або зламаний JSON) виникають до роутера, тому
 * Nest-фільтр їх не бачить. Віддаємо їх у тому самому форматі.
 */
export const bodyParserErrorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  const parsed = err as ParserError;
  if (typeof err !== 'object' || err === null || typeof parsed.type !== 'string') {
    next(err);
    return;
  }
  const status = parsed.type === 'entity.too.large' ? 413 : 400;
  res.status(status).json(buildErrorBody(status, requestIdOf(req)));
};
