import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './http';

export const SESSION_KEY = ['session'] as const;
export const SESSIONS_KEY = ['sessions'] as const;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Помилки клієнта (4xx) повторювати немає сенсу.
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
    },
  });
}
