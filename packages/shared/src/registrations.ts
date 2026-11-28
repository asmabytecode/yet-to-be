import { z } from 'zod';
import { paginationQuerySchema } from './pagination';
import { keySchema } from './text';

// ---------- Записи на подію ----------

export const REGISTRATION_STATUSES = ['registered', 'cancelled'] as const;
export const registrationStatusSchema = z.enum(REGISTRATION_STATUSES);
export type RegistrationStatus = z.infer<typeof registrationStatusSchema>;

/** Хто й навіщо скасував запис: сам учасник, організатор чи система (блокування акаунта). */
export const REGISTRATION_CANCEL_REASONS = ['self', 'admin', 'user_blocked'] as const;
export type RegistrationCancelReason = (typeof REGISTRATION_CANCEL_REASONS)[number];

/** Рядок у списку учасників адмінки. Email не показується (окреме право й окремий екран). */
export const adminRegistrationDtoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  displayName: z.string(),
  status: registrationStatusSchema,
  createdAt: z.string(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.enum(REGISTRATION_CANCEL_REASONS).nullable(),
});
export type AdminRegistrationDto = z.infer<typeof adminRegistrationDtoSchema>;

export const registrationQuerySchema = paginationQuerySchema.extend({
  status: registrationStatusSchema.optional(),
});
export type RegistrationQuery = z.infer<typeof registrationQuerySchema>;

// ---------- Публічна частина ----------

/** Відносні URL варіантів зображення (лише готові файли). */
export const publicImageSchema = z.object({
  thumb: z.string().optional(),
  md: z.string().optional(),
  lg: z.string().optional(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
export type PublicImage = z.infer<typeof publicImageSchema>;

/** Блоки для відвідувачів: id файлів замінено на готові URL, внутрішніх полів немає. */
export const publicEventBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), body: z.string() }),
  z.object({
    type: z.literal('agenda_item'),
    time: z.string(),
    title: z.string(),
    description: z.string().nullable(),
  }),
  z.object({
    type: z.literal('speaker'),
    name: z.string(),
    role: z.string().nullable(),
    bio: z.string().nullable(),
    photo: publicImageSchema.nullable(),
  }),
  z.object({ type: z.literal('link'), label: z.string(), url: z.string() }),
]);
export type PublicEventBlock = z.infer<typeof publicEventBlockSchema>;

export const publicEventSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  /** Скасовані події лишаються доступними за посиланням, але не в списку. */
  status: z.enum(['published', 'cancelled']),
  title: z.string(),
  summary: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  timezone: z.string(),
  venueName: z.string().nullable(),
  online: z.boolean(),
  tags: z.array(z.string()),
  cover: publicImageSchema.nullable(),
});
export type PublicEventSummary = z.infer<typeof publicEventSummarySchema>;

export const publicEventDtoSchema = publicEventSummarySchema.extend({
  description: z.string().nullable(),
  address: z.string().nullable(),
  onlineUrl: z.string().nullable(),
  capacity: z.number().int().nullable(),
  /** null — місць без обмежень. */
  spotsLeft: z.number().int().nullable(),
  /** Запис відкритий: подія опублікована, ще не почалась, місця є. */
  registrationOpen: z.boolean(),
  blocks: z.array(publicEventBlockSchema),
});
export type PublicEventDto = z.infer<typeof publicEventDtoSchema>;

/** Публічний список: лише майбутні (або ті, що тривають) опубліковані події. */
export const publicEventQuerySchema = paginationQuerySchema.extend({
  tag: keySchema.optional(),
});
export type PublicEventQuery = z.infer<typeof publicEventQuerySchema>;

/** «Мої записи» в профілі. */
export const myRegistrationDtoSchema = z.object({
  id: z.string(),
  status: registrationStatusSchema,
  createdAt: z.string(),
  event: publicEventSummarySchema,
});
export type MyRegistrationDto = z.infer<typeof myRegistrationDtoSchema>;
