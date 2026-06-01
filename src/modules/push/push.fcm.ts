import admin from 'firebase-admin';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import type { PushMessage } from './push.service.js';
import type { FcmSubscribeInput } from './push.schemas.js';

let firebaseReady = false;

export function isFcmEnabled(): boolean {
  if (env.googleApplicationCredentials) return true;
  return Boolean(env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey);
}

function ensureFirebase(): boolean {
  if (firebaseReady) return true;
  if (!isFcmEnabled()) return false;

  if (!admin.apps.length) {
    if (env.googleApplicationCredentials) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: env.firebaseProjectId,
          clientEmail: env.firebaseClientEmail,
          privateKey: env.firebasePrivateKey,
        }),
      });
    }
  }

  firebaseReady = true;
  return true;
}

export async function saveFcmToken(userId: string, input: FcmSubscribeInput) {
  return prisma.fcmDeviceToken.upsert({
    where: { token: input.token },
    create: {
      userId,
      token: input.token,
      platform: input.platform ?? 'android',
    },
    update: {
      userId,
      platform: input.platform ?? 'android',
    },
  });
}

export async function removeFcmToken(userId: string, token: string) {
  await prisma.fcmDeviceToken.deleteMany({
    where: { userId, token },
  });
}

async function getFcmTokensForUserIds(userIds: string[]) {
  if (userIds.length === 0) return [];
  return prisma.fcmDeviceToken.findMany({
    where: {
      userId: { in: [...new Set(userIds)] },
      user: { status: 'approved' },
    },
  });
}

function isInvalidFcmTokenError(code?: string): boolean {
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/invalid-argument'
  );
}

export async function deliverFcmPush(
  tokens: Awaited<ReturnType<typeof getFcmTokensForUserIds>>,
  message: PushMessage,
): Promise<void> {
  if (!ensureFirebase() || tokens.length === 0) return;

  const tokenStrings = tokens.map((t) => t.token);
  const tag = message.tag ?? message.type;

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokenStrings,
      notification: {
        title: message.title,
        body: message.body,
      },
      data: {
        type: message.type,
        url: message.url,
        tag,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'duty_default',
          tag,
        },
      },
    });

    await Promise.all(
      response.responses.map(async (result, index) => {
        if (result.success) return;
        const code = result.error?.code;
        if (isInvalidFcmTokenError(code)) {
          const row = tokens[index];
          if (row) {
            await prisma.fcmDeviceToken.delete({ where: { id: row.id } }).catch(() => {});
          }
          return;
        }
        console.error('[push:fcm] send failed', tokenStrings[index], result.error);
      }),
    );
  } catch (err) {
    console.error('[push:fcm] multicast failed', err);
  }
}

export async function getFcmTokensForUsers(userIds: string[]) {
  return getFcmTokensForUserIds(userIds);
}
