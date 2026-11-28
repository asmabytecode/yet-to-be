import { z } from 'zod';
import { paginationQuerySchema } from './pagination';

const idLike = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9-]+$/);

export const auditQuerySchema = paginationQuerySchema
  .extend({
    actorId: idLike.optional(),
    action: z
      .string()
      .max(64)
      .regex(/^[a-z0-9_.]+$/)
      .optional(),
    targetType: z
      .string()
      .max(32)
      .regex(/^[a-z_]+$/)
      .optional(),
    targetId: idLike.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .refine((value) => value.from === undefined || value.to === undefined || value.from <= value.to, {
    path: ['to'],
    error: '"to" must not be earlier than "from"',
  });
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditEntryDtoSchema = z.object({
  id: z.string(),
  seq: z.number().int().nullable(),
  action: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  requestId: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditEntryDto = z.infer<typeof auditEntryDtoSchema>;
