import webpush from 'web-push';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
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

async function getAdminSubscriptions() {
  return prisma.pushSubscription.findMany({
    where: {
      user: {
        role: 'admin',
        status: 'approved',
      },
    },
  });
}

function isExpiredSubscriptionError(statusCode?: number): boolean {
  return statusCode === 410 || statusCode === 404;
}

export async function notifyAdminsNewRegistration(input: {
  fullName: string;
  email: string;
}) {
  if (!ensureVapid()) {
    if (env.nodeEnv === 'production') {
      console.warn('[push] VAPID keys not configured, skipping notification');
    }
    return;
  }

  const subscriptions = await getAdminSubscriptions();
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    type: 'pending_registration',
    url: '/admin/users',
    title: 'Новая заявка на регистрацию',
    body: `${input.fullName} (${input.email})`,
    fullName: input.fullName,
    email: input.email,
  });

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
        await webpush.sendNotification(pushSubscription, payload, { TTL: 86_400 });
      } catch (err: unknown) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;

        if (isExpiredSubscriptionError(statusCode)) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          return;
        }

        console.error('[push] send failed', sub.endpoint, err);
      }
    }),
  );
}
