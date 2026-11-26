import { describe, expect, it } from 'vitest';
import { parseWebEnv } from './env';

describe('parseWebEnv', () => {
  it('applies the default app name', () => {
    expect(parseWebEnv({}).VITE_PUBLIC_APP_NAME).toBe('YET TO BE');
  });

  it('accepts a custom app name', () => {
    expect(parseWebEnv({ VITE_PUBLIC_APP_NAME: 'Custom' }).VITE_PUBLIC_APP_NAME).toBe('Custom');
  });

  it('rejects an empty app name', () => {
    expect(() => parseWebEnv({ VITE_PUBLIC_APP_NAME: '' })).toThrow();
  });

  it('drops variables that are not part of the schema', () => {
    const parsed = parseWebEnv({ JWT_ACCESS_SECRET: 'x', VITE_PUBLIC_APP_NAME: 'A' });

    expect(parsed).toEqual({ VITE_PUBLIC_APP_NAME: 'A' });
  });
});
