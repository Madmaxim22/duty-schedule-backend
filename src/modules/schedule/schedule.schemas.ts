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

export const importScheduleSchema = z.object({
  replaceFrom: dateParamSchema,
  replaceTo: dateParamSchema,
  records: z.array(
    z.object({
      fio: z.string().min(1),
      info: z
        .array(
          z.object({
            fulldate: z.union([dateParamSchema, z.string()]),
            title: z.union([z.number(), z.string()]),
          }),
        )
        .optional(),
      absence: z
        .array(
          z.object({
            fulldate: z.union([dateParamSchema, z.string()]),
            absenceType: z.string().min(1),
          }),
        )
        .optional(),
    }),
  ),
});

export const changesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
