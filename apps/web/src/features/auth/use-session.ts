import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserDto } from '@yet-to-be/shared';
import { SESSION_KEY } from '../../shared/api/query-client';
import { authApi } from './api';

/** Поточна сесія. Токенів у JS немає: стан береться з GET /auth/session (cookies httpOnly). */
export function useSession() {
  return useQuery({ queryKey: SESSION_KEY, queryFn: () => authApi.session(), staleTime: 60_000 });
}

/** Чи показувати посилання на адмінку. Ключ залежить від користувача: після входу — новий запит. */
export function useIsTeamMember(userId: string | undefined) {
  return useQuery({
    queryKey: ['team-member', userId],
    queryFn: () => authApi.isTeamMember(),
    enabled: userId !== undefined,
    staleTime: 60_000,
  });
}

/** Скидає весь клієнтський кеш і робить користувача гостем (вихід, кінець сесії). */
export function useEndSession(): () => void {
  const client = useQueryClient();
  return () => {
    client.clear();
    client.setQueryData<UserDto | null>(SESSION_KEY, null);
  };
}
