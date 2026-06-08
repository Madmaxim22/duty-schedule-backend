import { prisma } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/jwt.js';
import { AppError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { toPublicUser } from '../../lib/public-user.js';
import {
  addPhoto,
  deleteCurrentPhoto,
} from '../user-photos/user-photos.service.js';
import { notifyAdminsNewRegistration } from '../push/push.service.js';
import {
  dispatchNotification,
  notifyAdminsUserRegistration,
} from '../notifications/notifications.dispatch.js';

export async function registerUser(input: {
  email: string;
  password: string;
  fullName: string;
}) {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, 'Пользователь с таким email уже существует');
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName.trim(),
      role: 'user',
      status: 'pending',
    },
  });

  void notifyAdminsNewRegistration({
    fullName: user.fullName,
    email: user.email,
  }).catch((err) => console.error('[push]', err));

  dispatchNotification(() =>
    notifyAdminsUserRegistration({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
    }),
  );

  await prisma.authEvent.create({
    data: { type: 'register', userId: user.id },
  });

  return toPublicUser(user);
}

export async function loginUser(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError(401, 'Неверный email или пароль');
  }

  if (user.status === 'pending') {
    throw new AppError(403, 'Аккаунт ожидает подтверждения администратора');
  }

  if (user.status === 'rejected') {
    throw new AppError(403, 'Регистрация отклонена администратором');
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
  });

  const refreshToken = signRefreshToken(user.id);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.refreshTokenDays);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt },
  });

  await prisma.authEvent.create({
    data: { type: 'login', userId: user.id },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastActiveAt: new Date() },
  });

  return { accessToken, refreshToken, user: toPublicUser(user) };
}

export async function refreshSession(refreshToken: string) {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'Недействительный refresh-токен');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError(401, 'Сессия истекла');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== 'approved') {
    throw new AppError(401, 'Пользователь недоступен');
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
  });

  return { accessToken, user: toPublicUser(user) };
}

export async function logoutUser(refreshToken?: string) {
  if (!refreshToken) return;
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, 'Пользователь не найден');
  }
  return toPublicUser(user);
}

export async function uploadUserAvatar(userId: string, sourcePath: string) {
  const { user } = await addPhoto(userId, sourcePath, { setAsCurrent: true });
  return user;
}

export async function deleteUserAvatar(userId: string) {
  return deleteCurrentPhoto(userId);
}

export async function seedAdminIfNeeded() {
  const email = env.adminEmail.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(env.adminPassword),
      fullName: env.adminFullName,
      role: 'admin',
      status: 'approved',
    },
  });
}
