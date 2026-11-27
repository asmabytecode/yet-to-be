import { useEffect } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider, type RouterProviderProps } from 'react-router-dom';
import { SESSION_KEY } from '../shared/api/query-client';
import { setUnauthorizedHandler } from '../shared/api/http';
import { ToastProvider } from '../shared/ui/toast';

type Router = RouterProviderProps['router'];

/**
 * Корінь застосунку. Якщо сесія остаточно закінчилась (refresh не вдався) — скидаємо кеш
 * і ведемо на /login.
 */
export function AppProviders({ client, router }: { client: QueryClient; router: Router }) {
  useEffect(() => {
    setUnauthorizedHandler(() => {
      client.clear();
      client.setQueryData(SESSION_KEY, null);
      void router.navigate('/login', { replace: true });
    });
    return () => {
      setUnauthorizedHandler(undefined);
    };
  }, [client, router]);

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
