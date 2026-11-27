import type { Request } from 'express';

/** Користувач, якого guard записує в запит після перевірки access-токена. */
export interface AuthUser {
  id: string;
  sessionId: string;
}

export type AppRequest = Request & { user?: AuthUser };

/** Контекст клієнта для аудиту й сесій. */
export interface ClientContext {
  ip: string | null;
  userAgent: string | null;
}

export function clientContext(req: Request): ClientContext {
  const agent = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    userAgent: typeof agent === 'string' ? agent.slice(0, 256) : null,
  };
}

export function requestIdOf(req: Request): string {
  const id = (req as { id?: unknown }).id;
  return typeof id === 'string' ? id : 'unknown';
}
