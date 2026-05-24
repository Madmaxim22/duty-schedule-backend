import { z } from 'zod';

export const messageBodySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Сообщение не может быть пустым')
    .max(2000, 'Сообщение не длиннее 2000 символов'),
});

export const createThreadSchema = messageBodySchema;

export const threadIdParamSchema = z.string().uuid();

export const closeThreadSchema = z.object({
  status: z.literal('closed'),
});

export const adminThreadsQuerySchema = z.object({
  status: z.enum(['open', 'closed']).optional().default('open'),
});
