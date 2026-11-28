import { z } from 'zod';

export * from './admin-users';
export * from './audit';
export * from './auth';
export * from './events';
export * from './iam';
export * from './media';
export * from './mfa';
export * from './pagination';
export * from './registrations';
export * from './text';
export * from './users';

/** Назва застосунку — спільна для API і web. */
export const APP_NAME = 'YET TO BE';

/** Відповідь liveness-ендпоінта (використовується з Етапу 4). */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
