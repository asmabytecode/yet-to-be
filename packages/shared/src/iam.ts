import { z } from 'zod';
import { emailSchema } from './auth';
import { keySchema, safeText } from './text';

/**
 * Каталог прав — ЄДИНЕ джерело. Ролі в БД можуть містити лише ключі з цього списку.
 * Нове право додається тут і в матрицю тестів, а owner отримує його автоматично.
 */
export const PERMISSIONS = [
  'events:read',
  'events:write',
  'events:publish',
  'events:delete',
  'registrations:read',
  'registrations:manage',
  'media:write',
  'media:delete',
  'users:read',
  'users:read_pii',
  'users:block',
  'roles:read',
  'roles:manage',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const permissionSchema = z.enum(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/** Системні ролі: створюються міграцією, owner не призначається через API. */
export const SYSTEM_ROLE_KEYS = { OWNER: 'owner', ADMIN: 'admin' } as const;

const permissionListSchema = z
  .array(permissionSchema)
  .min(1)
  .max(PERMISSIONS.length)
  .refine((list) => new Set(list).size === list.length, 'Permissions must be unique');

export const createRoleSchema = z.strictObject({
  key: keySchema,
  name: safeText({ min: 2, max: 60 }),
  description: safeText({ max: 300 }).optional(),
  permissions: permissionListSchema,
  requiresMfa: z.boolean().default(false),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z
  .strictObject({
    name: safeText({ min: 2, max: 60 }),
    description: safeText({ max: 300 }).nullable(),
    permissions: permissionListSchema,
    requiresMfa: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

/** Видати роль існуючому користувачу за email (запрошень немає: користувач реєструється сам). */
export const grantRoleSchema = z.strictObject({
  email: emailSchema,
  roleId: z.uuid(),
});
export type GrantRoleInput = z.infer<typeof grantRoleSchema>;

export const roleDtoSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  requiresMfa: z.boolean(),
  permissions: z.array(permissionSchema),
  memberCount: z.number().int(),
  createdAt: z.string(),
});
export type RoleDto = z.infer<typeof roleDtoSchema>;

export const memberDtoSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  roles: z.array(z.object({ id: z.string(), key: z.string(), name: z.string() })),
});
export type MemberDto = z.infer<typeof memberDtoSchema>;

/** Права поточного користувача — для UI (сховати недоступне). Сервер перевіряє сам. */
export const accessDtoSchema = z.object({
  roles: z.array(z.string()),
  permissions: z.array(permissionSchema),
  isOwner: z.boolean(),
});
export type AccessDto = z.infer<typeof accessDtoSchema>;
