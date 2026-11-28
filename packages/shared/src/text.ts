import { z } from 'zod';

/** Керуючі символи (C0/C1): нульові байти, escape-послідовності тощо. */
const CONTROL_CHARS = /\p{Cc}/u;
/**
 * Символи, якими підробляють вигляд тексту: перемикачі напрямку (Trojan Source, U+202A–202E,
 * U+2066–2069), невидимі нульової ширини (U+200B–200D, U+2060) і BOM (U+FEFF).
 */
const DECEPTIVE_CHARS = /[\u202A-\u202E\u2066-\u2069\u200B-\u200D\u2060\uFEFF]/u;

export interface SafeTextOptions {
  min?: number;
  max: number;
  /** Дозволити переноси рядків (\n, \r): описи, біо. */
  multiline?: boolean;
}

/** Перевірка без схеми: чи безпечний рядок (для повторного використання на сервері). */
export function isSafeText(value: string, multiline = false): boolean {
  const checked = multiline ? value.replaceAll(/[\n\r]/g, '') : value;
  return !CONTROL_CHARS.test(checked) && !DECEPTIVE_CHARS.test(value);
}

/**
 * Текст від користувача: trim, Unicode NFC, обмеження довжини, без керуючих і «невидимих» символів.
 * Довжина рахується ПІСЛЯ нормалізації, тож обійти ліміт складеними символами не вийде.
 */
export function safeText({ min = 0, max, multiline = false }: SafeTextOptions) {
  return z
    .string()
    .max(max * 4)
    .transform((value) => value.trim().normalize('NFC'))
    .pipe(
      z
        .string()
        .min(min)
        .max(max)
        .refine((value) => isSafeText(value, multiline), 'Unsafe characters are not allowed'),
    );
}

/** Ключ-ідентифікатор (ролі, теги): латиниця в нижньому регістрі, цифри, `_` і `-`. */
export const keySchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9_-]*$/);
