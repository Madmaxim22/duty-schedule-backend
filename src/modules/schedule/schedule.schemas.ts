import { z } from 'zod';

export const monthQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const dateParamSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const putDaySchema = z.object({
  assignments: z.array(
    z.object({
      section: z.enum(['A', 'B']),
      office: z.string(),
      userId: z.string().uuid().nullable(),
    }),
  ),
});
