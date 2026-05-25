import { z } from 'zod';

export const messageBodySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Сообщение не может быть пустым')
    .max(2000, 'Сообщение не длиннее 2000 символов'),
});

export const roomIdParamSchema = z.string().uuid();

export const createDirectSchema = z.object({
  userId: z.string().uuid(),
});

export const createGroupSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Укажите название группы')
    .max(80, 'Название не длиннее 80 символов'),
  memberIds: z.array(z.string().uuid()).max(49),
});

export const messagesQuerySchema = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});
