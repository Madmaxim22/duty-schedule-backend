import { prisma } from '../lib/prisma.js';

const THROTTLE_MS = 5 * 60 * 1000;
const lastTouchByUser = new Map<string, number>();

export function touchUserLastActive(userId: string): void {
  const now = Date.now();
  const last = lastTouchByUser.get(userId);
  if (last !== undefined && now - last < THROTTLE_MS) {
    return;
  }
  lastTouchByUser.set(userId, now);

  const threshold = new Date(now - THROTTLE_MS);
  void prisma.user
    .updateMany({
      where: {
        id: userId,
        OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: threshold } }],
      },
      data: { lastActiveAt: new Date() },
    })
    .catch((err) => console.error('[activity]', err));
}
