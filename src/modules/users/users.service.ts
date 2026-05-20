import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { removeAvatarFile } from '../../lib/avatar.js';

export async function listPendingUsers() {
  return prisma.user.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      fullName: true,
      avatarUrl: true,
      createdAt: true,
    },
  });
}

export async function listApprovedUsers() {
  return prisma.user.findMany({
    where: { status: 'approved' },
    orderBy: { fullName: 'asc' },
    select: {
      id: true,
      email: true,
      fullName: true,
      avatarUrl: true,
      role: true,
    },
  });
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function listApprovedUsersForDate(dateStr: string) {
  const dutyDate = parseDate(dateStr);

  const users = await prisma.user.findMany({
    where: { status: 'approved' },
    orderBy: { fullName: 'asc' },
    select: {
      id: true,
      email: true,
      fullName: true,
      avatarUrl: true,
      role: true,
      absences: {
        where: { absenceDate: dutyDate },
        take: 1,
        select: { absenceType: true },
      },
    },
  });

  return users.map(({ absences, ...user }) => {
    const absence = absences[0];
    return {
      ...user,
      isAbsent: Boolean(absence),
      ...(absence ? { absenceType: absence.absenceType } : {}),
    };
  });
}

export async function listAllUsers() {
  return prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    select: {
      id: true,
      email: true,
      fullName: true,
      avatarUrl: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });
}

export async function updateUserStatus(
  userId: string,
  action: 'approve' | 'reject',
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, 'Пользователь не найден');
  }

  if (user.role === 'admin') {
    throw new AppError(400, 'Нельзя изменить статус администратора');
  }

  if (user.status !== 'pending') {
    throw new AppError(400, 'Пользователь уже обработан');
  }

  return prisma.user.update({
    where: { id: userId },
    data: { status: action === 'approve' ? 'approved' : 'rejected' },
    select: {
      id: true,
      email: true,
      fullName: true,
      status: true,
    },
  });
}

export async function deleteUser(userId: string, adminId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'Пользователь не найден');
  if (user.id === adminId) throw new AppError(400, 'Нельзя удалить свою учётную запись');
  if (user.role === 'admin') throw new AppError(400, 'Нельзя удалить администратора');

  await removeAvatarFile(userId);
  await prisma.user.delete({ where: { id: userId } });
}
