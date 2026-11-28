import { z } from 'zod';
import { emailSchema } from './auth';
import { paginationQuerySchema } from './pagination';
import { keySchema, safeText } from './text';

export const USER_STATUSES = ['active', 'blocked'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

/** Пошук користувачів: за початком імені АБО за точним email (через blind index). */
export const adminUserQuerySchema = paginationQuerySchema
  .extend({
    status: userStatusSchema.optional(),
    role: keySchema.optional(),
    q: safeText({ min: 1, max: 50 }).optional(),
    email: emailSchema.optional(),
  })
  .refine((value) => value.q === undefined || value.email === undefined, {
    path: ['email'],
    error: 'Use either q or email',
  });
export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const blockUserSchema = z.strictObject({ reason: safeText({ min: 10, max: 500 }) });
export type BlockUserInput = z.infer<typeof blockUserSchema>;

export const adminUserDtoSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  status: userStatusSchema,
  roles: z.array(z.string()),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  blockedAt: z.string().nullable(),
});
export type AdminUserDto = z.infer<typeof adminUserDtoSchema>;

/** Картка користувача. email — лише з правом users:read_pii (і кожен перегляд пишеться в журнал). */
export const adminUserDetailDtoSchema = adminUserDtoSchema.extend({
  email: z.string().nullable(),
  blockReason: z.string().nullable(),
  mfaEnabled: z.boolean(),
});
export type AdminUserDetailDto = z.infer<typeof adminUserDetailDtoSchema>;
