import type {
  ListResponse,
  MyRegistrationDto,
  PublicEventDto,
  PublicEventSummary,
} from '@yet-to-be/shared';
import { request } from '../../shared/api/http';

const query = (params: Record<string, string | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined) search.set(key, value);
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
};

export const eventsApi = {
  // Публічні запити не вимагають сесії: гість не переадресовується на вхід.
  list: (cursor?: string) =>
    request<ListResponse<PublicEventSummary>>(`/events${query({ cursor, limit: '12' })}`, {
      onUnauthorized: 'ignore',
    }),
  get: (slug: string) =>
    request<PublicEventDto>(`/events/${encodeURIComponent(slug)}`, { onUnauthorized: 'ignore' }),
  register: (id: string) =>
    request<MyRegistrationDto>(`/events/${encodeURIComponent(id)}/registrations`, {
      method: 'POST',
    }),
  cancel: (id: string) =>
    request<undefined>(`/events/${encodeURIComponent(id)}/registrations/me`, {
      method: 'DELETE',
    }),
  mine: () => request<ListResponse<MyRegistrationDto>>('/users/me/registrations?limit=100'),
};

export const EVENTS_KEY = ['events'] as const;
export const eventKey = (slug: string) => ['event', slug] as const;
export const MY_REGISTRATIONS_KEY = ['my-registrations'] as const;

const DATE = new Intl.DateTimeFormat('uk-UA', { dateStyle: 'long', timeStyle: 'short' });

/** Дата в часовому поясі події (а не браузера): так її бачить організатор. */
export function formatEventDate(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('uk-UA', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone,
    }).format(new Date(iso));
  } catch {
    return DATE.format(new Date(iso));
  }
}
