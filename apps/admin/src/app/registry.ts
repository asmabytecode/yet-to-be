import type { Permission } from '@yet-to-be/shared';

/**
 * Реєстр розділів адмінки: шлях, пункт меню й потрібні права. Новий розділ = новий запис тут
 * + сторінка в routes.tsx; ядро (меню, гейти) підхоплює його автоматично.
 */
export interface AdminSection {
  path: string;
  /** Ключ у nav.* */
  label: string;
  permissions: Permission[];
}

export const SECTIONS: readonly AdminSection[] = [
  { path: '/', label: 'dashboard', permissions: [] },
  { path: '/events', label: 'events', permissions: ['events:read'] },
  { path: '/media', label: 'media', permissions: ['media:write'] },
  { path: '/users', label: 'users', permissions: ['users:read'] },
  { path: '/team', label: 'team', permissions: ['roles:read'] },
  { path: '/roles', label: 'roles', permissions: ['roles:read'] },
  { path: '/audit', label: 'audit', permissions: ['audit:read'] },
  { path: '/security', label: 'security', permissions: [] },
];
