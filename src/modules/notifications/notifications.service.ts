import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

const actorSelect = {
  id: true,
  fullName: true,
  avatarUrl: true,
} as const;

function mapNotification(row: {
  id: string;
  type: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  payload: unknown;
  actor: { id: string; fullName: string; avatarUrl: string | null } | null;
}) {
  return {
    id: row.id,
    type: row.type,
    body: row.body,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    payload: row.payload ?? null,
    actor: row.actor,
  };
}

export async function listNotifications(userId: string, limit: number, cursor?: string) {
  const take = Math.min(Math.max(limit, 1), 100);

  let cursorWhere: object | undefined;
  if (cursor) {
    const [createdAtStr, id] = cursor.split('|');
    if (!createdAtStr || !id) {
      throw new AppError(400, 'Некорректный cursor');
    }
    const createdAt = new Date(createdAtStr);
    cursorWhere = {
      OR: [
        { createdAt: { lt: createdAt } },
        { AND: [{ createdAt }, { id: { lt: id } }] },
      ],
    };
  }

  const rows = await prisma.notification.findMany({
    where: { userId, ...(cursorWhere ? cursorWhere : {}) },
    take: take + 1,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { actor: { select: actorSelect } },
  });

  const hasMore = rows.length > take;
  const items = (hasMore ? rows.slice(0, take) : rows).map(mapNotification);
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? `${last.createdAt}|${last.id}` : null;

  return { notifications: items, nextCursor };
}

export async function getUnreadCount(userId: string) {
  const count = await prisma.notification.count({
    where: { userId, readAt: null },
  });
  return { count };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    throw new AppError(404, 'Оповещение не найдено');
  }
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
