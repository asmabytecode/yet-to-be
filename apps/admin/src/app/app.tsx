import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError, setUnauthorizedHandler, ToastProvider } from '@yet-to-be/ui';
import { useEffect } from 'react';
import { RouterProvider, type RouterProviderProps } from 'react-router-dom';
import { keys } from '../api/admin-api';
import { StepUpProvider } from './step-up';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        retry: (count, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
    },
  });
}

/**
 * Корінь адмінки. Сесія спільна з сайтом (cookie на тому ж домені): якщо вона закінчилась —
 * чистимо кеш і показуємо екран входу (AdminGate), сам вхід — на сайті.
 */
export function AdminProviders({
  client,
  router,
}: {
  client: QueryClient;
  router: RouterProviderProps['router'];
}) {
  useEffect(() => {
    setUnauthorizedHandler(() => {
      client.clear();
      client.setQueryData(keys.session, null);
    });
    return () => {
      setUnauthorizedHandler(undefined);
    };
  }, [client]);

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <StepUpProvider>
          <RouterProvider router={router} />
        </StepUpProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
