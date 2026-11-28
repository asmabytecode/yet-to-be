import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import { requestIdOf } from '../common/request-context';

/** Дані запиту, доступні з будь-якого шару без передавання параметрами (журнал, логи). */
export interface RequestScope {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestScope>();

/** Підключається після requestIdMiddleware. */
export function requestScopeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  storage.run({ requestId: requestIdOf(req) }, next);
}

export function currentRequestScope(): RequestScope | undefined {
  return storage.getStore();
}

/** Для тестів і фонових задач: виконати функцію в контексті з заданим requestId. */
export function runInRequestScope<T>(scope: RequestScope, fn: () => T): T {
  return storage.run(scope, fn);
}
