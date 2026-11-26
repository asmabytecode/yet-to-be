import { z } from 'zod';

/** Назва застосунку — спільна для API і web. */
export const APP_NAME = 'YET TO BE';

/** Відповідь liveness-ендпоінта (використовується з Етапу 4). */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
