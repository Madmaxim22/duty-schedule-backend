import { z } from 'zod';

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const fcmSubscribeSchema = z.object({
  token: z.string().min(32).max(4096),
  platform: z.enum(['android', 'ios']).optional(),
});

export const fcmUnsubscribeSchema = z.object({
  token: z.string().min(32).max(4096),
});

export type FcmSubscribeInput = z.infer<typeof fcmSubscribeSchema>;
