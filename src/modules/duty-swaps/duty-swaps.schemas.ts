import { z } from 'zod';

const dutySlotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате YYYY-MM-DD'),
  section: z.enum(['A', 'B']),
  office: z.string().min(1),
});

export const createDutySwapSchema = z.object({
  requesterSlot: dutySlotSchema,
  counterpartySlot: dutySlotSchema,
  reason: z.string().trim().min(3, 'Укажите причину (минимум 3 символа)').max(1000),
});

export const dutySwapIdParamSchema = z.string().uuid();

export const listMineQuerySchema = z.object({
  role: z.enum(['outgoing', 'incoming', 'all']).optional().default('all'),
  status: z
    .enum([
      'pending_counterparty',
      'rejected_counterparty',
      'pending_admin',
      'approved',
      'rejected_admin',
      'cancelled',
    ])
    .optional(),
});

export const counterpartyRespondSchema = z.object({
  action: z.enum(['accept', 'reject']),
  rejectReason: z.string().trim().max(500).optional(),
});

export const adminReviewSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    adminComment: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal('reject'),
    adminComment: z.string().trim().min(1, 'Укажите комментарий').max(1000),
  }),
]);

export const adminListQuerySchema = z.object({
  status: z
    .enum([
      'pending_admin',
      'approved',
      'rejected_admin',
      'rejected_counterparty',
      'cancelled',
      'all',
    ])
    .optional()
    .default('pending_admin'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
