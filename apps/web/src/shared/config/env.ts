import { z } from 'zod';

/**
 * Єдина схема публічних змінних фронтенду. У бандл потрапляє лише VITE_PUBLIC_*
 * (див. envPrefix у vite.config.ts) — секретів тут бути не може.
 */
const webEnvSchema = z.object({
  VITE_PUBLIC_APP_NAME: z.string().min(1).default('YET TO BE'),
});

export type WebEnv = z.output<typeof webEnvSchema>;

export function parseWebEnv(raw: Record<string, unknown>): WebEnv {
  return webEnvSchema.parse(raw);
}

export const webEnv: WebEnv = parseWebEnv(import.meta.env);
