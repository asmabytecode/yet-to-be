import type { LoginInput, RegisterInput, UserDto } from '@yet-to-be/shared';
import { ApiError, request } from '../../shared/api/http';

export const authApi = {
  /** Поточний користувач або null (гість). Невдалий refresh тут не веде на /login. */
  async session(): Promise<UserDto | null> {
    try {
      const { user } = await request<{ user: UserDto }>('/auth/session', { onUnauthorized: 'ignore' });
      return user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  async login(input: LoginInput): Promise<UserDto> {
    return (await request<{ user: UserDto }>('/auth/login', { method: 'POST', body: input })).user;
  },
  async register(input: RegisterInput): Promise<UserDto> {
    return (await request<{ user: UserDto }>('/auth/register', { method: 'POST', body: input })).user;
  },
  logout: () => request<undefined>('/auth/logout', { method: 'POST', onUnauthorized: 'ignore' }),
  logoutAll: () => request<undefined>('/auth/logout-all', { method: 'POST' }),
};
