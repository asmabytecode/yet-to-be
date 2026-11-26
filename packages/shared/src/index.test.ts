import { describe, expect, it } from 'vitest';
import { APP_NAME, healthResponseSchema } from './index';

describe('@yet-to-be/shared', () => {
  it('exports the app name', () => {
    expect(APP_NAME).toBe('YET TO BE');
  });

  it('validates a health response', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok' }).success).toBe(true);
    expect(healthResponseSchema.safeParse({ status: 'down' }).success).toBe(false);
  });
});
