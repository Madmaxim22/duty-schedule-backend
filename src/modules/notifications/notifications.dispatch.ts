import { prisma } from '../../lib/prisma.js';
import { formatSurnameWithInitials } from '../../lib/format-name.js';
import {
  dutyChangePayload,
  formatDutyChangeForAdmin,
  formatDutyChangeForUser,
} from './notification-messages.js';

export async function notifyPhotoLike(photoLikeId: string): Promise<void> {
  const like = await prisma.photoLike.findUnique({
    where: { id: photoLikeId },
    include: {
      liker: { select: { id: true, fullName: true } },
      photo: { select: { userId: true } },
    },
  });
  if (!like || like.photo.userId === like.likerId) return;

  const existing = await prisma.notification.findUnique({
    where: { photoLikeId },
  });
  if (existing) return;

  await prisma.notification.create({
    data: {
      userId: like.photo.userId,
      type: 'photo_like',
      body: `${formatSurnameWithInitials(like.liker.fullName)} оценил(а) ваше фото`,
      actorUserId: like.likerId,
      photoLikeId,
      payload: { photoId: like.photoId },
    },
  });
}

export async function notifyDutyAssignmentChange(changeId: string): Promise<void> {
  const change = await prisma.dutyAssignmentChange.findUnique({
    where: { id: changeId },
    include: {
      previousUser: { select: { id: true, fullName: true } },
      newUser: { select: { id: true, fullName: true } },
    },
  });
  if (!change) return;

  const admins = await prisma.user.findMany({
    where: { role: 'admin', status: 'approved' },
    select: { id: true },
  });

  const payload = dutyChangePayload(change);
  const messages = new Map<string, string>();

  if (change.previousUserId) {
    const body = formatDutyChangeForUser(change, change.previousUserId);
    if (body) messages.set(change.previousUserId, body);
  }
  if (change.newUserId) {
    const body = formatDutyChangeForUser(change, change.newUserId);
    if (body) messages.set(change.newUserId, body);
  }

  const adminBody = formatDutyChangeForAdmin(change);
  for (const admin of admins) {
    if (!messages.has(admin.id)) {
      messages.set(admin.id, adminBody);
    }
  }

  const existing = await prisma.notification.findMany({
    where: { dutyAssignmentChangeId: changeId },
    select: { userId: true },
  });
  const existingUserIds = new Set(existing.map((n) => n.userId));

  const toCreate = [...messages.entries()]
    .filter(([userId]) => !existingUserIds.has(userId))
    .map(([userId, body]) => ({
      userId,
      type: 'duty_change' as const,
      body,
      dutyAssignmentChangeId: changeId,
      payload,
    }));

  if (toCreate.length > 0) {
    await prisma.notification.createMany({ data: toCreate });
  }
}

export async function notifyAdminsUserRegistration(newUser: {
  id: string;
  fullName: string;
  email: string;
}): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: 'admin', status: 'approved' },
    select: { id: true },
  });
  if (admins.length === 0) return;

  const body = `Новая заявка: ${formatSurnameWithInitials(newUser.fullName)} (${newUser.email})`;
  const payload = { userId: newUser.id };

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      type: 'user_registration' as const,
      body,
      payload,
    })),
  });
}

export function dispatchNotification(task: () => Promise<void>): void {
  void task().catch((err) => console.error('[notifications]', err));
}
