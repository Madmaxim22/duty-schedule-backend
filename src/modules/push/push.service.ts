import webpush from 'web-push';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { deliverFcmPush, getFcmTokensForUsers, isFcmEnabled } from './push.fcm.js';
import type { PushSubscriptionInput } from './push.schemas.js';

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  if (!env.vapidPublicKey || !env.vapidPrivateKey) {
    return false;
  }
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
  vapidConfigured = true;
  return true;
}

export function isPushEnabled(): boolean {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey);
}

export function getVapidPublicKey(): string | null {
  return env.vapidPublicKey || null;
}

export { isFcmEnabled } from './push.fcm.js';

export async function saveSubscription(userId: string, input: PushSubscriptionInput) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    },
    update: {
      userId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    },
  });
}

export async function removeSubscription(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({
    where: { userId, endpoint },
  });
}

async function getSubscriptionsForUserIds(userIds: string[]) {
  if (userIds.length === 0) return [];
  return prisma.pushSubscription.findMany({
    where: {
      userId: { in: [...new Set(userIds)] },
      user: { status: 'approved' },
    },
  });
}

export type PushMessage = {
  type: string;
  title: string;
  body: string;
  url: string;
  /** Notification tag in the system shade (e.g. per chat room). */
  tag?: string;
};

async function deliverWebPush(
  subscriptions: Awaited<ReturnType<typeof getSubscriptionsForUserIds>>,
  payload: PushMessage,
) {
  if (!ensureVapid() || subscriptions.length === 0) return;

  const json = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, json, { TTL: 86_400 });
      } catch (err: unknown) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;

        if (isExpiredSubscriptionError(statusCode)) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          return;
        }

        console.error('[push:web] send failed', sub.endpoint, err);
      }
    }),
  );
}

export async function sendPushToUsers(userIds: string[], message: PushMessage): Promise<void> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return;

  const [subscriptions, fcmTokens] = await Promise.all([
    getSubscriptionsForUserIds(uniqueIds),
    getFcmTokensForUsers(uniqueIds),
  ]);

  await Promise.all([
    deliverWebPush(subscriptions, message),
    deliverFcmPush(fcmTokens, message),
  ]);
}

export async function sendPushToUser(userId: string, message: PushMessage): Promise<void> {
  return sendPushToUsers([userId], message);
}

function isExpiredSubscriptionError(statusCode?: number): boolean {
  return statusCode === 410 || statusCode === 404;
}

export async function notifyAdminsNewRegistration(input: {
  fullName: string;
  email: string;
}) {
  const hasWeb = isPushEnabled();
  const hasFcm = isFcmEnabled();

  if (!hasWeb && !hasFcm) {
    if (env.nodeEnv === 'production') {
      console.warn('[push] VAPID and FCM not configured, skipping notification');
    }
    return;
  }

  const admins = await prisma.user.findMany({
    where: { role: 'admin', status: 'approved' },
    select: { id: true },
  });

  if (admins.length === 0) return;

  await sendPushToUsers(admins.map((a) => a.id), {
    type: 'pending_registration',
    url: '/admin/users',
    title: 'Новая заявка на регистрацию',
    body: `${input.fullName} (${input.email})`,
  });
}
