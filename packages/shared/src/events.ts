import { z } from 'zod';
import { paginationQuerySchema } from './pagination';
import { keySchema, safeText } from './text';

// ---------- Стани й переходи ----------

export const EVENT_STATUSES = ['draft', 'published', 'cancelled', 'archived'] as const;
export const eventStatusSchema = z.enum(EVENT_STATUSES);
export type EventStatus = z.infer<typeof eventStatusSchema>;

export const EVENT_ACTIONS = ['publish', 'unpublish', 'cancel', 'archive'] as const;
export const eventActionSchema = z.enum(EVENT_ACTIONS);
export type EventAction = z.infer<typeof eventActionSchema>;

/**
 * Єдина таблиця дозволених переходів. Модерацію (draft → in_review → published) можна буде
 * додати тут, не чіпаючи решту коду.
 */
export const EVENT_TRANSITIONS: Record<
  EventAction,
  { from: readonly EventStatus[]; to: EventStatus }
> = {
  publish: { from: ['draft'], to: 'published' },
  unpublish: { from: ['published'], to: 'draft' },
  cancel: { from: ['published'], to: 'cancelled' },
  archive: { from: ['draft', 'published', 'cancelled'], to: 'archived' },
};

export function nextStatus(current: EventStatus, action: EventAction): EventStatus | null {
  const rule = EVENT_TRANSITIONS[action];
  return rule.from.includes(current) ? rule.to : null;
}

// ---------- Поля ----------

/** Лише https, без облікових даних у URL (user:pass@host) і довжиною ≤ 2048. */
export const httpsUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .pipe(z.url({ protocol: /^https$/ }))
  // Частина до першого «/», «?» чи «#» — це хост; «@» у ній означає облікові дані (user:pass@host).
  // Пакет shared не залежить від DOM/Node, тому без глобального URL.
  .refine(
    (value) => /^https:\/\/[^\s/?#@]+(?:[/?#]|$)/i.test(value),
    'Only https URLs without credentials are allowed',
  );

export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown time zone');

const isoDateTime = z.iso.datetime({ offset: true });
const tagsSchema = z
  .array(keySchema)
  .max(10)
  .refine((list) => new Set(list).size === list.length, 'Tags must be unique');

const eventFields = {
  title: safeText({ min: 3, max: 140 }),
  summary: safeText({ max: 300 }).nullable(),
  /** Markdown без сирого HTML (рендер на клієнті). */
  description: safeText({ max: 20_000, multiline: true }).nullable(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  timezone: timezoneSchema,
  venueName: safeText({ max: 120 }).nullable(),
  address: safeText({ max: 300 }).nullable(),
  onlineUrl: httpsUrlSchema.nullable(),
  capacity: z.number().int().min(1).max(100_000).nullable(),
  coverAssetId: z.uuid().nullable(),
  tags: tagsSchema,
};

const endsAfterStart = (value: { startsAt?: string | undefined; endsAt?: string | undefined }) =>
  value.startsAt === undefined ||
  value.endsAt === undefined ||
  Date.parse(value.endsAt) > Date.parse(value.startsAt);

export const createEventSchema = z
  .strictObject({
    ...eventFields,
    summary: eventFields.summary.default(null),
    description: eventFields.description.default(null),
    venueName: eventFields.venueName.default(null),
    address: eventFields.address.default(null),
    onlineUrl: eventFields.onlineUrl.default(null),
    capacity: eventFields.capacity.default(null),
    coverAssetId: eventFields.coverAssetId.default(null),
    tags: tagsSchema.default([]),
  })
  .refine(endsAfterStart, { path: ['endsAt'], error: 'endsAt must be after startsAt' });
export type CreateEventInput = z.infer<typeof createEventSchema>;

/** Оновлення: будь-яка підмножина полів + версія, яку бачив редактор (оптимістичне блокування). */
export const updateEventSchema = z
  .strictObject({ ...eventFields, version: z.number().int().min(1) })
  .partial()
  .required({ version: true })
  .refine((value) => Object.keys(value).length > 1, 'At least one field is required')
  .refine(endsAfterStart, { path: ['endsAt'], error: 'endsAt must be after startsAt' });
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const eventTransitionSchema = z.strictObject({
  action: eventActionSchema,
  version: z.number().int().min(1),
});
export type EventTransitionInput = z.infer<typeof eventTransitionSchema>;

// ---------- Блоки наповнення ----------

export const EVENT_BLOCK_TYPES = ['text', 'agenda_item', 'speaker', 'link'] as const;
export type EventBlockType = (typeof EVENT_BLOCK_TYPES)[number];

/** Кожен тип блоку — своя сувора схема (discriminated union): зайві поля → 400. */
export const eventBlockSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('text'),
    data: z.strictObject({ body: safeText({ min: 1, max: 5000, multiline: true }) }),
  }),
  z.strictObject({
    type: z.literal('agenda_item'),
    data: z.strictObject({
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      title: safeText({ min: 1, max: 120 }),
      description: safeText({ max: 500, multiline: true }).optional(),
    }),
  }),
  z.strictObject({
    type: z.literal('speaker'),
    data: z.strictObject({
      name: safeText({ min: 1, max: 80 }),
      role: safeText({ max: 120 }).optional(),
      bio: safeText({ max: 1000, multiline: true }).optional(),
      photoAssetId: z.uuid().optional(),
    }),
  }),
  z.strictObject({
    type: z.literal('link'),
    data: z.strictObject({ label: safeText({ min: 1, max: 80 }), url: httpsUrlSchema }),
  }),
]);
export type EventBlock = z.infer<typeof eventBlockSchema>;

/** Блоки замінюються списком цілком: так одним запитом і додають, і видаляють, і переставляють. */
export const replaceBlocksSchema = z.strictObject({
  version: z.number().int().min(1),
  blocks: z.array(eventBlockSchema).max(50),
});
export type ReplaceBlocksInput = z.infer<typeof replaceBlocksSchema>;

// ---------- Списки й DTO ----------

export const EVENT_SORTS = ['startsAt', '-startsAt', 'createdAt', '-createdAt'] as const;

export const eventQuerySchema = paginationQuerySchema.extend({
  status: eventStatusSchema.optional(),
  q: safeText({ min: 1, max: 100 }).optional(),
  tag: keySchema.optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  sort: z.enum(EVENT_SORTS).default('-createdAt'),
});
export type EventQuery = z.infer<typeof eventQuerySchema>;

export const adminEventDtoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  status: eventStatusSchema,
  title: z.string(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  timezone: z.string(),
  venueName: z.string().nullable(),
  address: z.string().nullable(),
  onlineUrl: z.string().nullable(),
  capacity: z.number().int().nullable(),
  coverAssetId: z.string().nullable(),
  tags: z.array(z.string()),
  publishedAt: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminEventDto = z.infer<typeof adminEventDtoSchema>;

export const adminEventDetailDtoSchema = adminEventDtoSchema.extend({
  blocks: z.array(eventBlockSchema.and(z.object({ id: z.string() }))),
});
export type AdminEventDetailDto = z.infer<typeof adminEventDetailDtoSchema>;
