import { useQuery } from '@tanstack/react-query';
import type { Permission } from '@yet-to-be/shared';
import type { ReactNode } from 'react';
import { adminApi, keys } from '../api/admin-api';

/** Сесія й права. Права в UI лише ховають недоступне — сервер перевіряє кожен запит сам. */
export function useAdminSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: async () => {
      try {
        return await adminApi.session();
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
}

export function useCan(): (...permissions: Permission[]) => boolean {
  const session = useAdminSession();
  const access = session.data?.access;
  return (...permissions) =>
    access !== undefined &&
    (access.isOwner || permissions.every((permission) => access.permissions.includes(permission)));
}

/** Показує вміст лише за наявності прав (зручність UI, не безпека). */
export function Can({ permissions, children }: { permissions: Permission[]; children: ReactNode }) {
  const can = useCan();
  return can(...permissions) ? children : null;
}
