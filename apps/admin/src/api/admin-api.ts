import type {
  AccessDto,
  AdminEventDetailDto,
  AdminEventDto,
  AdminRegistrationDto,
  AdminUserDetailDto,
  AdminUserDto,
  AuditEntryDto,
  CreateEventInput,
  CreateRoleInput,
  EventBlock,
  EventTransitionInput,
  ListResponse,
  MediaAssetDto,
  MemberDto,
  MfaEnableResponse,
  MfaSetupResponse,
  MfaStatus,
  MfaVerifyInput,
  Permission,
  RoleDto,
  UpdateEventInput,
  UpdateRoleInput,
  UserDto,
} from '@yet-to-be/shared';
import { request } from '@yet-to-be/ui';

export interface AdminSession {
  user: UserDto;
  access: AccessDto;
}

type QueryValue = string | number | undefined | null;

/** Рядок запиту з непорожніх значень (сервер усе одно перевіряє allowlist параметрів). */
export function toQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

const json = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown) =>
  body === undefined ? { method } : { method, body };

export const adminApi = {
  session: () => request<AdminSession>('/auth/session', { onUnauthorized: 'ignore' }),

  mfa: {
    status: () => request<MfaStatus>('/auth/mfa'),
    setup: () => request<MfaSetupResponse>('/auth/mfa/setup', json('POST')),
    enable: (code: string) =>
      request<MfaEnableResponse>('/auth/mfa/enable', json('POST', { code })),
    verify: (input: MfaVerifyInput) => request<undefined>('/auth/mfa/verify', json('POST', input)),
    disable: (code: string) => request<undefined>('/auth/mfa/disable', json('POST', { code })),
    stepUp: (password: string) => request<undefined>('/auth/step-up', json('POST', { password })),
  },

  roles: {
    list: () => request<ListResponse<RoleDto>>('/admin/roles'),
    catalog: () => request<{ permissions: Permission[] }>('/admin/roles/catalog'),
    create: (input: CreateRoleInput) => request<RoleDto>('/admin/roles', json('POST', input)),
    update: (id: string, input: UpdateRoleInput) =>
      request<RoleDto>(`/admin/roles/${id}`, json('PATCH', input)),
    remove: (id: string) => request<undefined>(`/admin/roles/${id}`, json('DELETE')),
  },

  members: {
    list: (cursor?: string) =>
      request<ListResponse<MemberDto>>(`/admin/members${toQuery({ cursor, limit: 50 })}`),
    grant: (email: string, roleId: string) =>
      request<undefined>('/admin/members', json('POST', { email, roleId })),
    revoke: (userId: string, roleId: string) =>
      request<undefined>(`/admin/members/${userId}/roles/${roleId}`, json('DELETE')),
  },

  users: {
    list: (params: Record<string, QueryValue>) =>
      request<ListResponse<AdminUserDto>>(`/admin/users${toQuery(params)}`),
    get: (id: string) => request<AdminUserDetailDto>(`/admin/users/${id}`),
    block: (id: string, reason: string) =>
      request<undefined>(`/admin/users/${id}/block`, json('POST', { reason })),
    unblock: (id: string) => request<undefined>(`/admin/users/${id}/unblock`, json('POST')),
  },

  audit: {
    list: (params: Record<string, QueryValue>) =>
      request<ListResponse<AuditEntryDto>>(`/admin/audit${toQuery(params)}`),
  },

  media: {
    list: (params: Record<string, QueryValue>) =>
      request<ListResponse<MediaAssetDto>>(`/admin/media${toQuery(params)}`),
    get: (id: string) => request<MediaAssetDto>(`/admin/media/${id}`),
    upload: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return request<MediaAssetDto>('/admin/media', { method: 'POST', body: form });
    },
    remove: (id: string) => request<undefined>(`/admin/media/${id}`, json('DELETE')),
  },

  events: {
    list: (params: Record<string, QueryValue>) =>
      request<ListResponse<AdminEventDto>>(`/admin/events${toQuery(params)}`),
    get: (id: string) => request<AdminEventDetailDto>(`/admin/events/${id}`),
    /** Ключ ідемпотентності: подвійний клік не створить дві події. */
    create: (input: CreateEventInput, idempotencyKey: string) =>
      request<AdminEventDetailDto>('/admin/events', {
        method: 'POST',
        body: input,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    update: (id: string, input: UpdateEventInput) =>
      request<AdminEventDto>(`/admin/events/${id}`, json('PATCH', input)),
    replaceBlocks: (id: string, version: number, blocks: EventBlock[]) =>
      request<AdminEventDetailDto>(`/admin/events/${id}/blocks`, json('PUT', { version, blocks })),
    transition: (id: string, input: EventTransitionInput) =>
      request<AdminEventDto>(`/admin/events/${id}/transition`, json('POST', input)),
    duplicate: (id: string) =>
      request<AdminEventDetailDto>(`/admin/events/${id}/duplicate`, json('POST')),
    remove: (id: string) => request<undefined>(`/admin/events/${id}`, json('DELETE')),
    registrations: (id: string, cursor?: string) =>
      request<ListResponse<AdminRegistrationDto>>(
        `/admin/events/${id}/registrations${toQuery({ cursor, limit: 100 })}`,
      ),
    cancelRegistration: (id: string, registrationId: string) =>
      request<undefined>(
        `/admin/events/${id}/registrations/${registrationId}/cancel`,
        json('POST'),
      ),
  },
};

/** Ключі кешу TanStack Query: в одному місці, щоб інвалідація була передбачуваною. */
export const keys = {
  session: ['session'] as const,
  mfa: ['mfa'] as const,
  roles: ['roles'] as const,
  catalog: ['roles', 'catalog'] as const,
  members: ['members'] as const,
  users: (params: object) => ['users', params] as const,
  user: (id: string) => ['user', id] as const,
  audit: (params: object) => ['audit', params] as const,
  media: (params: object) => ['media', params] as const,
  events: (params: object) => ['events', params] as const,
  event: (id: string) => ['event', id] as const,
  registrations: (id: string) => ['registrations', id] as const,
};
