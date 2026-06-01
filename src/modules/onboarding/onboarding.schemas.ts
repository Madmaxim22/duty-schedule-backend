import { z } from 'zod';

export const releaseAckSchema = z.object({
  releaseId: z.string().min(1),
});

export const achievementsSeenSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  achievementIds: z.array(z.string().min(1)).optional(),
});
