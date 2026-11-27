import type {
  ChangePasswordInput,
  SessionInfo,
  SetPasswordInput,
  UpdateProfileInput,
  UserDto,
} from '@yet-to-be/shared';
import { request } from '../../shared/api/http';

export const profileApi = {
  update: (body: UpdateProfileInput) => request<UserDto>('/users/me', { method: 'PATCH', body }),
  changePassword: (body: ChangePasswordInput) =>
    request<undefined>('/users/me/password', { method: 'PUT', body }),
  setPassword: (body: SetPasswordInput) =>
    request<undefined>('/users/me/password', { method: 'POST', body }),
  unlinkGoogle: () => request<undefined>('/users/me/oauth/google', { method: 'DELETE' }),
  sessions: () => request<SessionInfo[]>('/users/me/sessions'),
  revokeSession: (id: string) =>
    request<undefined>(`/users/me/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
