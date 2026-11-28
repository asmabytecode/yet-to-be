import { z } from 'zod';
import { paginationQuerySchema } from './pagination';

/** Дозволені формати оригіналу. Усе інше (SVG, GIF, HEIC, PDF, HTML, архіви) відхиляється. */
export const MEDIA_INPUT_TYPES = ['jpeg', 'png', 'webp'] as const;
export type MediaInputType = (typeof MEDIA_INPUT_TYPES)[number];

/** Варіанти, які генерує сервер. Оригінал користувачам не віддається ніколи. */
export const MEDIA_VARIANTS = { thumb: 320, md: 1280, lg: 2048 } as const;
export type MediaVariant = keyof typeof MEDIA_VARIANTS;

export const MEDIA_STATUSES = ['processing', 'ready', 'rejected'] as const;
export const mediaStatusSchema = z.enum(MEDIA_STATUSES);
export type MediaStatus = z.infer<typeof mediaStatusSchema>;

/** Коди причин відхилення (без подробиць, які могли б допомогти обійти перевірку). */
export const MEDIA_REJECT_REASONS = [
  'malware',
  'invalid_image',
  'too_many_pixels',
  'animated',
  'processing_failed',
] as const;
export type MediaRejectReason = (typeof MEDIA_REJECT_REASONS)[number];

export const mediaAssetDtoSchema = z.object({
  id: z.string(),
  status: mediaStatusSchema,
  rejectReason: z.enum(MEDIA_REJECT_REASONS).nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  /** Відносні URL варіантів (лише для ready). */
  variants: z.partialRecord(z.enum(['thumb', 'md', 'lg']), z.string()).nullable(),
  createdAt: z.string(),
});
export type MediaAssetDto = z.infer<typeof mediaAssetDtoSchema>;

export const mediaQuerySchema = paginationQuerySchema.extend({
  status: mediaStatusSchema.optional(),
});
export type MediaQuery = z.infer<typeof mediaQuerySchema>;
