import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Присвоює кожному запиту id (приймає безпечний X-Request-Id від проксі) і віддає його у відповіді. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
  (req as { id?: string }).id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
