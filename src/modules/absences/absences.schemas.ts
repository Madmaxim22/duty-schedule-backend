import { z } from 'zod';

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const listAbsencesQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  userId: z.string().uuid().optional(),
});

export const upsertAbsencesSchema = z
  .object({
    userId: z.string().uuid(),
    dateFrom: dateSchema,
    dateTo: dateSchema,
    absenceType: z.string().min(1).max(100),
  })
  .refine((data) => data.dateFrom <= data.dateTo, {
    message: 'dateFrom не может быть позже dateTo',
    path: ['dateTo'],
  });

export const deleteAbsencesSchema = z
  .object({
    userId: z.string().uuid(),
    dateFrom: dateSchema,
    dateTo: dateSchema,
  })
  .refine((data) => data.dateFrom <= data.dateTo, {
    message: 'dateFrom не может быть позже dateTo',
    path: ['dateTo'],
  });
