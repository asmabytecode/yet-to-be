import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';

describe('AppModule', () => {
  // Тестове оточення підставляє test/setup.ts ще до імпорту модулів.
  it('is defined', () => {
    expect(AppModule).toBeDefined();
  });
});
